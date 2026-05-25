import { loadEnv } from '../../lib/load-env.js'
import { getBotConfig } from '../../bot/config.js'
import {
  getAmazonAutomationPlaywrightConfig,
  getAmazonConfig,
  assertAmazonConfig,
} from '../../config/amazon.js'
import { buildAmazonApiApp } from './amazon-api-server.js'
import { createBotRunner } from '../../bot/create-bot-runner.js'
import { createOfferImageMessageBuilder } from '../../bot/build-offer-image-message.js'
import { createOfferLinkPreviewBuilder } from '../../bot/build-offer-link-preview.js'
import { createWhatsappApiClient } from '../../bot/clients/whatsapp-api-client.js'
import { createPrismaBotRepository } from '../../bot/repositories/prisma-bot-repository.js'
import { createAmazonCatalogProvider } from '../../bot/providers/amazon-catalog-provider.js'
import { createAmazonAffiliateProvider } from '../../bot/providers/amazon-affiliate-provider.js'

loadEnv()

const botConfig = getBotConfig()
const amazonConfig = getAmazonConfig()
assertAmazonConfig({
  ...amazonConfig,
  enabled: true,
})

if (!botConfig.sessionId || !botConfig.groupJid) {
  throw new Error('Missing required bot configuration: WHATSAPP_SESSION_ID, WHATSAPP_GROUP_JID')
}

const repository = createPrismaBotRepository()
await repository.markStaleExecutionsAsFailed()

const amazonPlaywrightConfig = getAmazonAutomationPlaywrightConfig(amazonConfig)
const amazonProvider = createAmazonCatalogProvider({
  maxPagesPerFilter: amazonConfig.maxPagesPerFilter,
  minDelayMs: amazonConfig.minDelayMs,
  maxDelayMs: amazonConfig.maxDelayMs,
  preserveSearchTermOrder: true,
  ...amazonPlaywrightConfig,
})

const runner = createBotRunner({
  config: {
    sessionId: botConfig.sessionId,
    groupJid: botConfig.groupJid,
    postsPerRun: amazonConfig.postsPerRun,
    filters: amazonConfig.searchTerms,
    catalogSearchTimeoutMs: botConfig.catalogSearchTimeoutMs,
    offerProcessingTimeoutMs: botConfig.offerProcessingTimeoutMs,
  },
  catalogProvider: amazonProvider,
  affiliateProvider: createAmazonAffiliateProvider({
    ...amazonConfig.affiliate,
    ...amazonPlaywrightConfig,
  }),
  offerImageBuilder: createOfferImageMessageBuilder(),
  linkPreviewBuilder: createOfferLinkPreviewBuilder(),
  whatsappClient: createWhatsappApiClient({
    baseUrl: botConfig.apiBaseUrl,
  }),
  repository,
  selectionOptions: {
    preserveSourceOrder: true,
    maxItemsPerSourceFilter: 1,
    recentMemorySize: 10,
    forceFallbackSearchWhenSingleValidItem: true,
  },
})

const app = await buildAmazonApiApp({
  amazonProvider,
  runner,
  config: amazonConfig,
})

try {
  await app.listen({ port: amazonConfig.api.port, host: process.env.HOST || '0.0.0.0' })
  app.log.info(`Amazon API: http://localhost:${amazonConfig.api.port}`)
} catch (error) {
  app.log.error(error)
  process.exit(1)
}

process.on('SIGINT', async () => {
  await amazonProvider.close?.().catch(() => {})
  await app.close().catch(() => {})
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await amazonProvider.close?.().catch(() => {})
  await app.close().catch(() => {})
  process.exit(0)
})
