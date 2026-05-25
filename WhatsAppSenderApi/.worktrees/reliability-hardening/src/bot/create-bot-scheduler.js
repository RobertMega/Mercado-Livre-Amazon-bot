export function createBotScheduler({
  runner,
  intervalMs,
  logger = console,
}) {
  let timer = null

  return {
    async runNow() {
      return runner.runOnce()
    },

    start() {
      if (timer) {
        return
      }

      timer = setInterval(async () => {
        try {
          await runner.runOnce()
        } catch (error) {
          logger.error?.(error)
        }
      }, intervalMs)
    },

    stop() {
      if (!timer) {
        return
      }

      clearInterval(timer)
      timer = null
    },
  }
}
