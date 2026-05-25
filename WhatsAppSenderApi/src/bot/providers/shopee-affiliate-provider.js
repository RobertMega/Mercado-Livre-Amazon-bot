import { createShopeeAffiliateLinkResolver } from './shopee-affiliate-link-resolver.js'

function isShopeeLoginUrl(url) {
  return /\/buyer\/login|\/login/i.test(url)
}

async function loadPlaywright(playwrightModule) {
  if (playwrightModule) {
    return playwrightModule
  }

  try {
    return await import('playwright')
  } catch (error) {
    throw new Error(`Playwright is not installed for the Shopee affiliate runtime: ${error.message}`)
  }
}

async function createBrowserContext({
  playwrightModule,
  storageStatePath,
  userDataDir,
  headless,
  timeoutMs,
  channel,
  executablePath,
  userAgent,
  viewport,
} = {}) {
  const playwright = await loadPlaywright(playwrightModule)
  const browserType = playwright.chromium
  const launchOptions = {
    headless,
    userAgent,
    viewport,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  }

  if (channel) {
    launchOptions.channel = channel
  }

  if (executablePath) {
    launchOptions.executablePath = executablePath
  }

  let browser
  let context

  if (userDataDir) {
    context = await browserType.launchPersistentContext(userDataDir, launchOptions)
  } else {
    browser = await browserType.launch(launchOptions)
    context = await browser.newContext(
      storageStatePath
        ? {
            storageState: storageStatePath,
          }
        : undefined,
    )
  }

  const page = context.pages()[0] || (await context.newPage())
  page.setDefaultTimeout(timeoutMs)

  return { browser, context, page }
}

async function fillProductUrl(page, url) {
  const input = page.locator('textarea, input[type="url"], input[type="text"]').first()
  await input.waitFor({ state: 'visible' })
  await input.fill(url)
}

async function triggerGeneration(page) {
  const button = page.getByRole('button', {
    name: /gerar|criar|generate|get link|obter link/i,
  }).first()

  if (await button.count()) {
    await button.click()
    return
  }

  const fallbackButton = page.locator('button').filter({ hasText: /gerar|criar|generate|link/i }).first()
  await fallbackButton.click()
}

async function readGeneratedLink(page) {
  const candidates = [
    page.locator('input[readonly][value^="http"]').first(),
    page.locator('textarea[readonly]').first(),
    page.locator('a[href^="http"]').first(),
    page.locator('input[value^="http"]').last(),
  ]

  for (const candidate of candidates) {
    if (!await candidate.count()) {
      continue
    }

    const value = await candidate.evaluate((element) => {
      if (element instanceof HTMLAnchorElement) {
        return element.href
      }

      return 'value' in element ? element.value : element.textContent
    }).catch(() => '')

    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
      return value.trim()
    }
  }

  return ''
}

export async function createPlaywrightShopeeAffiliateSession({
  playwrightModule,
  hubUrl = 'https://affiliate.shopee.com.br/offer/custom_link',
  storageStatePath = '',
  userDataDir = '',
  headless = true,
  timeoutMs = 30000,
  channel = 'chrome',
  executablePath = '',
  userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  viewport = { width: 1440, height: 960 },
} = {}) {
  const { browser, context, page } = await createBrowserContext({
    playwrightModule,
    storageStatePath,
    userDataDir,
    headless,
    timeoutMs,
    channel,
    executablePath,
    userAgent,
    viewport,
  })

  await page.goto(hubUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  if (isShopeeLoginUrl(page.url())) {
    await context.close()
    if (browser) {
      await browser.close()
    }

    throw new Error(
      'Shopee affiliate session is not authenticated. Refresh the Playwright session before running the bot.',
    )
  }

  return {
    async createLink({ url }) {
      let networkAffiliateLink = ''
      const responseListener = async (response) => {
        const responseUrl = response.url()
        if (!/custom_link|affiliate|shortlink|deeplink/i.test(responseUrl)) {
          return
        }

        try {
          const body = await response.text()
          const match = body.match(/https?:\/\/[^\s"']+/i)
          if (match?.[0]) {
            networkAffiliateLink = match[0]
          }
        } catch {}
      }

      page.on('response', responseListener)

      try {
        await page.goto(hubUrl, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle').catch(() => {})
        await fillProductUrl(page, url)
        await triggerGeneration(page)
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.waitForTimeout(1500)

        const domAffiliateLink = await readGeneratedLink(page)
        const affiliateLink = domAffiliateLink || networkAffiliateLink

        if (!affiliateLink) {
          throw new Error('Shopee affiliate page did not return a usable link.')
        }

        return affiliateLink
      } finally {
        page.off('response', responseListener)
      }
    },
    async saveStorageState(path) {
      if (!path) {
        return
      }

      await context.storageState({ path, indexedDB: true })
    },
    async close() {
      await context.close()
      if (browser) {
        await browser.close()
      }
    },
  }
}

export function createShopeeAffiliateProvider({
  templateUrl = process.env.SHOPEE_AFFILIATE_URL_TEMPLATE || '',
  officialGenerator = null,
  createAffiliateSession = createPlaywrightShopeeAffiliateSession,
  playwrightModule,
  storageStatePath = process.env.SHOPEE_AFFILIATE_PLAYWRIGHT_STORAGE_STATE_PATH || '',
  userDataDir = process.env.SHOPEE_AFFILIATE_PLAYWRIGHT_USER_DATA_DIR || '',
  headless = process.env.SHOPEE_AFFILIATE_PLAYWRIGHT_HEADLESS !== 'false',
  timeoutMs = Number.parseInt(process.env.SHOPEE_AFFILIATE_PLAYWRIGHT_TIMEOUT_MS || '30000', 10),
  channel = process.env.SHOPEE_AFFILIATE_PLAYWRIGHT_CHANNEL || 'chrome',
  executablePath = process.env.SHOPEE_AFFILIATE_PLAYWRIGHT_EXECUTABLE_PATH || '',
  hubUrl = process.env.SHOPEE_AFFILIATE_PLAYWRIGHT_HUB_URL || 'https://affiliate.shopee.com.br/offer/custom_link',
  userAgent =
    process.env.SHOPEE_AFFILIATE_PLAYWRIGHT_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  logger = console,
} = {}) {
  let sessionPromise
  let wrappedOfficialGenerator = officialGenerator

  if (!wrappedOfficialGenerator && createAffiliateSession && (storageStatePath || userDataDir)) {
    wrappedOfficialGenerator = {
      async generateAffiliateLink({ url }) {
        if (!sessionPromise) {
          sessionPromise = createAffiliateSession({
            playwrightModule,
            storageStatePath,
            userDataDir,
            headless,
            timeoutMs,
            channel,
            executablePath,
            hubUrl,
            userAgent,
          })
        }

        const session = await sessionPromise
        return session.createLink({ url })
      },
      async close() {
        if (!sessionPromise) {
          return
        }

        const session = await sessionPromise
        sessionPromise = undefined
        await session.close?.()
      },
    }
  }

  const linkResolver = createShopeeAffiliateLinkResolver({
    officialGenerator: wrappedOfficialGenerator,
    templateUrl,
    logger,
  })

  return {
    async getAffiliateLink(item) {
      return linkResolver.resolve(item)
    },
    async close() {
      await linkResolver.close()
    },
  }
}
