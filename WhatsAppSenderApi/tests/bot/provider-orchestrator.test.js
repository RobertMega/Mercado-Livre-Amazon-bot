import test from 'node:test'
import assert from 'node:assert/strict'

import { createProviderOrchestrator } from '../../src/bot/provider-orchestrator.js'

test('provider orchestrator alternates enabled providers between runs', async () => {
  const calls = []
  const orchestrator = createProviderOrchestrator({
    providers: [
      { name: 'mercado_livre', enabled: true, runner: { async runOnce() { calls.push('ml'); return { provider: 'ml' } } } },
      { name: 'amazon', enabled: true, runner: { async runOnce() { calls.push('amazon'); return { provider: 'amazon' } } } },
    ],
  })

  assert.deepEqual(await orchestrator.runOnce(), { provider: 'ml', providerName: 'mercado_livre' })
  assert.deepEqual(await orchestrator.runOnce(), { provider: 'amazon', providerName: 'amazon' })
  assert.deepEqual(await orchestrator.runOnce(), { provider: 'ml', providerName: 'mercado_livre' })
  assert.deepEqual(calls, ['ml', 'amazon', 'ml'])
})

test('provider orchestrator falls back to the next provider when the selected provider fails', async () => {
  const errors = []
  const orchestrator = createProviderOrchestrator({
    providers: [
      { name: 'mercado_livre', enabled: true, runner: { async runOnce() { throw new Error('ml failed') } } },
      { name: 'amazon', enabled: true, runner: { async runOnce() { return { sentCount: 1 } } } },
    ],
    logger: {
      error(payload) {
        errors.push(payload)
      },
    },
  })

  assert.deepEqual(await orchestrator.runOnce(), { sentCount: 1, providerName: 'amazon' })
  assert.equal(errors[0].event, 'provider_run_failed')
  assert.equal(errors[0].providerName, 'mercado_livre')
})

test('provider orchestrator rejects startup with no enabled providers', () => {
  assert.throws(
    () => createProviderOrchestrator({
      providers: [
        { name: 'mercado_livre', enabled: false, runner: { async runOnce() {} } },
      ],
    }),
    /No enabled bot providers/,
  )
})
