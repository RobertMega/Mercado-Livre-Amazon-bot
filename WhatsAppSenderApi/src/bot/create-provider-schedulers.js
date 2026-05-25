import { createBotScheduler } from './create-bot-scheduler.js'

const PROVIDER_LABELS = {
  mercado_livre: 'ML',
  amazon: 'AMAZON',
}

function resolveProviderLabel(name) {
  return PROVIDER_LABELS[name] || String(name || 'UNKNOWN').toUpperCase()
}

function resolveInitialDelayMs(provider, enabledProviders) {
  if (provider.name === 'amazon' && enabledProviders.length > 1) {
    return 90 * 1000
  }

  return 0
}

export function createProviderSchedulers({
  providers = [],
  logger = console,
  createScheduler = createBotScheduler,
} = {}) {
  const enabledProviders = providers.filter((provider) => provider.enabled !== false)

  const schedulers = enabledProviders.map((provider) => {
    const intervalMinutes = provider.postIntervalMinutes || 10
    const initialDelayMs = resolveInitialDelayMs(provider, enabledProviders)

    return {
      provider,
      initialDelayMs,
      scheduler: createScheduler({
        runner: provider.runner,
        provider: resolveProviderLabel(provider.name),
        intervalMinutes,
        intervalMs: intervalMinutes * 60 * 1000,
        initialDelayMs,
        logger,
      }),
    }
  })

  const schedulerList = schedulers.map((entry) => entry.scheduler)

  schedulerList.runImmediate = async () => {
    for (const entry of schedulers) {
      if (entry.initialDelayMs > 0) {
        continue
      }

      await entry.scheduler.runNow?.()
    }
  }

  schedulerList.start = () => {
    for (const entry of schedulers) {
      entry.scheduler.start?.()
    }
  }

  schedulerList.stop = () => {
    for (const entry of schedulers) {
      entry.scheduler.stop?.()
    }
  }

  schedulerList.close = async () => {
    await Promise.all(enabledProviders.map((provider) => provider.close?.()))
  }

  return schedulerList
}
