import test from 'node:test'
import assert from 'node:assert/strict'

import { createProviderSchedulers } from '../../src/bot/create-provider-schedulers.js'

test('creates independent Mercado Livre and Amazon schedulers with provider intervals', () => {
  const created = []
  const providers = [
    {
      name: 'mercado_livre',
      enabled: true,
      postIntervalMinutes: 5,
      runner: { async runOnce() {} },
    },
    {
      name: 'amazon',
      enabled: true,
      postIntervalMinutes: 8,
      runner: { async runOnce() {} },
    },
  ]

  const schedulers = createProviderSchedulers({
    providers,
    createScheduler(options) {
      created.push(options)
      return {
        start() {},
        stop() {},
      }
    },
  })

  assert.equal(schedulers.length, 2)
  assert.equal(created[0].provider, 'ML')
  assert.equal(created[0].intervalMinutes, 5)
  assert.equal(created[0].intervalMs, 5 * 60 * 1000)
  assert.equal(created[0].initialDelayMs, 0)
  assert.equal(created[1].provider, 'AMAZON')
  assert.equal(created[1].intervalMinutes, 8)
  assert.equal(created[1].intervalMs, 8 * 60 * 1000)
  assert.equal(created[1].initialDelayMs, 90 * 1000)
})

test('provider scheduler starts, runs immediate providers, stops and closes each provider', async () => {
  const calls = []
  const providers = [
    {
      name: 'mercado_livre',
      enabled: true,
      postIntervalMinutes: 5,
      runner: { async runOnce() {} },
      async close() {
        calls.push('close:ml')
      },
    },
    {
      name: 'amazon',
      enabled: true,
      postIntervalMinutes: 8,
      runner: { async runOnce() {} },
      async close() {
        calls.push('close:amazon')
      },
    },
  ]

  const schedulers = createProviderSchedulers({
    providers,
    createScheduler(options) {
      return {
        async runNow() {
          calls.push(`run:${options.provider}`)
        },
        start() {
          calls.push(`start:${options.provider}`)
        },
        stop() {
          calls.push(`stop:${options.provider}`)
        },
      }
    },
  })

  await schedulers.runImmediate()
  schedulers.start()
  schedulers.stop()
  await schedulers.close()

  assert.deepEqual(calls, [
    'run:ML',
    'start:ML',
    'start:AMAZON',
    'stop:ML',
    'stop:AMAZON',
    'close:ml',
    'close:amazon',
  ])
})
