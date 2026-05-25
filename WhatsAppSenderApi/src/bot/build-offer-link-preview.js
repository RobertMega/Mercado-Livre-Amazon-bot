import sharp from 'sharp'

function formatPrice(price, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(price)
}

export function createOfferLinkPreviewBuilder({
  fetchImpl = fetch,
  sharpFactory = sharp,
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

      const inputBuffer = Buffer.from(await response.arrayBuffer())
      const jpegThumbnail = await sharpFactory(inputBuffer)
        .resize({ width: 192 })
        .jpeg()
        .toBuffer()

      return {
        'canonical-url': affiliateLink,
        'matched-text': affiliateLink,
        title: item.title,
        description: `Preco: ${formatPrice(item.price, item.currencyId || 'BRL')}`,
        jpegThumbnail: jpegThumbnail.toString('base64'),
      }
    },
  }
}
