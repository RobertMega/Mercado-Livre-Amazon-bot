import { buildOfferBody } from './build-offer-body.js'

export function createOfferImageMessageBuilder({
  fetchImpl = fetch,
} = {}) {
  return {
    async build(item, affiliateLink) {
      if (!item.thumbnailUrl) {
        return null
      }

      const response = await fetchImpl(item.thumbnailUrl)
      if (!response.ok) {
        return null
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer())

      return {
        caption: buildOfferBody(item, affiliateLink),
        imageBase64: imageBuffer.toString('base64'),
      }
    },
  }
}
