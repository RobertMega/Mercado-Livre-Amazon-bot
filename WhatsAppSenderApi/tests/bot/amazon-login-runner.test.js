import test from 'node:test'
import assert from 'node:assert/strict'

import { createAmazonLoginRunner } from '../../src/bot/login-amazon-session.js'

test('amazon login runner opens visible browser, waits for confirmation and saves storage state', async () => {
  const events = []

  const runner = createAmazonLoginRunner({
    config: {
      playwright: {
        userDataDir: './sessions/amazon-profile',
        storageStatePath: './sessions/amazon-storage-state.json',
        channel: 'chrome',
        executablePath: '',
      },
    },
    launchPersistentContext: async (userDataDir, options) => {
      events.push({ type: 'launch', userDataDir, options })

      return {
        pages() {
          return []
        },
        async newPage() {
          return {
            async goto(url) {
              events.push({ type: 'goto', url })
            },
          }
        },
        async storageState(options) {
          events.push({ type: 'storageState', options })
        },
        async close() {
          events.push({ type: 'close' })
        },
      }
    },
    isInteractive: () => true,
    createPrompt: () => ({
      async question(prompt) {
        events.push({ type: 'question', prompt })
      },
      close() {
        events.push({ type: 'rlClose' })
      },
    }),
    writeOutput(message) {
      events.push({ type: 'output', message })
    },
  })

  await runner.run()

  assert.deepEqual(events.filter((event) => event.type === 'launch'), [
    {
      type: 'launch',
      userDataDir: './sessions/amazon-profile',
      options: {
        headless: false,
        channel: 'chrome',
      },
    },
  ])
  assert.equal(events.some((event) => event.type === 'goto' && event.url.includes('amazon.com.br')), true)
  assert.deepEqual(events.find((event) => event.type === 'storageState').options, {
    path: './sessions/amazon-storage-state.json',
    indexedDB: true,
  })
  assert.equal(events.at(-1).type, 'close')
})
