import { formatOfferMessage } from './format-offer-message.js'
import {
  buildPostingBatchItemKey,
  buildPostingBatchMemoryKeys,
  createPostingBatchSelector,
} from './select-posting-batch.js'

function withTimeout(operation, timeoutMs, label) {
  if (!(timeoutMs > 0)) {
    return operation()
  }

  let timeoutId

  return Promise.race([
    operation(),
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    }),
  ]).finally(() => {
    clearTimeout(timeoutId)
  })
}

function normalizeCatalogSearchResult(result, filters) {
  if (Array.isArray(result)) {
    return {
      termsProcessed: filters.length,
      rawItemsFound: result.length,
      items: result,
    }
  }

  return {
    termsProcessed: result?.termsProcessed ?? filters.length,
    rawItemsFound: result?.rawItemsFound ?? result?.items?.length ?? 0,
    items: Array.isArray(result?.items) ? result.items : [],
  }
}

function normalizeAffiliateLinkResult(result) {
  if (typeof result === 'string') {
    return {
      url: result,
      source: 'affiliate',
      usedFallback: false,
    }
  }

  return {
    url: result?.url ?? '',
    source: result?.source ?? 'affiliate',
    usedFallback: Boolean(result?.usedFallback),
    fallbackReason: result?.fallbackReason,
  }
}

function rotateItems(items = [], startIndex = 0) {
  if (!items.length) {
    return []
  }

  const normalizedStartIndex = startIndex % items.length
  return [
    ...items.slice(normalizedStartIndex),
    ...items.slice(0, normalizedStartIndex),
  ]
}

function getNextFilterStartIndex(currentIndex, filterCount, postsPerRun) {
  if (!filterCount) {
    return 0
  }

  const requestedStep = Math.max(1, postsPerRun) % filterCount
  const step = requestedStep === 0 ? 1 : requestedStep
  return (currentIndex + step) % filterCount
}

function withoutSelectedSourceFilters(filters, selectedItems) {
  const selectedSourceFilters = new Set(
    selectedItems
      .map((item) => item.sourceFilter)
      .filter((sourceFilter) => typeof sourceFilter === 'string' && sourceFilter.trim()),
  )

  return filters.filter((filter) => !selectedSourceFilters.has(filter))
}

export function createBotRunner({
  config,
  catalogProvider,
  affiliateProvider,
  offerImageBuilder,
  linkPreviewBuilder,
  whatsappClient,
  repository,
  logger = console,
  selectionOptions = {},
  batchSelector,
}) {
  let isRunning = false
  let nextFilterStartIndex = 0
  const recentPublishedMemory = []
  const recentPublishedItemKeys = []
  const selector = batchSelector ?? createPostingBatchSelector({
    ...selectionOptions,
    recentItemKeys: recentPublishedItemKeys,
  })

  function rememberPublishedItem(item) {
    const memorySize = selectionOptions.recentMemorySize ?? 0
    if (!(memorySize > 0)) {
      return
    }

    const keys = buildPostingBatchMemoryKeys(item)
    if (!keys.length) {
      return
    }

    recentPublishedMemory.push(keys)

    while (recentPublishedMemory.length > memorySize) {
      recentPublishedMemory.shift()
    }

    recentPublishedItemKeys.splice(0, recentPublishedItemKeys.length, ...recentPublishedMemory.flat())
  }

  function logWhatsappSendRequested({
    executionId,
    itemId,
    type,
    body,
    caption,
    hasLinkPreview = false,
    hasImage = false,
  }) {
    logger.info?.({
      event: 'bot_whatsapp_send_requested',
      executionId,
      itemId,
      sessionId: config.sessionId,
      groupJid: config.groupJid,
      type,
      ...(body !== undefined ? { bodyLength: body.length } : {}),
      ...(caption !== undefined ? { captionLength: caption.length } : {}),
      hasLinkPreview,
      hasImage,
    })
  }

  function logWhatsappSendConfirmed({
    executionId,
    itemId,
    type,
    result,
  }) {
    logger.info?.({
      event: 'bot_whatsapp_send_confirmed',
      executionId,
      itemId,
      sessionId: config.sessionId,
      groupJid: config.groupJid,
      type,
      messageId: result?.messageId,
    })
  }

  async function searchCatalog(filters) {
    return normalizeCatalogSearchResult(await withTimeout(
      () => catalogProvider.search(filters, {
        targetItemCount: config.postsPerRun,
        isRecentlyPublished: async (item) => repository.hasPublishedItem(item),
      }),
      config.catalogSearchTimeoutMs ?? 180000,
      'Bot catalog search',
    ), filters)
  }

  async function selectBatch(filters, items) {
    return selector.select({
      filters,
      items,
      postsPerRun: config.postsPerRun,
      isRecentlyPublished: async (item) => repository.hasPublishedItem(item),
    })
  }

  return {
    async runOnce() {
      if (isRunning) {
        return { skipped: true, reason: 'already_running' }
      }

      isRunning = true

      const execution = await repository.createExecution({
        status: 'running',
        startedAt: new Date(),
      })

      let sentCount = 0
      let skippedDuplicates = 0

      try {
        const filtersForRun = rotateItems(config.filters, nextFilterStartIndex)
        nextFilterStartIndex = getNextFilterStartIndex(
          nextFilterStartIndex,
          filtersForRun.length,
          config.postsPerRun,
        )

        let searchResult = await searchCatalog(filtersForRun)
        let batch = await selectBatch(filtersForRun, searchResult.items)

        if (
          selectionOptions.forceFallbackSearchWhenSingleValidItem &&
          batch.selectedItems.length === 1 &&
          filtersForRun.length > 1
        ) {
          const fallbackFilters = withoutSelectedSourceFilters(
            rotateItems(config.filters, nextFilterStartIndex),
            batch.selectedItems,
          )

          if (fallbackFilters.length) {
            const fallbackSearchResult = await searchCatalog(fallbackFilters)
            const combinedItems = [
              ...searchResult.items,
              ...fallbackSearchResult.items,
            ]

            searchResult = {
              termsProcessed: searchResult.termsProcessed + fallbackSearchResult.termsProcessed,
              rawItemsFound: searchResult.rawItemsFound + fallbackSearchResult.rawItemsFound,
              items: combinedItems,
            }
            batch = await selectBatch([...filtersForRun, ...fallbackFilters], combinedItems)
          }
        }

        skippedDuplicates = batch.historyBlocked

        logger.info?.({
          event: 'bot_posting_batch_built',
          executionId: execution.id,
          termsProcessed: batch.termsProcessed ?? searchResult.termsProcessed,
          rawItemsFound: batch.rawItemsFound ?? searchResult.rawItemsFound,
          duplicatesRemoved: batch.duplicatesRemoved,
          historyBlocked: batch.historyBlocked,
          selectedCount: batch.selectedItems.length,
        })

        logger.info?.({
          event: 'bot_posting_batch_selected',
          executionId: execution.id,
          items: batch.selectedItems.map((item) => ({
            itemId: buildPostingBatchItemKey(item),
            title: item.title,
            sourceFilter: item.sourceFilter ?? null,
          })),
        })

        for (const item of batch.selectedItems) {
          const itemId = buildPostingBatchItemKey(item)
          let whatsappSendAttempt = null

          if (sentCount >= config.postsPerRun) {
            break
          }

          try {
            const affiliateLinkResult = normalizeAffiliateLinkResult(await withTimeout(
              () => affiliateProvider.getAffiliateLink(item),
              config.offerProcessingTimeoutMs ?? 45000,
              `Bot offer processing for ${itemId}`,
            ))
            const affiliateLink = affiliateLinkResult.url

            if (affiliateLinkResult.usedFallback) {
              logger.info?.({
                event: 'affiliate_link_fallback_used',
                executionId: execution.id,
                itemId,
                source: affiliateLinkResult.source,
                fallbackReason: affiliateLinkResult.fallbackReason ?? 'unknown',
              })
            }

            logger.info?.({
              event: 'affiliate_link_generated',
              executionId: execution.id,
              itemId,
              source: affiliateLinkResult.source,
              usedFallback: affiliateLinkResult.usedFallback,
            })

            const offerImageMessage = await withTimeout(
              async () => offerImageBuilder?.build?.(item, affiliateLink),
              config.offerProcessingTimeoutMs ?? 45000,
              `Bot offer rendering for ${itemId}`,
            )

            if (offerImageMessage?.imageBase64) {
              const sendPayload = {
                sessionId: config.sessionId,
                to: config.groupJid,
                caption: offerImageMessage.caption,
                imageBase64: offerImageMessage.imageBase64,
              }
              whatsappSendAttempt = { type: 'image' }
              logWhatsappSendRequested({
                executionId: execution.id,
                itemId,
                type: 'image',
                caption: offerImageMessage.caption,
                hasImage: true,
              })
              const sendResult = await withTimeout(
                () => whatsappClient.sendImageMessage(sendPayload),
                config.offerProcessingTimeoutMs ?? 45000,
                `Bot image send for ${itemId}`,
              )
              logWhatsappSendConfirmed({
                executionId: execution.id,
                itemId,
                type: 'image',
                result: sendResult,
              })
            } else {
              const body = formatOfferMessage(item, affiliateLink)
              const linkPreview = await withTimeout(
                async () => linkPreviewBuilder?.build?.(item, affiliateLink),
                config.offerProcessingTimeoutMs ?? 45000,
                `Bot link preview for ${itemId}`,
              )

              const sendPayload = {
                sessionId: config.sessionId,
                to: config.groupJid,
                body,
                linkPreview,
              }
              whatsappSendAttempt = { type: 'text' }
              logWhatsappSendRequested({
                executionId: execution.id,
                itemId,
                type: 'text',
                body,
                hasLinkPreview: Boolean(linkPreview),
              })
              const sendResult = await withTimeout(
                () => whatsappClient.sendTextMessage(sendPayload),
                config.offerProcessingTimeoutMs ?? 45000,
                `Bot text send for ${itemId}`,
              )
              logWhatsappSendConfirmed({
                executionId: execution.id,
                itemId,
                type: 'text',
                result: sendResult,
              })
            }

            await repository.markOfferPublished({
              executionId: execution.id,
              itemId,
              title: item.title,
              price: item.price,
              permalink: item.permalink,
              affiliateLink,
              groupJid: config.groupJid,
              postedAt: new Date(),
            })

            rememberPublishedItem(item)
            sentCount++
          } catch (error) {
            if (whatsappSendAttempt) {
              logger.error?.({
                event: 'bot_whatsapp_send_failed',
                executionId: execution.id,
                itemId,
                sessionId: config.sessionId,
                groupJid: config.groupJid,
                type: whatsappSendAttempt.type,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorName: error?.name,
                errorStack: error?.stack,
              })
            } else {
              logger.error?.(error)
            }

            await repository.recordOfferFailure({
              executionId: execution.id,
              itemId,
              reason: error.message,
              failedAt: new Date(),
            })
          }
        }

        await repository.finishExecution(execution.id, {
          status: 'completed',
          sentCount,
          skippedDuplicates,
          finishedAt: new Date(),
        })

        return {
          executionId: execution.id,
          sentCount,
          skippedDuplicates,
          duplicatesRemoved: batch.duplicatesRemoved,
          historyBlocked: batch.historyBlocked,
        }
      } catch (error) {
        await repository.finishExecution(execution.id, {
          status: 'failed',
          sentCount,
          skippedDuplicates,
          errorMessage: error.message,
          finishedAt: new Date(),
        })

        throw error
      } finally {
        isRunning = false
      }
    },
  }
}
