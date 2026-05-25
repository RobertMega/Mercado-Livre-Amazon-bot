import test from 'node:test'
import assert from 'node:assert/strict'

import { createAffiliateLoginBootstrap } from '../../src/bot/affiliate-login-bootstrap.js'

test('affiliate login bootstrap falls back to a fresh temporary profile when the saved profile cannot be opened', async () => {
  const calls = []
  let tempDirCleaned = false
  let savedStorageStatePath = null

  const bootstrap = createAffiliateLoginBootstrap({
    affiliate: {
      userDataDir: 'sessions/affiliate-profile',
      storageStatePath: 'sessions/affiliate-storage-state.json',
      hubUrl: 'https://example.com/hub',
      channel: 'chrome',
      executablePath: '',
      userAgent: 'ua',
    },
    createTempDir: async () => 'C:\\temp\\affiliate-login',
    removeDir: async (dir) => {
      tempDirCleaned = dir === 'C:\\temp\\affiliate-login'
    },
    launchPersistentContext: async (dir, options) => {
      calls.push({ dir, options })

      if (dir === 'sessions/affiliate-profile') {
        throw new Error('profile locked')
      }

      return {
        pages() {
          return []
        },
        async newPage() {
          return {
            async goto() {},
            url() {
              return 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub'
            },
          }
        },
        async storageState({ path }) {
          savedStorageStatePath = path
        },
        async close() {},
      }
    },
  })

  const session = await bootstrap.open()

  assert.equal(calls.length, 2)
  assert.equal(calls[0].dir, 'sessions/affiliate-profile')
  assert.equal(calls[1].dir, 'C:\\temp\\affiliate-login')
  assert.equal(session.mode, 'temporary_profile')

  await session.save()
  await session.close()

  assert.equal(savedStorageStatePath, 'sessions/affiliate-storage-state.json')
  assert.equal(tempDirCleaned, true)
})

test('affiliate login bootstrap keeps the configured profile when it opens successfully', async () => {
  let savedStorageStatePath = null
  const bootstrap = createAffiliateLoginBootstrap({
    affiliate: {
      userDataDir: 'sessions/affiliate-profile',
      storageStatePath: 'sessions/affiliate-storage-state.json',
      hubUrl: 'https://example.com/hub',
      channel: 'chrome',
      executablePath: '',
      userAgent: 'ua',
    },
    launchPersistentContext: async (dir) => ({
      pages() {
        return []
      },
      async newPage() {
        return {
          async goto() {},
          url() {
            return 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub'
          },
        }
      },
      async storageState({ path }) {
        savedStorageStatePath = `${dir}:${path}`
      },
      async close() {},
    }),
  })

  const session = await bootstrap.open()

  assert.equal(session.mode, 'saved_profile')

  await session.save()
  await session.close()

  assert.equal(savedStorageStatePath, 'sessions/affiliate-profile:sessions/affiliate-storage-state.json')
})

test('affiliate login session waits until the login URL changes when running without terminal interaction', async () => {
  let currentUrl = 'https://www.mercadolivre.com.br/login'
  let gotoCalls = 0
  const bootstrap = createAffiliateLoginBootstrap({
    affiliate: {
      userDataDir: 'sessions/affiliate-profile',
      storageStatePath: 'sessions/affiliate-storage-state.json',
      hubUrl: 'https://example.com/hub',
      channel: 'chrome',
      executablePath: '',
      userAgent: 'ua',
    },
    launchPersistentContext: async () => ({
      pages() {
        return []
      },
      async newPage() {
        return {
          async goto() {
            gotoCalls += 1
          },
          url() {
            return currentUrl
          },
        }
      },
      async storageState() {},
      async close() {},
    }),
  })

  const session = await bootstrap.open()
  setTimeout(() => {
    currentUrl = 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub'
  }, 20)

  await session.waitForAuthentication({
    timeoutMs: 500,
    pollIntervalMs: 10,
  })

  await session.close()
  assert.equal(gotoCalls, 1)
})
