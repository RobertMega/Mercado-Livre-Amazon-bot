import { formatOfferMessage } from './format-offer-message.js'

export function createBotRunner({
  config,
  catalogProvider,
  affiliateProvider,
  offerImageBuilder,
  linkPreviewBuilder,
  whatsappClient,
  repository,
  logger = console,
}) {
  let isRunning = false

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
        const items = await catalogProvider.search(config.filters)

        for (const item of items) {
          if (sentCount >= config.postsPerRun) {
            break
          }

          if (await repository.hasPublishedItem(item.id)) {
            skippedDuplicates++
            continue
          }

          try {
            const affiliateLink = await affiliateProvider.getAffiliateLink(item)
            const offerImageMessage = await offerImageBuilder?.build?.(item, affiliateLink)

            if (offerImageMessage?.imageBase64) {
              await whatsappClient.sendImageMessage({
                sessionId: config.sessionId,
                to: config.groupJid,
                caption: offerImageMessage.caption,
                imageBase64: offerImageMessage.imageBase64,
              })
            } else {
              const body = formatOfferMessage(item, affiliateLink)
              const linkPreview = await linkPreviewBuilder?.build?.(item, affiliateLink)

              await whatsappClient.sendTextMessage({
                sessionId: config.sessionId,
                to: config.groupJid,
                body,
                linkPreview,
              })
            }

            await repository.markOfferPublished({
              executionId: execution.id,
              itemId: item.id,
              title: item.title,
              price: item.price,
              permalink: item.permalink,
              affiliateLink,
              groupJid: config.groupJid,
              postedAt: new Date(),
            })

            sentCount++
          } catch (error) {
            logger.error?.(error)
            await repository.recordOfferFailure({
              executionId: execution.id,
              itemId: item.id,
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
