import { formatOfferMessage } from './format-offer-message.js'

export function buildPublishedOfferKey(item) {
  const platform = typeof item.platform === 'string' ? item.platform.trim() : ''

  if (!platform) {
    return item.id
  }

  return `${platform}:${item.id}`
}

export function createOfferPublisher({
  config,
  affiliateProvider,
  offerImageBuilder,
  linkPreviewBuilder,
  whatsappClient,
  repository,
  logger = console,
} = {}) {
  function logInfo(payload) {
    logger.info?.(payload)
  }

  function logWarn(payload) {
    logger.warn?.(payload)
  }

  function logError(payload) {
    logger.error?.(payload)
  }

  function logWhatsappSendRequested({
    executionId,
    itemId,
    publishedOfferKey,
    type,
    body,
    caption,
    hasLinkPreview = false,
    hasImage = false,
  }) {
    logInfo({
      event: 'bot_whatsapp_send_requested',
      executionId,
      itemId,
      publishedOfferKey,
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
    publishedOfferKey,
    type,
    result,
  }) {
    logInfo({
      event: 'bot_whatsapp_send_confirmed',
      executionId,
      itemId,
      publishedOfferKey,
      sessionId: config.sessionId,
      groupJid: config.groupJid,
      type,
      messageId: result?.messageId,
    })
  }

  return {
    async publishItem(item, executionId = null) {
      const publishedOfferKey = buildPublishedOfferKey(item)

      if (await repository.hasPublishedItem(publishedOfferKey)) {
        logWarn({
          event: 'bot_offer_skipped',
          executionId,
          itemId: item.id,
          publishedOfferKey,
          reason: 'duplicate',
        })

        return {
          skipped: true,
          reason: 'duplicate',
          itemId: item.id,
          publishedOfferKey,
        }
      }

      let whatsappSendAttempt = null

      try {
        const affiliateLink = await affiliateProvider.getAffiliateLink(item)
        const offerImageMessage = await offerImageBuilder?.build?.(item, affiliateLink)

        if (offerImageMessage?.imageBase64) {
          const sendPayload = {
            sessionId: config.sessionId,
            to: config.groupJid,
            caption: offerImageMessage.caption,
            imageBase64: offerImageMessage.imageBase64,
          }
          whatsappSendAttempt = { type: 'image' }
          logWhatsappSendRequested({
            executionId,
            itemId: item.id,
            publishedOfferKey,
            type: 'image',
            caption: offerImageMessage.caption,
            hasImage: true,
          })
          const sendResult = await whatsappClient.sendImageMessage(sendPayload)
          logWhatsappSendConfirmed({
            executionId,
            itemId: item.id,
            publishedOfferKey,
            type: 'image',
            result: sendResult,
          })
        } else {
          const body = formatOfferMessage(item, affiliateLink)
          const linkPreview = await linkPreviewBuilder?.build?.(item, affiliateLink)

          const sendPayload = {
            sessionId: config.sessionId,
            to: config.groupJid,
            body,
            linkPreview,
          }
          whatsappSendAttempt = { type: 'text' }
          logWhatsappSendRequested({
            executionId,
            itemId: item.id,
            publishedOfferKey,
            type: 'text',
            body,
            hasLinkPreview: Boolean(linkPreview),
          })
          const sendResult = await whatsappClient.sendTextMessage(sendPayload)
          logWhatsappSendConfirmed({
            executionId,
            itemId: item.id,
            publishedOfferKey,
            type: 'text',
            result: sendResult,
          })
        }

        await repository.markOfferPublished({
          executionId,
          itemId: publishedOfferKey,
          title: item.title,
          price: item.price,
          permalink: item.permalink,
          affiliateLink,
          groupJid: config.groupJid,
          postedAt: new Date(),
        })

        logInfo({
          event: 'bot_offer_published',
          executionId,
          itemId: item.id,
          publishedOfferKey,
          platform: item.platform || 'mercado_livre',
        })

        return {
          skipped: false,
          itemId: item.id,
          publishedOfferKey,
          affiliateLink,
        }
      } catch (error) {
        logError({
          event: 'bot_offer_publication_failed',
          executionId,
          itemId: item.id,
          publishedOfferKey,
          errorMessage: error instanceof Error ? error.message : String(error),
          error,
        })

        if (whatsappSendAttempt) {
          logError({
            event: 'bot_whatsapp_send_failed',
            executionId,
            itemId: item.id,
            publishedOfferKey,
            sessionId: config.sessionId,
            groupJid: config.groupJid,
            type: whatsappSendAttempt.type,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorName: error?.name,
            errorStack: error?.stack,
          })
        }

        if (executionId) {
          await repository.recordOfferFailure({
            executionId,
            itemId: item.id,
            reason: error.message,
            failedAt: new Date(),
          })
        }

        logWarn({
          event: 'bot_offer_skipped',
          executionId,
          itemId: item.id,
          publishedOfferKey,
          reason: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        })

        return {
          skipped: true,
          reason: 'failed',
          itemId: item.id,
          publishedOfferKey,
          error,
        }
      }
    },
  }
}
