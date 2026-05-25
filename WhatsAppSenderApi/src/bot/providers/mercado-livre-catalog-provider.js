import { existsSync } from 'fs'

let stealthApplied = false

async function loadPlaywright(playwrightModule) {
  if (playwrightModule) {
    return playwrightModule
  }

  try {
    const [playwrightExtraModule, stealthPluginModule] = await Promise.all([
      import('playwright-extra'),
      import('puppeteer-extra-plugin-stealth'),
    ])

    const createStealthPlugin = stealthPluginModule.default || stealthPluginModule

    if (!stealthApplied && typeof playwrightExtraModule.chromium?.use === 'function') {
      playwrightExtraModule.chromium.use(createStealthPlugin())
      stealthApplied = true
    }

    return playwrightExtraModule
  } catch (error) {
    try {
      return await import('playwright')
    } catch (playwrightError) {
      throw new Error(`Playwright is not installed for the bot runtime: ${playwrightError.message}`)
    }
  }
}

function normalizeCouponText(value) {
  if (typeof value !== 'string') {
    return null
  }

  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) {
    return null
  }

  return text.replace(/^Cupom\s+/i, '').trim() || null
}

function extractCouponFromPromotions(promotions = []) {
  for (const promotion of promotions) {
    if (promotion?.type !== 'coupon') {
      continue
    }

    const coupon = normalizeCouponText(promotion.text)
    if (coupon) {
      return coupon
    }
  }

  return null
}

function extractCouponFromApiItem(item) {
  return (
    normalizeCouponText(item.coupon) ||
    extractCouponFromPromotions(item.promotions) ||
    extractCouponFromPromotions(item.promotion?.promotions) ||
    normalizeCouponText(item.promotion?.text) ||
    null
  )
}

function normalizeApiItem(item, sourceFilter = null) {
  const salePrice = item.sale_price?.amount

  return {
    id: item.id,
    title: item.title,
    price: salePrice ?? item.price,
    originalPrice: item.original_price ?? null,
    coupon: extractCouponFromApiItem(item),
    currencyId: item.currency_id,
    permalink: item.permalink,
    thumbnailUrl: item.secure_thumbnail || item.thumbnail,
    sourceFilter,
  }
}

function getDiscountPercent(item) {
  if (!(item?.price > 0) || !(item?.originalPrice > item.price)) {
    return 0
  }

  return ((item.originalPrice - item.price) / item.originalPrice) * 100
}

function scorePromotionalItem(item) {
  let score = 0
  const price = Number.isFinite(item?.price) ? item.price : Number.POSITIVE_INFINITY

  if (item?.coupon) score += 35
  if (item?.originalPrice > price) score += 25

  score += Math.min(35, getDiscountPercent(item))

  if (price <= 100) score += 35
  else if (price <= 300) score += 30
  else if (price <= 800) score += 20
  else if (price <= 1500) score += 10
  else if (price <= 3000) score -= 10
  else score -= 30

  return score
}

function sortPromotionalItems(items) {
  return [...items].sort((first, second) => {
    const scoreDifference = scorePromotionalItem(second) - scorePromotionalItem(first)

    if (scoreDifference !== 0) {
      return scoreDifference
    }

    return (first.price ?? Number.POSITIVE_INFINITY) - (second.price ?? Number.POSITIVE_INFINITY)
  })
}

function normalizeFilter(filter) {
  return filter?.trim()
}

function createSearchUrl(filter, offset = 0) {
  const baseUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(filter).replaceAll('%20', '-')}`

  if (offset <= 0) {
    return baseUrl
  }

  return `${baseUrl}_Desde_${offset + 1}_NoIndex_True`
}

function createApiSearchUrl(siteId, filter, limit, offset = 0) {
  const url = new URL(`https://api.mercadolibre.com/sites/${siteId}/search`)
  url.searchParams.set('q', filter)
  url.searchParams.set('limit', String(limit))

  if (offset > 0) {
    url.searchParams.set('offset', String(offset))
  }

  return url.toString()
}

function getRandomDelay(minDelayMs, maxDelayMs, randomInt) {
  const safeMin = Math.max(0, minDelayMs)
  const safeMax = Math.max(safeMin, maxDelayMs)

  if (safeMax === safeMin) {
    return safeMin
  }

  return safeMin + randomInt(safeMax - safeMin + 1)
}

async function waitRandomDelay(minDelayMs, maxDelayMs, randomInt, sleepFn) {
  const delayMs = getRandomDelay(minDelayMs, maxDelayMs, randomInt)

  if (delayMs > 0) {
    await sleepFn(delayMs)
  }
}

async function collectFreshItems(
  pageItems,
  collectedItems,
  targetItemCount,
  {
    isRecentlyPublished = async () => false,
    maxItems = Number.POSITIVE_INFINITY,
  } = {},
) {
  let collectedFromPage = 0

  for (const item of pageItems) {
    if (!item?.id) {
      continue
    }

    if (await isRecentlyPublished(item)) {
      continue
    }

    collectedItems.push(item)
    collectedFromPage += 1

    if (collectedItems.length >= targetItemCount) {
      return true
    }

    if (collectedFromPage >= maxItems) {
      return false
    }
  }

  return false
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  if (!(timeoutMs > 0)) {
    return fetchImpl(url)
  }

  let timeoutId

  try {
    return await Promise.race([
      fetchImpl(url),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Mercado Livre catalog request timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timeoutId)
  }
}

function shouldUseBrowserFallbackForApiError(error) {
  return /timed out|abort|fetch failed|network/i.test(error?.message || '')
}

function isClosedBrowserError(error) {
  return /target page, context or browser has been closed|browser has been closed/i.test(error?.message || '')
}

function getRawTargetItemCount(targetItemCount) {
  if (!Number.isFinite(targetItemCount)) {
    return Number.POSITIVE_INFINITY
  }

  const safeTarget = Math.max(1, targetItemCount)
  return Math.max(safeTarget * 2 + 2, safeTarget)
}

export async function createPlaywrightCatalogSearchSession({
  playwrightModule,
  headless = true,
  channel = 'chrome',
  executablePath = '',
  storageStatePath = '',
  userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  viewport = { width: 1440, height: 960 },
  timeoutMs = 30000,
  minDelayMs = 1500,
  maxDelayMs = 4000,
  randomInt = (max) => Math.floor(Math.random() * max),
  sleepFn = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
} = {}) {
  const playwright = await loadPlaywright(playwrightModule)
  const browser = await playwright.chromium.launch({
    headless,
    channel,
    executablePath: executablePath || undefined,
  })

  const context = await browser.newContext({
    userAgent,
    viewport,
    storageState: storageStatePath && existsSync(storageStatePath) ? storageStatePath : undefined,
  })

  const page = await context.newPage()
  page.setDefaultTimeout(timeoutMs)

  return {
    async search(filter, limit, { offset = 0 } = {}) {
      await waitRandomDelay(minDelayMs, maxDelayMs, randomInt, sleepFn)
      await page.goto(createSearchUrl(filter, offset), { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      await waitRandomDelay(minDelayMs, maxDelayMs, randomInt, sleepFn)

      return page.evaluate(({ resultLimit, sourceFilter }) => {
        function parsePriceFromElement(element) {
          const fraction = element?.querySelector('.andes-money-amount__fraction')?.textContent?.trim()
          if (!fraction) {
            return null
          }

          const cents = element.querySelector('.andes-money-amount__cents')?.textContent?.trim() || '0'
          return Number.parseFloat(`${fraction.replaceAll('.', '')}.${cents}`)
        }

        function extractCouponFromCard(card) {
          const texts = Array.from(card.querySelectorAll('*'))
            .map((element) => element.textContent?.replace(/\s+/g, ' ').trim())
            .filter(Boolean)

          for (const text of texts) {
            if (!/^Cupom\b/i.test(text)) {
              continue
            }

            const coupon = text.replace(/^Cupom\s+/i, '').trim()
            if (coupon) {
              return coupon
            }
          }

          return null
        }

        const cards = Array.from(document.querySelectorAll('.ui-search-result__wrapper, .poly-card'))
        const items = []

        for (const card of cards) {
          if (items.length >= resultLimit) {
            break
          }

          const anchor = card.querySelector('a[href*="/p/MLB"]')
          if (!anchor) {
            continue
          }

          const permalink = anchor.href?.split('#')[0]
          const idMatch = permalink?.match(/\/p\/(MLB\d+)/)
          const title = anchor.textContent?.trim()

          const currentPriceElement = card.querySelector('.poly-price__current .andes-money-amount') || card.querySelector('.andes-money-amount:not(.andes-money-amount--previous)')
          const previousPriceElement = card.querySelector('.andes-money-amount--previous')
          const currentPrice = parsePriceFromElement(currentPriceElement)
          const originalPrice = parsePriceFromElement(previousPriceElement)
          const currency = card.querySelector('.andes-money-amount__currency-symbol')?.textContent?.includes('$')
            ? 'BRL'
            : 'BRL'

          if (!permalink || !idMatch || !title || currentPrice === null) {
            continue
          }

          items.push({
            id: idMatch[1],
            title,
            price: currentPrice,
            originalPrice,
            coupon: extractCouponFromCard(card),
            currencyId: currency,
            permalink,
            thumbnailUrl: card.querySelector('img')?.getAttribute('src') || '',
            sourceFilter,
          })
        }

        return items
      }, { resultLimit: limit, sourceFilter: filter })
    },
    async close() {
      if (storageStatePath) {
        await context.storageState({ path: storageStatePath }).catch(() => {})
      }

      await context.close()
      await browser.close()
    },
  }
}

export function createMercadoLivreCatalogProvider({
  siteId = 'MLB',
  limitPerFilter = 20,
  fetchImpl = fetch,
  apiTimeoutMs = 15000,
  createSearchSession = createPlaywrightCatalogSearchSession,
  randomInt = (max) => Math.floor(Math.random() * max),
  playwrightModule,
  headless = true,
  channel = 'chrome',
  executablePath = '',
  storageStatePath = 'sessions/mercado-livre-catalog-storage-state.json',
  userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  timeoutMs = 30000,
  minDelayMs = 1500,
  maxDelayMs = 4000,
  maxPagesPerFilter = 5,
  forceBrowserFallback = false,
} = {}) {
  let searchSessionPromise

  async function resetSearchSession() {
    if (!searchSessionPromise) {
      return
    }

    try {
      const searchSession = await searchSessionPromise
      await searchSession.close?.()
    } catch {}

    searchSessionPromise = undefined
  }

  async function getSearchSession() {
    if (!searchSessionPromise) {
      searchSessionPromise = createSearchSession({
        playwrightModule,
        headless,
        channel,
        executablePath,
        storageStatePath,
        userAgent,
        timeoutMs,
        minDelayMs,
        maxDelayMs,
        randomInt,
      })
    }

    return searchSessionPromise
  }

  return {
    async search(filters, {
      targetItemCount = Number.POSITIVE_INFINITY,
      isRecentlyPublished = async () => false,
    } = {}) {
      const normalizedFilters = filters.map(normalizeFilter).filter(Boolean)
      const items = []
      const shouldPageDeeply = Number.isFinite(targetItemCount)
      const pageLimit = shouldPageDeeply ? maxPagesPerFilter : 1
      const rawTargetItemCount = getRawTargetItemCount(targetItemCount)
      const maxItemsPerFilterPage = shouldPageDeeply && normalizedFilters.length
        ? Math.max(1, Math.ceil(rawTargetItemCount / normalizedFilters.length))
        : Number.POSITIVE_INFINITY

      for (let pageIndex = 0; pageIndex < pageLimit; pageIndex += 1) {
        let collectedInRound = false
        let reachedTargetInRound = false

        for (const filter of normalizedFilters) {
          const offset = pageIndex * limitPerFilter
          let pageItems = []
          let shouldUseBrowserFallback = forceBrowserFallback

          if (!forceBrowserFallback) {
            try {
              const response = await fetchWithTimeout(
                fetchImpl,
                createApiSearchUrl(siteId, filter, limitPerFilter, offset),
                apiTimeoutMs,
              )

              if (response.ok) {
                const payload = await response.json()
                pageItems = sortPromotionalItems(
                  (payload.results ?? []).map((item) => normalizeApiItem(item, filter)),
                )
              } else if (response.status !== 403) {
                throw new Error(`Mercado Livre catalog request failed with status ${response.status}`)
              } else {
                shouldUseBrowserFallback = true
              }
            } catch (error) {
              if (!shouldUseBrowserFallbackForApiError(error)) {
                throw error
              }

              shouldUseBrowserFallback = true
            }
          }

          if (shouldUseBrowserFallback) {
            try {
              const searchSession = await getSearchSession()
              pageItems = sortPromotionalItems(
                (await searchSession.search(filter, limitPerFilter, { offset })).map((item) => ({
                  ...item,
                  sourceFilter: item.sourceFilter ?? filter,
                })),
              )
            } catch (error) {
              if (!isClosedBrowserError(error)) {
                throw error
              }

              await resetSearchSession()
              const searchSession = await getSearchSession()
              pageItems = sortPromotionalItems(
                (await searchSession.search(filter, limitPerFilter, { offset })).map((item) => ({
                  ...item,
                  sourceFilter: item.sourceFilter ?? filter,
                })),
              )
            }
          }

          if (!pageItems.length) {
            break
          }

          const reachedTarget = await collectFreshItems(
            pageItems,
            items,
            rawTargetItemCount,
            {
              isRecentlyPublished,
              maxItems: maxItemsPerFilterPage,
            },
          )

          collectedInRound = true

          if (reachedTarget || pageItems.length < limitPerFilter) {
            if (reachedTarget) {
              reachedTargetInRound = true
              break
            }

            continue
          }
        }

        if (reachedTargetInRound || !collectedInRound || items.length >= rawTargetItemCount) {
          break
        }
      }

      return {
        termsProcessed: normalizedFilters.length,
        rawItemsFound: items.length,
        items,
      }
    },
    async close() {
      await resetSearchSession()
    },
  }
}
