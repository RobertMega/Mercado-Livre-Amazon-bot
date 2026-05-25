async function loadPlaywright(playwrightModule) {
  if (playwrightModule) {
    return playwrightModule
  }

  try {
    return await import('playwright')
  } catch (error) {
    throw new Error(`Playwright is not installed for the bot runtime: ${error.message}`)
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

function normalizeApiItem(item) {
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
  }
}

function normalizeFilter(filter) {
  return filter?.trim()
}

function createSearchUrl(filter) {
  return `https://lista.mercadolivre.com.br/${encodeURIComponent(filter).replaceAll('%20', '-')}`
}

function shuffleItems(items, randomInt) {
  const shuffled = [...items]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }

  return shuffled
}

export async function createPlaywrightCatalogSearchSession({
  playwrightModule,
  headless = true,
  channel = 'chrome',
  executablePath = '',
  userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  viewport = { width: 1440, height: 960 },
  timeoutMs = 30000,
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
  })

  const page = await context.newPage()
  page.setDefaultTimeout(timeoutMs)

  return {
    async search(filter, limit) {
      await page.goto(createSearchUrl(filter), { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})

      return page.evaluate((resultLimit) => {
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
          })
        }

        return items
      }, limit)
    },
    async close() {
      await context.close()
      await browser.close()
    },
  }
}

export function createMercadoLivreCatalogProvider({
  siteId = 'MLB',
  limitPerFilter = 20,
  fetchImpl = fetch,
  createSearchSession = createPlaywrightCatalogSearchSession,
  randomInt = (max) => Math.floor(Math.random() * max),
  playwrightModule,
  headless = true,
  channel = 'chrome',
  executablePath = '',
  userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  timeoutMs = 30000,
} = {}) {
  let searchSessionPromise

  return {
    async search(filters) {
      const normalizedFilters = filters.map(normalizeFilter).filter(Boolean)
      const items = []

      for (const filter of normalizedFilters) {
        const apiUrl = `https://api.mercadolibre.com/sites/${siteId}/search?q=${encodeURIComponent(filter)}&limit=${limitPerFilter}`
        const response = await fetchImpl(apiUrl)

        if (response.ok) {
          const payload = await response.json()
          for (const item of payload.results ?? []) {
            items.push(normalizeApiItem(item))
          }

          continue
        }

        if (response.status !== 403) {
          throw new Error(`Mercado Livre catalog request failed with status ${response.status}`)
        }

        if (!searchSessionPromise) {
          searchSessionPromise = createSearchSession({
            playwrightModule,
            headless,
            channel,
            executablePath,
            userAgent,
            timeoutMs,
          })
        }

        const searchSession = await searchSessionPromise
        const scrapedItems = await searchSession.search(filter, limitPerFilter)
        items.push(...scrapedItems)
      }

      return shuffleItems(items, randomInt)
    },
    async close() {
      if (!searchSessionPromise) {
        return
      }

      const searchSession = await searchSessionPromise
      searchSessionPromise = undefined
      await searchSession.close?.()
    },
  }
}
