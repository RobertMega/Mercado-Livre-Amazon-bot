import test from 'node:test'
import assert from 'node:assert/strict'

import { createBotScheduler } from '../../src/bot/create-bot-scheduler.js'

function createLoggerDouble() {
  return {
    infoCalls: [],
    errorCalls: [],
    info(payload) {
      this.infoCalls.push(payload)
    },
    error(payload) {
      this.errorCalls.push(payload)
    },
  }
}

test('scheduler starts one interval per provider and logs runs with sent count', async () => {
  const logger = createLoggerDouble()
  const runCalls = []
  const intervals = []
  const clearedIntervals = []

  const scheduler = createBotScheduler({
    runner: {
      async runOnce() {
        runCalls.push('run')

        if (runCalls.length === 2) {
          throw new Error('tick failed')
        }

        return { sentCount: 1 }
      },
    },
    intervalMs: 60000,
    intervalMinutes: 1,
    provider: 'ML',
    logger,
    setIntervalFn(handler, delay) {
      intervals.push({ handler, delay })
      return { id: intervals.length }
    },
    clearIntervalFn(timer) {
      clearedIntervals.push(timer)
    },
  })

  await scheduler.runNow()
  scheduler.start()
  scheduler.start()
  await intervals[0].handler()
  scheduler.stop()

  assert.equal(runCalls.length, 2)
  assert.equal(intervals.length, 1)
  assert.deepEqual(clearedIntervals, [{ id: 1 }])
  assert.deepEqual(logger.infoCalls, [
    {
      event: 'run_started',
      provider: 'ML',
      interval_minutes: 1,
      trigger: 'manual',
    },
    {
      event: 'posts_sent_count',
      provider: 'ML',
      interval_minutes: 1,
      posts_sent_count: 1,
    },
    {
      event: 'scheduler_started',
      provider: 'ML',
      interval_minutes: 1,
      interval_ms: 60000,
      initial_delay_ms: 0,
    },
    {
      event: 'run_started',
      provider: 'ML',
      interval_minutes: 1,
      trigger: 'interval',
    },
  ])
  assert.equal(logger.errorCalls.length, 1)
  assert.equal(logger.errorCalls[0].event, 'run_failed')
  assert.equal(logger.errorCalls[0].provider, 'ML')
  assert.equal(logger.errorCalls[0].interval_minutes, 1)
  assert.equal(logger.errorCalls[0].errorMessage, 'tick failed')
})

test('scheduler skips overlapping runs for the same provider', async () => {
  const logger = createLoggerDouble()
  let releaseRun
  const scheduler = createBotScheduler({
    runner: {
      async runOnce() {
        await new Promise((resolve) => {
          releaseRun = resolve
        })
        return { sentCount: 2 }
      },
    },
    intervalMs: 5 * 60 * 1000,
    intervalMinutes: 5,
    provider: 'AMAZON',
    logger,
  })

  const firstRun = scheduler.runNow()
  const secondRun = await scheduler.runNow()
  releaseRun()
  await firstRun

  assert.deepEqual(secondRun, { skipped: true, reason: 'lock', provider: 'AMAZON' })
  assert.equal(logger.infoCalls.some((payload) => payload.event === 'run_skipped_due_to_lock' && payload.provider === 'AMAZON'), true)
})

test('scheduler supports a provider-specific initial delay before starting interval', async () => {
  const logger = createLoggerDouble()
  const timeouts = []
  const intervals = []

  const scheduler = createBotScheduler({
    runner: {
      async runOnce() {
        return { sentCount: 0 }
      },
    },
    intervalMs: 8 * 60 * 1000,
    intervalMinutes: 8,
    initialDelayMs: 60 * 1000,
    provider: 'AMAZON',
    logger,
    setTimeoutFn(handler, delay) {
      timeouts.push({ handler, delay })
      return { id: 'timeout' }
    },
    clearTimeoutFn() {},
    setIntervalFn(handler, delay) {
      intervals.push({ handler, delay })
      return { id: 'interval' }
    },
    clearIntervalFn() {},
  })

  scheduler.start()
  assert.equal(timeouts.length, 1)
  assert.equal(timeouts[0].delay, 60000)
  assert.equal(intervals.length, 0)

  await timeouts[0].handler()

  assert.equal(intervals.length, 1)
  assert.equal(intervals[0].delay, 8 * 60 * 1000)
  assert.equal(logger.infoCalls[0].event, 'scheduler_started')
  assert.equal(logger.infoCalls[0].provider, 'AMAZON')
  assert.equal(logger.infoCalls[0].interval_minutes, 8)
})
