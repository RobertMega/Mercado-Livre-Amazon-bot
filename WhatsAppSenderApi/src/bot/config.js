function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  return value === 'true'
}

function getCatalogConfig() {
  const testVisible = parseBoolean(process.env.ML_CATALOG_TEST_VISIBLE, false)

  return {
    storageStatePath:
      process.env.ML_CATALOG_PLAYWRIGHT_STORAGE_STATE_PATH ||
      'sessions/mercado-livre-catalog-storage-state.json',
    headless: testVisible ? false : parseBoolean(process.env.ML_CATALOG_PLAYWRIGHT_HEADLESS, true),
    channel: process.env.ML_CATALOG_PLAYWRIGHT_CHANNEL || 'chrome',
    executablePath:
      process.env.ML_CATALOG_PLAYWRIGHT_EXECUTABLE_PATH ||
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    userAgent:
      process.env.ML_CATALOG_PLAYWRIGHT_USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    timeoutMs: parseInteger(process.env.ML_CATALOG_PLAYWRIGHT_TIMEOUT_MS, 30000),
    minDelayMs: parseInteger(process.env.ML_CATALOG_MIN_DELAY_MS, 1500),
    maxDelayMs: parseInteger(process.env.ML_CATALOG_MAX_DELAY_MS, 4000),
    maxPagesPerFilter: parseInteger(process.env.ML_CATALOG_MAX_PAGES_PER_FILTER, 5),
    forceBrowserFallback: parseBoolean(process.env.ML_CATALOG_FORCE_BROWSER_FALLBACK, false),
    testVisible,
    manualVerificationTimeoutMs: testVisible ? 10 * 60 * 1000 : 0,
    manualVerificationPollMs: 1000,
  }
}

export function getBotConfig() {
  const filters = (process.env.ML_SEARCH_TERMS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return {
    mlEnabled: parseBoolean(process.env.ML_ENABLED, true),
    apiBaseUrl: process.env.WHATSAPP_API_URL || 'http://localhost:3000',
    sessionId: process.env.WHATSAPP_SESSION_ID || '',
    groupJid: process.env.WHATSAPP_GROUP_JID || '',
    filters,
    siteId: process.env.ML_SITE_ID || 'MLB',
    postsPerRun: parseInteger(process.env.POSTS_PER_RUN, 5),
    postIntervalMinutes: parseInteger(
      process.env.ML_POST_INTERVAL_MINUTES,
      parseInteger(process.env.POST_INTERVAL_MINUTES, 10),
    ),
    catalogSearchTimeoutMs: parseInteger(process.env.BOT_CATALOG_SEARCH_TIMEOUT_MS, 180000),
    offerProcessingTimeoutMs: parseInteger(process.env.BOT_OFFER_PROCESSING_TIMEOUT_MS, 45000),
    limitPerFilter: parseInteger(process.env.ML_SEARCH_LIMIT_PER_FILTER, 20),
    catalog: getCatalogConfig(),
    affiliate: {
      templateUrl: process.env.ML_AFFILIATE_URL_TEMPLATE || '',
      tag: process.env.ML_AFFILIATE_TAG || '',
      linkFormat: process.env.ML_AFFILIATE_LINK_FORMAT || 'short',
      storageStatePath: process.env.ML_AFFILIATE_PLAYWRIGHT_STORAGE_STATE_PATH || '',
      userDataDir: process.env.ML_AFFILIATE_PLAYWRIGHT_USER_DATA_DIR || '',
      headless: parseBoolean(process.env.ML_AFFILIATE_PLAYWRIGHT_HEADLESS, true),
      timeoutMs: parseInteger(process.env.ML_AFFILIATE_PLAYWRIGHT_TIMEOUT_MS, 30000),
      channel: process.env.ML_AFFILIATE_PLAYWRIGHT_CHANNEL || 'chrome',
      executablePath: process.env.ML_AFFILIATE_PLAYWRIGHT_EXECUTABLE_PATH || '',
      userAgent:
        process.env.ML_AFFILIATE_PLAYWRIGHT_USER_AGENT ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
      hubUrl:
        process.env.ML_AFFILIATE_PLAYWRIGHT_HUB_URL ||
        'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub',
    },
  }
}

export function assertBotConfig(config) {
  const missing = []

  if (!config.sessionId) missing.push('WHATSAPP_SESSION_ID')
  if (!config.groupJid) missing.push('WHATSAPP_GROUP_JID')
  if (config.mlEnabled !== false && !config.filters.length) missing.push('ML_SEARCH_TERMS')

  if (missing.length) {
    throw new Error(`Missing required bot configuration: ${missing.join(', ')}`)
  }
}
