function applyTemplate(template, item) {
  return template
    .replaceAll('{{url}}', encodeURIComponent(item.permalink))
    .replaceAll('{{id}}', item.id)
}

function normalizePermalink(permalink) {
  try {
    const url = new URL(permalink)
    url.hash = ''
    return url.toString()
  } catch {
    return permalink
  }
}

function normalizeTag(tag) {
  return tag?.trim().replace(/[.,;:]+$/, '')
}

function isLoginUrl(url) {
  return /\/lgz\/|\/login/.test(url)
}

function getPreferredLink(urlData, linkFormat) {
  if (linkFormat === 'long') {
    return urlData.long_url || urlData.short_url
  }

  return urlData.short_url || urlData.long_url
}

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

export async function createPlaywrightAffiliateSession({
  playwrightModule,
  hubUrl = 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub',
  endpointUrl = 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink',
  storageStatePath = '',
  userDataDir = '',
  headless = true,
  timeoutMs = 30000,
  channel = 'chrome',
  executablePath = '',
  userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  viewport = { width: 1440, height: 960 },
} = {}) {
  const playwright = await loadPlaywright(playwrightModule)
  const browserType = playwright.chromium
  const launchOptions = {
    headless,
    userAgent,
    viewport,
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

  await page.goto(hubUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})

  if (isLoginUrl(page.url())) {
    await context.close()
    if (browser) {
      await browser.close()
    }

    throw new Error(
      'Mercado Livre affiliate session is not authenticated. Refresh the Playwright session before running the bot.',
    )
  }

  return {
    async createLink({ urls, tag }) {
      const result = await page.evaluate(
        async ({ endpointUrl, urls, tag }) => {
          const response = await fetch(endpointUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({ urls, tag }),
          })

          return {
            status: response.status,
            body: await response.text(),
          }
        },
        { endpointUrl, urls, tag },
      )

      if (result.status === 401 || result.status === 403) {
        throw new Error('Mercado Livre affiliate session expired or is not authorized.')
      }

      let payload

      try {
        payload = JSON.parse(result.body)
      } catch {
        throw new Error(`Mercado Livre affiliate response was not valid JSON (status ${result.status}).`)
      }

      if (result.status >= 400 || payload.status >= 400) {
        throw new Error(`Mercado Livre affiliate request failed with status ${payload.status || result.status}.`)
      }

      return payload
    },
    async saveStorageState(path) {
      if (!path) {
        return
      }

      await context.storageState({ path })
    },
    async close() {
      await context.close()
      if (browser) {
        await browser.close()
      }
    },
  }
}

export function createAffiliateLinkProvider({
  templateUrl = process.env.ML_AFFILIATE_URL_TEMPLATE,
  tag = process.env.ML_AFFILIATE_TAG,
  linkFormat = process.env.ML_AFFILIATE_LINK_FORMAT || 'short',
  createAffiliateSession = createPlaywrightAffiliateSession,
  playwrightModule,
  storageStatePath = process.env.ML_AFFILIATE_PLAYWRIGHT_STORAGE_STATE_PATH || '',
  userDataDir = process.env.ML_AFFILIATE_PLAYWRIGHT_USER_DATA_DIR || '',
  headless = process.env.ML_AFFILIATE_PLAYWRIGHT_HEADLESS !== 'false',
  timeoutMs = Number.parseInt(process.env.ML_AFFILIATE_PLAYWRIGHT_TIMEOUT_MS || '30000', 10),
  channel = process.env.ML_AFFILIATE_PLAYWRIGHT_CHANNEL || 'chrome',
  executablePath = process.env.ML_AFFILIATE_PLAYWRIGHT_EXECUTABLE_PATH || '',
  hubUrl = process.env.ML_AFFILIATE_PLAYWRIGHT_HUB_URL || 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub',
  userAgent =
    process.env.ML_AFFILIATE_PLAYWRIGHT_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
} = {}) {
  let sessionPromise
  const normalizedTag = normalizeTag(tag)

  return {
    async getAffiliateLink(item) {
      if (templateUrl) {
        return applyTemplate(templateUrl, item)
      }

      if (!normalizedTag) {
        throw new Error('Missing required affiliate configuration: ML_AFFILIATE_TAG')
      }

      if (!storageStatePath && !userDataDir && createAffiliateSession === createPlaywrightAffiliateSession) {
        throw new Error(
          'Missing Playwright affiliate session configuration: ML_AFFILIATE_PLAYWRIGHT_STORAGE_STATE_PATH or ML_AFFILIATE_PLAYWRIGHT_USER_DATA_DIR',
        )
      }

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
      const payload = await session.createLink({
        urls: [normalizePermalink(item.permalink)],
        tag: normalizedTag,
      })
      const urlData = payload.urls?.[0]
      const affiliateLink = urlData ? getPreferredLink(urlData, linkFormat) : ''

      if (!affiliateLink) {
        throw new Error('Mercado Livre affiliate response did not include a usable link.')
      }

      return affiliateLink
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
