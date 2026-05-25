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

function parseCsv(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeTag(tag) {
  return tag?.trim().replace(/[.,;:]+$/, '') || ''
}

function isPlaceholderTag(tag) {
  return /^(?:COLOQUE_SUA_TAG_REAL_AQUI|SEU_TAG_AQUI|YOUR_TAG_HERE)$/i.test(normalizeTag(tag))
}

function isShortLinkFormat(linkFormat) {
  return String(linkFormat || '').trim().toLowerCase() === 'short'
}

export function getAmazonConfig(env = process.env) {
  return {
    enabled: parseBoolean(env.AMAZON_ENABLED, false),
    siteId: env.AMAZON_SITE_ID || 'AMAZON',
    searchTerms: parseCsv(env.AMAZON_SEARCH_TERMS),
    postsPerRun: parseInteger(env.AMAZON_POSTS_PER_RUN, 5),
    postIntervalMinutes: parseInteger(env.AMAZON_POST_INTERVAL_MINUTES, parseInteger(env.POST_INTERVAL_MINUTES, 10)),
    maxPagesPerFilter: parseInteger(env.AMAZON_MAX_PAGES_PER_FILTER, 10),
    minDelayMs: parseInteger(env.AMAZON_MIN_DELAY_MS, 1500),
    maxDelayMs: parseInteger(env.AMAZON_MAX_DELAY_MS, 4000),
    affiliate: {
      tag: env.AMAZON_AFFILIATE_TAG || '',
      templateUrl: env.AMAZON_AFFILIATE_URL_TEMPLATE || '',
      linkFormat: env.AMAZON_AFFILIATE_LINK_FORMAT || 'full',
    },
    playwright: {
      headless: parseBoolean(env.AMAZON_PLAYWRIGHT_HEADLESS, true),
      channel: env.AMAZON_PLAYWRIGHT_CHANNEL || 'chrome',
      timeoutMs: parseInteger(env.AMAZON_PLAYWRIGHT_TIMEOUT_MS, 30000),
      executablePath: env.AMAZON_PLAYWRIGHT_EXECUTABLE_PATH || '',
      userDataDir: env.AMAZON_PLAYWRIGHT_USER_DATA_DIR || './sessions/amazon-profile',
      storageStatePath: env.AMAZON_PLAYWRIGHT_STORAGE_STATE_PATH || './sessions/amazon-storage-state.json',
    },
    api: {
      port: parseInteger(env.AMAZON_API_PORT, 3001),
      url: env.AMAZON_API_URL || 'http://localhost:3001',
    },
  }
}

export function getAmazonAutomationPlaywrightConfig(config) {
  return {
    ...config.playwright,
    headless: true,
  }
}

export function assertAmazonConfig(config) {
  if (!config.enabled) {
    return
  }

  const missing = []

  if (!config.searchTerms?.length) missing.push('AMAZON_SEARCH_TERMS')
  if (!isShortLinkFormat(config.affiliate?.linkFormat) && !config.affiliate?.tag) {
    missing.push('AMAZON_AFFILIATE_TAG')
  }

  if (missing.length) {
    throw new Error(`Missing required Amazon configuration: ${missing.join(', ')}`)
  }

  if (config.affiliate?.tag && isPlaceholderTag(config.affiliate.tag)) {
    throw new Error('Invalid Amazon configuration: AMAZON_AFFILIATE_TAG is still a placeholder.')
  }
}
