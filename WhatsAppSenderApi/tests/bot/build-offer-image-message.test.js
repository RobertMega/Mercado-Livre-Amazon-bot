import test from 'node:test'
import assert from 'node:assert/strict'

import { createOfferImageMessageBuilder } from '../../src/bot/build-offer-image-message.js'

test('offer image message builder fetches the product thumbnail and creates a coupon-aware caption', async () => {
  const requestedUrls = []

  const builder = createOfferImageMessageBuilder({
    fetchImpl: async (url) => {
      requestedUrls.push(url)

      return {
        ok: true,
        async arrayBuffer() {
          return Uint8Array.from([1, 2, 3, 4]).buffer
        },
      }
    },
  })

  const imageMessage = await builder.build(
    {
      title: 'Notebook Gamer',
      price: 8999.9,
      currencyId: 'BRL',
      coupon: 'GAMER100',
      thumbnailUrl: 'https://http2.mlstatic.com/product.webp',
    },
    'https://meli.la/1GHAQVQ',
  )

  assert.deepEqual(requestedUrls, ['https://http2.mlstatic.com/product.webp'])
  assert.deepEqual(imageMessage, {
    caption: [
      '🔥 PROMOÇÃO',
      '📦 Notebook Gamer',
      '💰 R$\u00a08.999,90',
      '',
      '🎟️ CUPOM: GAMER100',
      '',
      '👉 LINK:',
      'https://meli.la/1GHAQVQ',
    ].join('\n'),
    imageBase64: Buffer.from([1, 2, 3, 4]).toString('base64'),
  })
})

test('offer image message builder returns null when the item has no thumbnail', async () => {
  const builder = createOfferImageMessageBuilder()

  const imageMessage = await builder.build({
    title: 'Notebook Gamer',
    price: 8999.9,
    currencyId: 'BRL',
    thumbnailUrl: '',
  })

  assert.equal(imageMessage, null)
})
