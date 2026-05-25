import { loadEnv } from '../lib/load-env.js'
import { getBotConfig, assertBotConfig } from './config.js'
import {
  getAmazonAutomationPlaywrightConfig,
  getAmazonConfig,
  assertAmazonConfig,
} from '../config/amazon.js'
import { createBotRunner } from './create-bot-runner.js'
import { createProviderSchedulers } from './create-provider-schedulers.js'
import { createOfferImageMessageBuilder } from './build-offer-image-message.js'
import { createOfferLinkPreviewBuilder } from './build-offer-link-preview.js'
import { createMercadoLivreCatalogProvider } from './providers/mercado-livre-catalog-provider.js'
import { createAffiliateLinkProvider } from './providers/affiliate-link-provider.js'
import { createAmazonCatalogProvider } from './providers/amazon-catalog-provider.js'
import { createAmazonAffiliateProvider } from './providers/amazon-affiliate-provider.js'
import { createWhatsappApiClient } from './clients/whatsapp-api-client.js'
import { createPrismaBotRepository } from './repositories/prisma-bot-repository.js'

loadEnv()

const config = getBotConfig()
const amazonConfig = getAmazonConfig()
assertBotConfig(config)
assertAmazonConfig(amazonConfig)

const repository = createPrismaBotRepository()
await repository.markStaleExecutionsAsFailed()

const offerImageBuilder = createOfferImageMessageBuilder()
const linkPreviewBuilder = createOfferLinkPreviewBuilder()
const whatsappClient = createWhatsappApiClient({
  baseUrl: config.apiBaseUrl,
})
const providers = []

if (config.mlEnabled !== false) {
  await repository.syncFilters(config.filters)
  const activeFilters = await repository.listActiveFilters()
  const affiliateProvider = createAffiliateLinkProvider(config.affiliate)
  const catalogProvider = createMercadoLivreCatalogProvider({
    siteId: config.siteId,
    limitPerFilter: config.limitPerFilter,
    ...config.catalog,
  })

  providers.push({
    name: 'mercado_livre',
    enabled: true,
    postIntervalMinutes: config.postIntervalMinutes,
    runner: createBotRunner({
      config: {
        sessionId: config.sessionId,
        groupJid: config.groupJid,
        postsPerRun: config.postsPerRun,
        filters: activeFilters.map((filter) => filter.term),
        catalogSearchTimeoutMs: config.catalogSearchTimeoutMs,
        offerProcessingTimeoutMs: config.offerProcessingTimeoutMs,
      },
      catalogProvider,
      affiliateProvider,
      offerImageBuilder,
      linkPreviewBuilder,
      whatsappClient,
      repository,
      selectionOptions: {
        preserveSourceOrder: true,
        maxItemsPerSourceFilter: 1,
        recentMemorySize: 10,
        forceFallbackSearchWhenSingleValidItem: true,
      },
    }),
    close: async () => {
      await catalogProvider.close?.()
      await affiliateProvider.close?.()
    },
  })
}

if (amazonConfig.enabled) {
  const amazonPlaywrightConfig = getAmazonAutomationPlaywrightConfig(amazonConfig)
  const affiliateProvider = createAmazonAffiliateProvider({
    ...amazonConfig.affiliate,
    ...amazonPlaywrightConfig,
  })
  const catalogProvider = createAmazonCatalogProvider({
    maxPagesPerFilter: amazonConfig.maxPagesPerFilter,
    minDelayMs: amazonConfig.minDelayMs,
    maxDelayMs: amazonConfig.maxDelayMs,
    preserveSearchTermOrder: true,
    ...amazonPlaywrightConfig,
  })

  providers.push({
    name: 'amazon',
    enabled: true,
    postIntervalMinutes: amazonConfig.postIntervalMinutes,
    runner: createBotRunner({
      config: {
        sessionId: config.sessionId,
        groupJid: config.groupJid,
        postsPerRun: amazonConfig.postsPerRun,
        filters: amazonConfig.searchTerms,
        catalogSearchTimeoutMs: config.catalogSearchTimeoutMs,
        offerProcessingTimeoutMs: config.offerProcessingTimeoutMs,
      },
      catalogProvider,
      affiliateProvider,
      offerImageBuilder,
      linkPreviewBuilder,
      whatsappClient,
      repository,
      selectionOptions: {
        preserveSourceOrder: true,
        maxItemsPerSourceFilter: 1,
        recentMemorySize: 10,
        forceFallbackSearchWhenSingleValidItem: true,
      },
    }),
    close: async () => {
      await catalogProvider.close?.()
      await affiliateProvider.close?.()
    },
  })
}

if (!providers.length) {
  throw new Error('No enabled bot providers configured.')
}

const schedulers = createProviderSchedulers({
  providers,
})

try {
  await schedulers.runImmediate()
} catch (error) {
  console.error(error)
}

schedulers.start()

process.on('SIGINT', () => {
  schedulers.stop()
  schedulers.close?.().catch(() => {})
  process.exit(0)
})

process.on('SIGTERM', () => {
  schedulers.stop()
  schedulers.close?.().catch(() => {})
  process.exit(0)
})
