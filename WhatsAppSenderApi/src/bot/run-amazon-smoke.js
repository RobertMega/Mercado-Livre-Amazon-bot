import { loadEnv } from '../lib/load-env.js'
import { getBotConfig } from './config.js'
import { getAmazonConfig, assertAmazonConfig } from '../config/amazon.js'
import { createAmazonCatalogProvider } from './providers/amazon-catalog-provider.js'
import { createAmazonAffiliateProvider } from './providers/amazon-affiliate-provider.js'
import { createWhatsappApiClient } from './clients/whatsapp-api-client.js'
import { createPrismaBotRepository } from './repositories/prisma-bot-repository.js'
import { createPostingBatchSelector, buildPostingBatchItemKey } from './select-posting-batch.js'
import { formatOfferMessage } from './format-offer-message.js'

function log(payload) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    ...payload,
  }, null, 2))
}

function createSmokeLogger() {
  return {
    info(payload) {
      log(payload)
    },
    warn(payload) {
      log({ level: 'warn', ...payload })
    },
    error(payload) {
      log({ level: 'error', ...payload })
    },
  }
}

async function runSearchExecution({
  executionNumber,
  term,
  amazonProvider,
  repository,
  selector,
  amazonConfig,
}) {
  log({
    event: 'amazon_smoke_execution_started',
    executionNumber,
    term,
  })

  const searchResult = await amazonProvider.search([term], {
    targetItemCount: Math.max(amazonConfig.postsPerRun, 3),
    isRecentlyPublished: async (item) => repository.hasPublishedItem(buildPostingBatchItemKey(item)),
  })

  log({
    event: 'amazon_smoke_search_result',
    executionNumber,
    term,
    termsProcessed: searchResult.termsProcessed,
    rawItemsFound: searchResult.rawItemsFound,
    usableItemsFound: searchResult.items.length,
  })

  const batch = await selector.select({
    filters: [term],
    items: searchResult.items,
    postsPerRun: 1,
    isRecentlyPublished: async (item) => repository.hasPublishedItem(buildPostingBatchItemKey(item)),
  })

  log({
    event: 'amazon_smoke_batch_selected',
    executionNumber,
    duplicatesRemoved: batch.duplicatesRemoved,
    historyBlocked: batch.historyBlocked,
    selectedCount: batch.selectedItems.length,
    selectedItems: batch.selectedItems.map((item) => ({
      key: buildPostingBatchItemKey(item),
      id: item.id,
      title: item.title,
      price: item.price,
      originalPrice: item.originalPrice,
      discountPercent: item.discountPercent,
      rating: item.rating,
      coupon: item.coupon,
      permalink: item.permalink,
    })),
  })

  return batch.selectedItems[0] || null
}

export async function runAmazonSmoke() {
  loadEnv()

  process.env.ML_ENABLED = 'false'
  process.env.AMAZON_ENABLED = 'true'
  process.env.AMAZON_PLAYWRIGHT_HEADLESS = process.env.AMAZON_PLAYWRIGHT_HEADLESS || 'false'
  process.env.AMAZON_POSTS_PER_RUN = process.env.AMAZON_POSTS_PER_RUN || '1'

  const botConfig = getBotConfig()
  const amazonConfig = getAmazonConfig()
  assertAmazonConfig(amazonConfig)

  const term = (process.env.AMAZON_SMOKE_TERM || amazonConfig.searchTerms[0] || '').trim()
  if (!term) {
    throw new Error('Missing AMAZON_SMOKE_TERM or AMAZON_SEARCH_TERMS for Amazon smoke run.')
  }

  const logger = createSmokeLogger()
  const repository = createPrismaBotRepository()
  const amazonProvider = createAmazonCatalogProvider({
    maxPagesPerFilter: Number.parseInt(process.env.AMAZON_SMOKE_MAX_PAGES || '1', 10),
    minDelayMs: amazonConfig.minDelayMs,
    maxDelayMs: amazonConfig.maxDelayMs,
    logger,
    ...amazonConfig.playwright,
  })
  const affiliateProvider = createAmazonAffiliateProvider({
    ...amazonConfig.affiliate,
    logger,
  })
  const whatsappClient = createWhatsappApiClient({
    baseUrl: botConfig.apiBaseUrl,
  })
  const selector = createPostingBatchSelector()

  log({
    event: 'amazon_smoke_config',
    mlEnabled: false,
    amazonEnabled: true,
    headless: amazonConfig.playwright.headless,
    storageStatePath: amazonConfig.playwright.storageStatePath,
    userDataDir: amazonConfig.playwright.userDataDir,
    term,
    postsPerRun: amazonConfig.postsPerRun,
  })

  try {
    const execution = await repository.createExecution({
      status: 'running',
      startedAt: new Date(),
    })

    const item = await runSearchExecution({
      executionNumber: 1,
      term,
      amazonProvider,
      repository,
      selector,
      amazonConfig,
    })

    if (!item) {
      await repository.finishExecution(execution.id, {
        status: 'completed',
        sentCount: 0,
        skippedDuplicates: 0,
        finishedAt: new Date(),
      })
      log({ event: 'amazon_smoke_no_item_selected' })
      return
    }

    const affiliateLinkResult = await affiliateProvider.getAffiliateLink(item)
    const affiliateLink = typeof affiliateLinkResult === 'string'
      ? affiliateLinkResult
      : affiliateLinkResult.url

    log({
      event: 'amazon_smoke_affiliate_link_generated',
      itemId: item.id,
      itemKey: buildPostingBatchItemKey(item),
      url: affiliateLink,
      source: affiliateLinkResult.source,
      usedFallback: affiliateLinkResult.usedFallback,
      fallbackReason: affiliateLinkResult.fallbackReason || null,
    })

    const body = formatOfferMessage(item, affiliateLink)
    log({
      event: 'amazon_smoke_whatsapp_message_formatted',
      itemId: item.id,
      body,
    })

    const sendResult = await whatsappClient.sendTextMessage({
      sessionId: botConfig.sessionId,
      to: botConfig.groupJid,
      body,
      linkPreview: null,
    })

    log({
      event: 'amazon_smoke_whatsapp_send_completed',
      sessionId: botConfig.sessionId,
      groupJid: botConfig.groupJid,
      result: sendResult,
    })

    await repository.markOfferPublished({
      executionId: execution.id,
      itemId: buildPostingBatchItemKey(item),
      title: item.title,
      price: item.price,
      permalink: item.permalink,
      affiliateLink,
      groupJid: botConfig.groupJid,
      postedAt: new Date(),
    })

    await repository.finishExecution(execution.id, {
      status: 'completed',
      sentCount: 1,
      skippedDuplicates: 0,
      finishedAt: new Date(),
    })

    log({
      event: 'amazon_smoke_history_recorded',
      itemKey: buildPostingBatchItemKey(item),
    })

    const secondItem = await runSearchExecution({
      executionNumber: 2,
      term,
      amazonProvider,
      repository,
      selector,
      amazonConfig,
    })

    log({
      event: 'amazon_smoke_history_validation_completed',
      firstItemKey: buildPostingBatchItemKey(item),
      secondExecutionSelectedItemKey: secondItem ? buildPostingBatchItemKey(secondItem) : null,
      repeatedFirstItem: secondItem ? buildPostingBatchItemKey(secondItem) === buildPostingBatchItemKey(item) : false,
    })
  } finally {
    await amazonProvider.close?.()
    await affiliateProvider.close?.()
  }
}

await runAmazonSmoke()
