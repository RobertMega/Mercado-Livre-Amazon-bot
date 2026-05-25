export function createOfferIngestionService({
  marketplaceRouter,
  offerPublisher,
} = {}) {
  return {
    async publishIncomingOffer(payload) {
      const item = await marketplaceRouter.enrichOffer(payload)
      const result = await offerPublisher.publishItem(item)

      return {
        success: !result.skipped || result.reason === 'duplicate',
        platform: item.platform,
        itemId: item.id,
        skipped: result.skipped,
        reason: result.reason || null,
      }
    },
  }
}
