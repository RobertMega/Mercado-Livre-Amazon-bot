export function createProviderOrchestrator({
  providers = [],
  logger = console,
} = {}) {
  const enabledProviders = providers.filter((provider) => provider.enabled !== false)

  if (!enabledProviders.length) {
    throw new Error('No enabled bot providers configured.')
  }

  let nextProviderIndex = 0

  return {
    async runOnce() {
      const failures = []

      for (let attempt = 0; attempt < enabledProviders.length; attempt += 1) {
        const providerIndex = (nextProviderIndex + attempt) % enabledProviders.length
        const provider = enabledProviders[providerIndex]

        try {
          const result = await provider.runner.runOnce()
          nextProviderIndex = (providerIndex + 1) % enabledProviders.length

          return {
            ...result,
            providerName: provider.name,
          }
        } catch (error) {
          failures.push(error)
          logger.error?.({
            event: 'provider_run_failed',
            providerName: provider.name,
            errorMessage: error.message,
          })
        }
      }

      throw failures.at(-1)
    },
    async close() {
      await Promise.all(enabledProviders.map((provider) => provider.close?.()))
    },
  }
}
