export function createBotScheduler({
  runner,
  intervalMs,
  intervalMinutes = intervalMs / 60 / 1000,
  provider = 'UNKNOWN',
  initialDelayMs = 0,
  logger = console,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  let timer = null
  let initialTimer = null
  let isRunning = false

  function resolveSentCount(result) {
    return result?.sentCount ?? result?.postsSentCount ?? result?.postedCount ?? 0
  }

  async function runWithLock({ trigger, rethrow = false } = {}) {
    if (isRunning) {
      logger.info?.({
        event: 'run_skipped_due_to_lock',
        provider,
        interval_minutes: intervalMinutes,
        trigger,
      })
      return { skipped: true, reason: 'lock', provider }
    }

    isRunning = true
    logger.info?.({
      event: 'run_started',
      provider,
      interval_minutes: intervalMinutes,
      trigger,
    })

    try {
      const result = await runner.runOnce()
      logger.info?.({
        event: 'posts_sent_count',
        provider,
        interval_minutes: intervalMinutes,
        posts_sent_count: resolveSentCount(result),
      })
      return result
    } catch (error) {
      logger.error?.({
        event: 'run_failed',
        provider,
        interval_minutes: intervalMinutes,
        errorMessage: error.message,
      })

      if (rethrow) {
        throw error
      }

      return { failed: true, error, provider }
    } finally {
      isRunning = false
    }
  }

  return {
    async runNow() {
      return runWithLock({ trigger: 'manual', rethrow: true })
    },

    start() {
      if (timer || initialTimer) {
        return
      }

      logger.info?.({
        event: 'scheduler_started',
        provider,
        interval_minutes: intervalMinutes,
        interval_ms: intervalMs,
        initial_delay_ms: initialDelayMs,
      })

      const startInterval = () => {
        timer = setIntervalFn(() => runWithLock({ trigger: 'interval' }), intervalMs)
      }

      if (initialDelayMs > 0) {
        initialTimer = setTimeoutFn(async () => {
          initialTimer = null
          await runWithLock({ trigger: 'initial_delay' })
          startInterval()
        }, initialDelayMs)
        return
      }

      startInterval()
    },

    stop() {
      if (initialTimer) {
        clearTimeoutFn(initialTimer)
        initialTimer = null
      }

      if (!timer) {
        return
      }

      clearIntervalFn(timer)
      timer = null
    },
  }
}
