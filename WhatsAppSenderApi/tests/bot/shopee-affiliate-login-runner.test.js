import test from 'node:test'
import assert from 'node:assert/strict'

import { createShopeeAffiliateLoginRunner } from '../../src/bot/login-shopee-affiliate-session.js'

test('shopee affiliate login runner saves the session and keeps the browser alive after manual confirmation', async () => {
  const outputs = []
  const calls = []

  const runner = createShopeeAffiliateLoginRunner({
    shopeeAffiliate: {
      userDataDir: 'sessions/shopee-affiliate-profile',
      storageStatePath: 'sessions/shopee-affiliate-storage-state.json',
    },
    bootstrap: {
      async open() {
        return {
          mode: 'saved_profile',
          async ensureAuthenticated() {
            calls.push({ type: 'ensure' })
          },
          async save() {
            calls.push({ type: 'save' })
          },
          async close() {
            calls.push({ type: 'close' })
          },
        }
      },
    },
    isInteractive: () => true,
    writeOutput(message) {
      outputs.push(message)
    },
    waitForBrowserClose: async () => {
      calls.push({ type: 'wait_for_browser_close' })
    },
    createPrompt() {
      return {
        async question(prompt) {
          calls.push({ type: 'question', prompt })
          return ''
        },
        close() {
          calls.push({ type: 'prompt_close' })
        },
      }
    },
  })

  await runner.run()

  assert.deepEqual(calls, [
    {
      type: 'question',
      prompt: 'Faça login manual e pressione Enter quando terminar\n',
    },
    { type: 'ensure' },
    { type: 'save' },
    { type: 'wait_for_browser_close' },
    { type: 'prompt_close' },
  ])
  assert.match(outputs.join(''), /Navegador aberto/i)
  assert.match(outputs.join(''), /janela permanecera aberta/i)
})

test('shopee affiliate login runner does not call readline when the terminal is not interactive and keeps the browser alive', async () => {
  const outputs = []
  const calls = []

  const runner = createShopeeAffiliateLoginRunner({
    shopeeAffiliate: {
      userDataDir: 'sessions/shopee-affiliate-profile',
      storageStatePath: 'sessions/shopee-affiliate-storage-state.json',
    },
    bootstrap: {
      async open() {
        return {
          mode: 'saved_profile',
          async ensureAuthenticated() {
            calls.push({ type: 'ensure' })
          },
          async save() {
            calls.push({ type: 'save' })
          },
        }
      },
    },
    isInteractive: () => false,
    writeOutput(message) {
      outputs.push(message)
    },
    waitForManualConfirmation: async () => {
      calls.push({ type: 'wait_manual' })
    },
    waitForBrowserClose: async () => {
      calls.push({ type: 'wait_for_browser_close' })
    },
    createPrompt() {
      return {
        async question() {
          calls.push({ type: 'question' })
          return ''
        },
        close() {
          calls.push({ type: 'prompt_close' })
        },
      }
    },
  })

  await runner.run()

  assert.deepEqual(calls, [
    { type: 'wait_manual' },
    { type: 'ensure' },
    { type: 'save' },
    { type: 'wait_for_browser_close' },
    { type: 'prompt_close' },
  ])
  assert.match(outputs.join(''), /Terminal sem entrada interativa/i)
  assert.match(outputs.join(''), /janela permanecera aberta/i)
})

test('shopee affiliate login runner logs authentication errors and keeps the browser alive without closing the session', async () => {
  const outputs = []
  const errors = []
  const calls = []

  const runner = createShopeeAffiliateLoginRunner({
    shopeeAffiliate: {
      userDataDir: 'sessions/shopee-affiliate-profile',
      storageStatePath: 'sessions/shopee-affiliate-storage-state.json',
    },
    bootstrap: {
      async open() {
        return {
          mode: 'saved_profile',
          async ensureAuthenticated() {
            calls.push({ type: 'ensure' })
            throw new Error('Login was not completed for the affiliate profile.')
          },
          async save() {
            calls.push({ type: 'save' })
          },
          async close() {
            calls.push({ type: 'close' })
          },
        }
      },
    },
    isInteractive: () => true,
    writeOutput(message) {
      outputs.push(message)
    },
    writeError(message) {
      errors.push(message)
    },
    waitForBrowserClose: async () => {
      calls.push({ type: 'wait_for_browser_close' })
    },
    createPrompt() {
      return {
        async question(prompt) {
          calls.push({ type: 'question', prompt })
          return ''
        },
        close() {
          calls.push({ type: 'prompt_close' })
        },
      }
    },
  })

  await runner.run()

  assert.deepEqual(calls, [
    {
      type: 'question',
      prompt: 'Faça login manual e pressione Enter quando terminar\n',
    },
    { type: 'ensure' },
    { type: 'wait_for_browser_close' },
    { type: 'prompt_close' },
  ])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /Login was not completed/i)
  assert.match(outputs.join(''), /janela permanecera aberta/i)
})
