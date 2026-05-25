import test from 'node:test'
import assert from 'node:assert/strict'

import { assertBotConfig, getBotConfig } from '../../src/bot/config.js'

test('bot config defaults Mercado Livre catalog to installed Chrome and test fallback flags', () => {
  const originalEnv = { ...process.env }

  delete process.env.ML_SEARCH_TERMS
  delete process.env.ML_CATALOG_PLAYWRIGHT_EXECUTABLE_PATH
  delete process.env.ML_CATALOG_FORCE_BROWSER_FALLBACK
  delete process.env.ML_CATALOG_TEST_VISIBLE
  delete process.env.ML_CATALOG_PLAYWRIGHT_HEADLESS

  try {
    const config = getBotConfig()

    assert.equal(config.catalog.executablePath, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    assert.equal(config.catalog.storageStatePath, 'sessions/mercado-livre-catalog-storage-state.json')
    assert.equal(config.catalog.forceBrowserFallback, false)
    assert.equal(config.catalog.testVisible, false)
    assert.equal(config.catalog.headless, true)
    assert.equal(config.catalog.manualVerificationTimeoutMs, 0)
    assert.equal(config.catalog.manualVerificationPollMs, 1000)
  } finally {
    process.env = originalEnv
  }
})

test('bot config turns visible test mode into headful browser execution', () => {
  const originalEnv = { ...process.env }

  process.env.ML_CATALOG_TEST_VISIBLE = 'true'
  process.env.ML_CATALOG_PLAYWRIGHT_HEADLESS = 'true'
  process.env.ML_CATALOG_PLAYWRIGHT_STORAGE_STATE_PATH = 'sessions/custom-catalog-state.json'

  try {
    const config = getBotConfig()

    assert.equal(config.catalog.testVisible, true)
    assert.equal(config.catalog.headless, false)
    assert.equal(config.catalog.storageStatePath, 'sessions/custom-catalog-state.json')
    assert.equal(config.catalog.manualVerificationTimeoutMs, 10 * 60 * 1000)
  } finally {
    process.env = originalEnv
  }
})

test('bot config reads Mercado Livre interval with POST_INTERVAL_MINUTES fallback', () => {
  const originalEnv = { ...process.env }

  try {
    process.env.POST_INTERVAL_MINUTES = '10'
    delete process.env.ML_POST_INTERVAL_MINUTES

    assert.equal(getBotConfig().postIntervalMinutes, 10)

    process.env.ML_POST_INTERVAL_MINUTES = '5'

    assert.equal(getBotConfig().postIntervalMinutes, 5)
  } finally {
    process.env = originalEnv
  }
})

test('bot config does not require Mercado Livre search terms when ML is disabled', () => {
  assert.doesNotThrow(() => assertBotConfig({
    mlEnabled: false,
    sessionId: 'sales-session',
    groupJid: '120363400000000000@g.us',
    filters: [],
  }))
})
