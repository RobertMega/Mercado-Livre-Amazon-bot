import { loadEnv } from '../lib/load-env.js'
import { getBotConfig, assertBotConfig } from './config.js'
import { createBotRunner } from './create-bot-runner.js'
import { createBotScheduler } from './create-bot-scheduler.js'
import { createOfferImageMessageBuilder } from './build-offer-image-message.js'
import { createOfferLinkPreviewBuilder } from './build-offer-link-preview.js'
import { createMercadoLivreCatalogProvider } from './providers/mercado-livre-catalog-provider.js'
import { createAffiliateLinkProvider } from './providers/affiliate-link-provider.js'
import { createWhatsappApiClient } from './clients/whatsapp-api-client.js'
import { createPrismaBotRepository } from './repositories/prisma-bot-repository.js'

loadEnv()

const config = getBotConfig()
assertBotConfig(config)

const repository = createPrismaBotRepository()
await repository.syncFilters(config.filters)

const activeFilters = await repository.listActiveFilters()
const affiliateProvider = createAffiliateLinkProvider(config.affiliate)
const catalogProvider = createMercadoLivreCatalogProvider({
  siteId: config.siteId,
  limitPerFilter: config.limitPerFilter,
})
const runner = createBotRunner({
  config: {
    sessionId: config.sessionId,
    groupJid: config.groupJid,
    postsPerRun: config.postsPerRun,
    filters: activeFilters.map((filter) => filter.term),
  },
  catalogProvider,
  affiliateProvider,
  offerImageBuilder: createOfferImageMessageBuilder(),
  linkPreviewBuilder: createOfferLinkPreviewBuilder(),
  whatsappClient: createWhatsappApiClient({
    baseUrl: config.apiBaseUrl,
  }),
  repository,
})

const scheduler = createBotScheduler({
  runner,
  intervalMs: config.postIntervalMinutes * 60 * 1000,
})

await scheduler.runNow()
scheduler.start()

process.on('SIGINT', () => {
  scheduler.stop()
  catalogProvider.close?.().catch(() => {})
  affiliateProvider.close?.().catch(() => {})
  process.exit(0)
})

process.on('SIGTERM', () => {
  scheduler.stop()
  catalogProvider.close?.().catch(() => {})
  affiliateProvider.close?.().catch(() => {})
  process.exit(0)
})
