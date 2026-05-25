import { existsSync } from 'fs'

const MAX_AMAZON_PROMOTIONAL_PRICE = 1500

async function loadPlaywright(playwrightModule) {
  if (playwrightModule) {
    return playwrightModule
  }

  try {
    return await import('playwright')
  } catch (error) {
    throw new Error(`Playwright is not installed for the Amazon catalog runtime: ${error.message}`)
  }
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function randomDelay(minDelayMs, maxDelayMs, randomInt) {
  const min = Math.max(0, minDelayMs)
  const max = Math.max(min, maxDelayMs)
  return min === max ? min : min + randomInt(max - min + 1)
}

async function waitRandomDelay(minDelayMs, maxDelayMs, randomInt, sleepFn) {
  const delayMs = randomDelay(minDelayMs, maxDelayMs, randomInt)

  if (delayMs > 0) {
    await sleepFn(delayMs)
  }
}

function shuffleItems(items, randomInt) {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}

function normalizeText(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
    : ''
}

function normalizePermalink(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return ''
  }

  try {
    const url = new URL(value)
    url.hash = ''
    url.search = ''
    return url.toString()
  } catch {
    return value.trim()
  }
}

function parseDiscountPercent(price, originalPrice) {
  if (!(price > 0) || !(originalPrice > price)) {
    return null
  }

  return Math.round(((originalPrice - price) / originalPrice) * 100)
}

function normalizeCouponText(value) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : ''
}

function extractCouponValue(text) {
  const normalized = normalizeCouponText(text)
  const match = normalized.match(/R\$\s*\d+(?:[\.,]\d{2})?\s*(?:off|OFF|de desconto|em cupom)/i)
  return match?.[0]?.replace(/\s+/g, ' ').trim() || null
}

function extractCouponCode(text) {
  const normalized = normalizeCouponText(text)
  const patterns = [
    /(?:insira|use|utilize|aplique|inform[eé])\s+(?:o\s+)?c[oó]digo\s+([A-Z0-9][A-Z0-9_-]{3,24})/i,
    /c[oó]digo\s*:?\s*([A-Z0-9][A-Z0-9_-]{3,24})/i,
  ]

  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      return match[1].toUpperCase()
    }
  }

  return null
}

function isCouponCandidate(text) {
  if (/taxas de importa[cç][aã]o|comprar agora|adicionar ao carrinho|subtotal|quantidade/i.test(text)) {
    return false
  }

  return /aplicar cupom|resgatar|insira o c[oó]digo|c[oó]digo\s*:|R\$\s*\d+(?:[\.,]\d{2})?\s*(?:off|OFF|de desconto|em cupom)/i.test(text)
}

function buildCouponSnippets(text) {
  const normalized = normalizeCouponText(text)
  const snippets = []
  const pattern = /R\$\s*\d+(?:[\.,]\d{2})?\s*(?:off|OFF|de desconto|em cupom)\.?\s*Insira\s+o\s+c[oó]digo\s+[A-Z0-9][A-Z0-9_-]{3,24}.*?(?=(?:Termos|R\$\s*\d+(?:[\.,]\d{2})?\s*(?:off|OFF|de desconto|em cupom)|$))/gi

  for (const match of normalized.matchAll(pattern)) {
    snippets.push(match[0].replace(/\s*Termos\s*$/i, '').replace(/\s+/g, ' ').replace(/off\.Insira/i, 'off. Insira').trim())
  }

  if (snippets.length) {
    return snippets
  }

  return [normalized]
}

export function extractAmazonCouponsFromTexts(texts = []) {
  const coupons = []
  const seen = new Set()

  for (const value of texts) {
    for (const couponText of buildCouponSnippets(value)) {
      if (!couponText || !isCouponCandidate(couponText)) {
        continue
      }

      const coupon = {
        coupon_value: extractCouponValue(couponText),
        coupon_code: extractCouponCode(couponText),
        coupon_text: couponText,
      }

      if (!coupon.coupon_value && !coupon.coupon_code) {
        continue
      }

      const key = `${coupon.coupon_value || ''}:${coupon.coupon_code || ''}:${coupon.coupon_text}`
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      coupons.push(coupon)

      if (coupons.length >= 2) {
        return coupons
      }
    }
  }

  return coupons
}

function normalizeAmazonItem(item, sourceFilter) {
  const price = Number.isFinite(item.price) ? item.price : null
  const rawOriginalPrice = Number.isFinite(item.originalPrice) ? item.originalPrice : null
  const originalPrice = rawOriginalPrice && price && rawOriginalPrice > price ? rawOriginalPrice : null
  const discountPercent = Number.isFinite(item.discountPercent)
    ? item.discountPercent
    : parseDiscountPercent(price, originalPrice)
  const coupons = Array.isArray(item.coupons) ? item.coupons.slice(0, 2) : []
  const firstCoupon = coupons[0] || {}

  return {
    platform: 'amazon',
    id: item.id,
    title: item.title,
    price,
    originalPrice,
    discountPercent,
    rating: Number.isFinite(item.rating) ? item.rating : null,
    coupon: item.coupon || firstCoupon.coupon_value || firstCoupon.coupon_text || null,
    coupon_value: item.coupon_value || firstCoupon.coupon_value || null,
    coupon_code: item.coupon_code || firstCoupon.coupon_code || null,
    coupon_text: item.coupon_text || firstCoupon.coupon_text || null,
    coupons,
    currencyId: item.currencyId || 'BRL',
    permalink: normalizePermalink(item.permalink),
    thumbnailUrl: item.thumbnailUrl || '',
    sourceFilter: item.sourceFilter || sourceFilter,
  }
}

function buildCollisionKeys(item) {
  return [
    item.id ? `id:${normalizeText(item.id)}` : null,
    item.permalink ? `url:${normalizePermalink(item.permalink)}` : null,
    item.title ? `title:${normalizeText(item.title)}` : null,
  ].filter(Boolean)
}

export function scoreAmazonItem(item) {
  let score = 0

  if (item.coupon) score += 35
  if (item.discountPercent) score += Math.min(40, item.discountPercent)
  if (item.originalPrice && item.price && item.originalPrice > item.price) score += 20
  if (item.rating >= 4.5) score += 20
  else if (item.rating >= 4) score += 10
  if (item.price > 0 && item.price <= 300) score += 15
  else if (item.price > 0 && item.price <= 800) score += 8
  else if (item.price > 1500 && item.price <= 3000) score -= 12
  else if (item.price > 3000) score -= 65

  return score
}

function createSearchUrl(term, pageNumber = 1) {
  const url = new URL('https://www.amazon.com.br/s')
  url.searchParams.set('k', term)
  if (pageNumber > 1) {
    url.searchParams.set('page', String(pageNumber))
  }
  return url.toString()
}

export async function createAmazonPlaywrightSearchSession({
  playwrightModule,
  headless = true,
  channel = 'chrome',
  executablePath = '',
  userDataDir = './sessions/amazon-profile',
  storageStatePath = './sessions/amazon-storage-state.json',
  timeoutMs = 30000,
  minDelayMs = 1500,
  maxDelayMs = 4000,
  randomInt = (max) => Math.floor(Math.random() * max),
  sleepFn = sleep,
  logger = console,
} = {}) {
  const playwright = await loadPlaywright(playwrightModule)
  const launchOptions = {
    headless,
    channel: channel || undefined,
    executablePath: executablePath || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  }

  let browser
  let context

  if (userDataDir) {
    context = await playwright.chromium.launchPersistentContext(userDataDir, launchOptions)
  } else {
    browser = await playwright.chromium.launch(launchOptions)
    context = await browser.newContext(
      storageStatePath && existsSync(storageStatePath)
        ? { storageState: storageStatePath }
        : undefined,
    )
  }

  const page = context.pages()[0] || (await context.newPage())
  page.setDefaultTimeout(timeoutMs)

  return {
    async search(term, { pageNumber = 1, limit = 20 } = {}) {
      await waitRandomDelay(minDelayMs, maxDelayMs, randomInt, sleepFn)
      await page.goto(createSearchUrl(term, pageNumber), { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      await waitRandomDelay(minDelayMs, maxDelayMs, randomInt, sleepFn)

      const pageText = await page.locator('body').innerText().catch(() => '')
      if (/captcha|digite os caracteres|robot check|automated access/i.test(pageText)) {
        logger.warn?.({ event: 'amazon_catalog_page_blocked', term, pageNumber, reason: 'captcha' })
        return []
      }

      return page.evaluate(({ resultLimit, sourceFilter }) => {
        function parseBrazilianPrice(text) {
          if (!text) return null
          const match = text.replace(/\s+/g, ' ').match(/R\$\s*([\d.]+),(\d{2})/)
          if (!match) return null
          return Number.parseFloat(`${match[1].replaceAll('.', '')}.${match[2]}`)
        }

        function parseRating(text) {
          const match = (text || '').replace(',', '.').match(/([0-5](?:\.\d)?)/)
          return match ? Number.parseFloat(match[1]) : null
        }

        const cards = Array.from(document.querySelectorAll('[data-component-type="s-search-result"][data-asin]'))
        const items = []

        for (const card of cards) {
          if (items.length >= resultLimit) break

          const id = card.getAttribute('data-asin')
          const titleElement = card.querySelector('h2 a span, h2 span')
          const title = titleElement?.textContent?.replace(/\s+/g, ' ').trim()
          const anchor = card.querySelector('h2 a[href], a.a-link-normal.s-no-outline[href]')
          const href = anchor?.getAttribute('href')
          const priceText = card.querySelector('.a-price .a-offscreen')?.textContent
          const originalPriceText =
            card.querySelector('.a-price.a-text-price .a-offscreen')?.textContent ||
            card.querySelector('.a-text-price .a-offscreen')?.textContent
          const coupon =
            card.querySelector('.s-coupon-unclipped, .s-coupon-highlight-color, .a-color-success')?.textContent
              ?.replace(/\s+/g, ' ')
              .trim() || null
          const ratingText = card.querySelector('.a-icon-alt')?.textContent || ''
          const image = card.querySelector('img.s-image')?.getAttribute('src') || ''

          if (!id || !title || !href || !priceText) continue

          const price = parseBrazilianPrice(priceText)
          if (price === null) continue

          const permalink = new URL(href, 'https://www.amazon.com.br').toString()
          const originalPrice = parseBrazilianPrice(originalPriceText)

          items.push({
            id,
            title,
            price,
            originalPrice,
            rating: parseRating(ratingText),
            coupon,
            permalink,
            thumbnailUrl: image,
            sourceFilter,
          })
        }

        return items
      }, { resultLimit: limit, sourceFilter: term })
    },
    async getProductDetails(item) {
      await waitRandomDelay(minDelayMs, maxDelayMs, randomInt, sleepFn)
      await page.goto(item.permalink, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      await waitRandomDelay(minDelayMs, maxDelayMs, randomInt, sleepFn)

      const texts = await page.evaluate(() => {
        const couponSelectors = [
          '[id*="coupon"]',
          '[class*="coupon"]',
          '[id*="promo"]',
          '[class*="promo"]',
          '[data-csa-c-content-id*="coupon"]',
          '.a-alert-content',
        ]
        const values = []
        const seen = new Set()

        for (const selector of couponSelectors) {
          for (const element of document.querySelectorAll(selector)) {
            const text = element.textContent?.replace(/\s+/g, ' ').trim()
            if (!text || seen.has(text)) continue
            if (!/cupom|R\$\s*\d+(?:[\.,]\d{2})?\s*off|insira o c[oó]digo|aplicar cupom|resgatar/i.test(text)) continue
            seen.add(text)
            values.push(text)
          }
        }

        return values
      })
      const coupons = extractAmazonCouponsFromTexts(texts)

      return {
        coupons,
        rawCouponTexts: texts,
      }
    },
    async close() {
      if (storageStatePath) {
        await context.storageState({ path: storageStatePath }).catch(() => {})
      }
      await context.close()
      if (browser) {
        await browser.close()
      }
    },
  }
}

export function createAmazonCatalogProvider({
  createSearchSession = createAmazonPlaywrightSearchSession,
  randomInt = (max) => Math.floor(Math.random() * max),
  maxPagesPerFilter = 10,
  limitPerPage = 20,
  preserveSearchTermOrder = false,
  logger = console,
  ...sessionOptions
} = {}) {
  let searchSessionPromise

  async function getSearchSession() {
    if (!searchSessionPromise) {
      searchSessionPromise = createSearchSession({
        ...sessionOptions,
        randomInt,
        logger,
      })
    }

    return searchSessionPromise
  }

  return {
    async search(terms, {
      targetItemCount = Number.POSITIVE_INFINITY,
      isRecentlyPublished = async () => false,
    } = {}) {
      const searchTerms = terms.map((term) => term.trim()).filter(Boolean)
      const termsForRun = preserveSearchTermOrder
        ? searchTerms
        : shuffleItems(searchTerms, randomInt)
      const rawItems = []
      const acceptedItems = []
      const seenKeys = new Set()
      const targetPool = Number.isFinite(targetItemCount)
        ? Math.max(targetItemCount * 2, targetItemCount)
        : Number.POSITIVE_INFINITY

      for (let pageIndex = 0; pageIndex < maxPagesPerFilter; pageIndex += 1) {
        for (const term of termsForRun) {
          let pageItems

          try {
            const session = await getSearchSession()
            pageItems = await session.search(term, {
              pageNumber: pageIndex + 1,
              limit: limitPerPage,
            })
          } catch (error) {
            logger.warn?.({
              event: 'amazon_catalog_search_failed',
              term,
              pageNumber: pageIndex + 1,
              errorMessage: error.message,
            })
            continue
          }

          rawItems.push(...pageItems)

          for (const rawItem of pageItems) {
            if (acceptedItems.length >= targetPool) {
              break
            }

            let item = normalizeAmazonItem(rawItem, term)

            if (!item.id || !item.title || !(item.price > 0) || !item.permalink) {
              logger.info?.({ event: 'amazon_catalog_item_discarded', term, reason: 'missing_required_fields' })
              continue
            }

            if (item.price > MAX_AMAZON_PROMOTIONAL_PRICE) {
              logger.info?.({
                event: 'amazon_catalog_item_discarded',
                term,
                itemId: item.id,
                price: item.price,
                reason: 'price_above_promotional_cap',
              })
              continue
            }

            const keys = buildCollisionKeys(item)
            if (keys.some((key) => seenKeys.has(key))) {
              logger.info?.({ event: 'amazon_catalog_item_discarded', term, itemId: item.id, reason: 'duplicate' })
              continue
            }

            keys.forEach((key) => seenKeys.add(key))

            if (await isRecentlyPublished(item)) {
              logger.info?.({ event: 'amazon_catalog_item_discarded', term, itemId: item.id, reason: 'history' })
              continue
            }

            const session = await getSearchSession()
            if (typeof session.getProductDetails === 'function') {
              try {
                const details = await session.getProductDetails(item)
                item = normalizeAmazonItem({
                  ...item,
                  coupons: details?.coupons || [],
                  coupon_value: details?.coupons?.[0]?.coupon_value || null,
                  coupon_code: details?.coupons?.[0]?.coupon_code || null,
                  coupon_text: details?.coupons?.[0]?.coupon_text || null,
                }, term)

                if (item.coupons.length) {
                  for (const coupon of item.coupons) {
                    logger.info?.({
                      event: 'amazon_coupon_detected',
                      term,
                      itemId: item.id,
                      coupon_value: coupon.coupon_value,
                      coupon_code: coupon.coupon_code,
                      coupon_text: coupon.coupon_text,
                    })

                    if (coupon.coupon_value && !coupon.coupon_code) {
                      logger.info?.({
                        event: 'amazon_coupon_discount_without_code',
                        term,
                        itemId: item.id,
                        coupon_value: coupon.coupon_value,
                        coupon_text: coupon.coupon_text,
                      })
                    }
                  }
                } else {
                  logger.info?.({
                    event: 'amazon_coupon_not_found',
                    term,
                    itemId: item.id,
                    rawCouponTextCount: details?.rawCouponTexts?.length || 0,
                  })

                  if (details?.rawCouponTexts?.length) {
                    logger.info?.({
                      event: 'amazon_coupon_fallback_unstructured',
                      term,
                      itemId: item.id,
                      rawCouponTexts: details.rawCouponTexts.slice(0, 3),
                    })
                  }
                }
              } catch (error) {
                logger.warn?.({
                  event: 'amazon_product_coupon_scrape_failed',
                  term,
                  itemId: item.id,
                  errorMessage: error.message,
                })
              }
            }

            acceptedItems.push(item)

            if (acceptedItems.length >= targetPool) {
              break
            }
          }

          if (acceptedItems.length >= targetPool) {
            break
          }
        }

        if (acceptedItems.length >= targetPool) {
          break
        }
      }

      const items = acceptedItems
        .sort((left, right) => scoreAmazonItem(right) - scoreAmazonItem(left))
        .slice(0, targetPool)

      logger.info?.({
        event: 'amazon_catalog_search_completed',
        termsProcessed: termsForRun.length,
        rawItemsFound: rawItems.length,
        selectedCount: items.length,
      })

      return {
        termsProcessed: termsForRun.length,
        rawItemsFound: rawItems.length,
        items,
      }
    },
    async close() {
      if (!searchSessionPromise) {
        return
      }

      const session = await searchSessionPromise
      searchSessionPromise = undefined
      await session.close?.()
    },
  }
}
