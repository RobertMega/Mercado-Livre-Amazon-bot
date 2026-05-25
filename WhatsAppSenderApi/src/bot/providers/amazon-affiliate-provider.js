import { existsSync } from 'fs'

function normalizeTag(tag) {
  return tag?.trim().replace(/[.,;:]+$/, '') || ''
}

function isPlaceholderTag(tag) {
  return /^(?:COLOQUE_SUA_TAG_REAL_AQUI|SEU_TAG_AQUI|YOUR_TAG_HERE)$/i.test(normalizeTag(tag))
}

function isShortLinkFormat(linkFormat) {
  return String(linkFormat || '').trim().toLowerCase() === 'short'
}

function extractAsin(item = {}) {
  const id = typeof item.id === 'string' ? item.id.trim() : ''

  if (/^[A-Z0-9]{10}$/i.test(id)) {
    return id.toUpperCase()
  }

  const permalink = typeof item.permalink === 'string' ? item.permalink : ''
  const match = permalink.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)
  return match?.[1]?.toUpperCase() || id
}

function normalizeProductUrl(item = {}) {
  const asin = extractAsin(item)

  if (asin && /^[A-Z0-9]{10}$/i.test(asin)) {
    return `https://www.amazon.com.br/dp/${asin}`
  }

  try {
    const url = new URL(item.permalink)
    url.hash = ''
    url.search = ''
    return url.toString()
  } catch {
    return item.permalink || ''
  }
}

function buildTaggedProductUrl(productUrl, tag) {
  const normalizedTag = normalizeTag(tag)
  if (!productUrl || !normalizedTag) {
    return ''
  }

  try {
    const url = new URL(productUrl)
    url.searchParams.set('tag', normalizedTag)
    return url.toString()
  } catch {
    const separator = productUrl.includes('?') ? '&' : '?'
    return `${productUrl}${separator}tag=${encodeURIComponent(normalizedTag)}`
  }
}

function buildResult(url, {
  source = 'affiliate',
  usedFallback = false,
  fallbackReason,
  productUrl,
  rawText,
} = {}) {
  return {
    url,
    source,
    usedFallback,
    ...(fallbackReason ? { fallbackReason } : {}),
    ...(productUrl ? { productUrl } : {}),
    ...(rawText ? { rawText } : {}),
  }
}

async function loadPlaywright(playwrightModule) {
  if (playwrightModule) {
    return playwrightModule
  }

  try {
    return await import('playwright')
  } catch (error) {
    throw new Error(`Playwright is not installed for the Amazon Associates runtime: ${error.message}`)
  }
}

export function extractAssociatesLinksFromTexts(values = []) {
  const normalizedValues = values
    .map((value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''))
    .filter(Boolean)
  const rawText = normalizedValues.find((value) => /link de texto|amzn\.to|tag=/i.test(value)) || normalizedValues[0] || ''
  const shortMatch = normalizedValues
    .map((value) => value.match(/https?:\/\/amzn\.to\/([A-Za-z0-9]{5,12}?)(?=Link\b|link\b|Short\b|short\b|Completo\b|completo\b|$|[^A-Za-z0-9])/))
    .find(Boolean)
  const fullMatch = normalizedValues
    .map((value) => value.match(/https?:\/\/(?:www\.)?amazon\.com\.br\/[^\s"']*tag=[^\s"']+/))
    .find(Boolean)

  return {
    rawText,
    shortUrl: shortMatch ? `https://amzn.to/${shortMatch[1]}` : '',
    fullUrl: fullMatch?.[0] || '',
  }
}

async function clickFirstAvailable(page, locators) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0)
    if (!count) {
      continue
    }

    const clicked = await locator.first().click().then(() => true).catch(() => false)
    if (clicked) {
      return true
    }
  }

  return false
}

async function selectShortLinkOption(page) {
  await clickFirstAvailable(page, [
    page.getByRole('radio', { name: /link curto|short link/i }),
    page.getByRole('button', { name: /link curto|short link/i }),
    page.getByRole('tab', { name: /link curto|short link/i }),
    page.locator('label, button, input[type="radio"], a, span').filter({ hasText: /link curto|short link/i }),
    page.getByText(/link curto|short link/i),
  ])
}

async function waitForAssociatesPopup(page) {
  return Promise.any([
    page.getByText(/Link curto|Short link|Link completo|Full link/i).first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true),
    page.getByText(/Link de texto para esta p[aÃ¡]gina|Link de texto criado|Copie o link gerado/i).first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true),
    page.locator('input, textarea').filter({ hasText: /amzn\.to|tag=/i }).first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true),
  ]).catch(() => false)
}

async function collectAssociatesLinkValues(page) {
  return page.evaluate(() => {
    const values = []
    const isVisible = (element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && rect.width > 0
        && rect.height > 0
    }
    const pushValue = (value) => {
      const text = value?.replace(/\s+/g, ' ').trim()
      if (text && /amzn\.to|tag=/.test(text)) {
        values.push(text)
      }
    }
    const isPopupText = (value) => /Link curto|Short link|Link completo|Full link|Link de texto|Copie o link|Copy link/i.test(value || '')
    const containers = Array.from(document.querySelectorAll('[role="dialog"], [class*="popover"], [id*="popover"], [id*="amzn-ss"], [class*="amzn-ss"]'))
      .filter((element) => isVisible(element) && isPopupText(element.textContent))

    if (!containers.length) {
      return values
    }

    for (const container of containers) {
      for (const element of container.querySelectorAll('input, textarea')) {
        if (isVisible(element)) {
          pushValue(element.value)
          pushValue(element.getAttribute('value'))
        }
      }

      for (const element of container.querySelectorAll('a, span, div, label')) {
        if (!isVisible(element)) {
          continue
        }

        pushValue(element instanceof HTMLAnchorElement ? element.href : '')
        pushValue(element.textContent)
      }
    }

    return values
  })
}

export async function createAmazonAssociatesLinkSession({
  playwrightModule,
  storageStatePath = process.env.AMAZON_PLAYWRIGHT_STORAGE_STATE_PATH || './sessions/amazon-storage-state.json',
  userDataDir = process.env.AMAZON_PLAYWRIGHT_USER_DATA_DIR || './sessions/amazon-profile',
  headless = process.env.AMAZON_PLAYWRIGHT_HEADLESS !== 'false',
  channel = process.env.AMAZON_PLAYWRIGHT_CHANNEL || 'chrome',
  executablePath = process.env.AMAZON_PLAYWRIGHT_EXECUTABLE_PATH || '',
  timeoutMs = Number.parseInt(process.env.AMAZON_PLAYWRIGHT_TIMEOUT_MS || '30000', 10),
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

  if (storageStatePath && existsSync(storageStatePath)) {
    browser = await playwright.chromium.launch(launchOptions)
    context = await browser.newContext({ storageState: storageStatePath })
  } else if (userDataDir) {
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
    async createLink({ productUrl }) {
      await page.goto(productUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})

      const sitestripeVisible = await Promise.any([
        page.locator('#amzn-ss-get-link-button, [id*="amzn-ss-get-link"], [aria-label*="Obter link"], [aria-label*="Get link"], [title*="Obter link"], [title*="Get link"]').first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true),
        page.getByRole('button', { name: /obter link|get link/i }).first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true),
      ]).catch(() => false)

      if (!sitestripeVisible) {
        throw new Error('Amazon SiteStripe did not load on the product page.')
      }

      logger.info?.({
        event: 'sitestripe_detected',
        productUrl,
      })

      const clickedGetLink = await clickFirstAvailable(page, [
        page.getByRole('button', { name: /obter link|get link/i }),
        page.locator('#amzn-ss-get-link-button'),
        page.locator('[id*="amzn-ss-get-link"], [aria-label*="Obter link"], [aria-label*="Get link"], [title*="Obter link"], [title*="Get link"]'),
        page.locator('button, input[type="button"], a').filter({ hasText: /obter link|get link/i }),
      ])

      if (!clickedGetLink) {
        throw new Error('Amazon SiteStripe get link button was not found.')
      }

      logger.info?.({
        event: 'clicked_get_link',
        productUrl,
      })

      const popupOpened = await page.getByText(/Link de texto para esta p[aá]gina|Link de texto criado|Copie o link gerado/i)
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })
        .then(() => true)
        .catch(() => false)
      const associatesPopupOpened = popupOpened || await waitForAssociatesPopup(page)

      if (!associatesPopupOpened) {
        throw new Error('Amazon Associates text link popup did not open.')
      }

      logger.info?.({
        event: 'affiliate_popup_opened',
        productUrl,
      })

      await selectShortLinkOption(page)
      await page.waitForTimeout(1000)

      const values = await collectAssociatesLinkValues(page)
      const result = extractAssociatesLinksFromTexts(values)

      return {
        productUrl,
        ...result,
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

export function createAmazonAffiliateProvider({
  tag = process.env.AMAZON_AFFILIATE_TAG || '',
  templateUrl = process.env.AMAZON_AFFILIATE_URL_TEMPLATE || '',
  linkFormat = process.env.AMAZON_AFFILIATE_LINK_FORMAT || 'short',
  createAssociatesLinkSession = createAmazonAssociatesLinkSession,
  storageStatePath = process.env.AMAZON_PLAYWRIGHT_STORAGE_STATE_PATH || './sessions/amazon-storage-state.json',
  userDataDir = process.env.AMAZON_PLAYWRIGHT_USER_DATA_DIR || './sessions/amazon-profile',
  headless = process.env.AMAZON_PLAYWRIGHT_HEADLESS !== 'false',
  channel = process.env.AMAZON_PLAYWRIGHT_CHANNEL || 'chrome',
  executablePath = process.env.AMAZON_PLAYWRIGHT_EXECUTABLE_PATH || '',
  timeoutMs = Number.parseInt(process.env.AMAZON_PLAYWRIGHT_TIMEOUT_MS || '30000', 10),
  logger = console,
} = {}) {
  let sessionPromise

  async function getSession() {
    if (!sessionPromise) {
      sessionPromise = createAssociatesLinkSession({
        storageStatePath,
        userDataDir,
        headless,
        channel,
        executablePath,
        timeoutMs,
        logger,
      })
    }

    return sessionPromise
  }

  return {
    async getAffiliateLink(item) {
      const productUrl = normalizeProductUrl(item)
      const affiliateUrl = buildTaggedProductUrl(productUrl, tag)
      const shortLinkRequired = isShortLinkFormat(linkFormat)

      try {
        const session = await getSession()
        const associatesResult = await session.createLink({ productUrl, item })
        const shortUrl = associatesResult?.shortUrl || ''

        if (!/^https:\/\/amzn\.to\/[A-Za-z0-9]+/i.test(shortUrl)) {
          throw new Error('Amazon SiteStripe did not return a short amzn.to link.')
        }

        logger.info?.({
          event: 'amazon_affiliate_link_generated',
          itemId: item.id,
          productUrl,
          affiliateLink: shortUrl,
          linkFormat,
          source: 'sitestripe_short_url',
          usedFallback: false,
          rawText: associatesResult.rawText || null,
        })

        return buildResult(shortUrl, {
          source: 'sitestripe_short_url',
          productUrl,
          rawText: associatesResult.rawText,
        })
      } catch (error) {
        if (shortLinkRequired) {
          throw error
        }

        if (!affiliateUrl || isPlaceholderTag(tag)) {
          logger.warn?.({
            event: 'affiliate_link_fallback_used',
            itemId: item.id,
            productUrl,
            fallbackReason: 'missing_amazon_affiliate_tag',
          })

          return buildResult(productUrl, {
            source: 'permalink',
            usedFallback: true,
            fallbackReason: 'missing_amazon_affiliate_tag',
            productUrl,
          })
        }

        logger.warn?.({
          event: 'affiliate_link_fallback_used',
          itemId: item.id,
          productUrl,
          affiliateLink: affiliateUrl,
          fallbackReason: error.message,
          source: 'tagged_url',
          ignoredTemplateUrl: Boolean(templateUrl),
        })

        return buildResult(affiliateUrl, {
          source: 'tagged_url',
          usedFallback: true,
          fallbackReason: error.message,
          productUrl,
        })
      }
    },
    async close() {
      if (!sessionPromise) {
        return
      }

      try {
        const session = await sessionPromise
        await session.close?.()
      } catch {
      } finally {
        sessionPromise = undefined
      }
    },
  }
}
