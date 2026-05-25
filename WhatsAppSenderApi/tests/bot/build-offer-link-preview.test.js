import test from 'node:test'
import assert from 'node:assert/strict'

import { createOfferLinkPreviewBuilder } from '../../src/bot/build-offer-link-preview.js'

test('offer link preview builder creates WhatsApp preview payload from item metadata and thumbnail', async () => {
  const requestedUrls = []

  const builder = createOfferLinkPreviewBuilder({
    fetchImpl: async (url) => {
      requestedUrls.push(url)

      return {
        ok: true,
        async arrayBuffer() {
          return Uint8Array.from([1, 2, 3, 4]).buffer
        },
      }
    },
    sharpFactory: () => ({
      resize() {
        return this
      },
      jpeg() {
        return this
      },
      async toBuffer() {
        return Buffer.from('jpeg-thumbnail')
      },
    }),
  })

  const preview = await builder.build(
    {
      title: 'Notebook Gamer',
      price: 8999.9,
      currencyId: 'BRL',
      thumbnailUrl: 'https://http2.mlstatic.com/product.webp',
    },
    'https://meli.la/1GHAQVQ',
  )

  assert.deepEqual(requestedUrls, ['https://http2.mlstatic.com/product.webp'])
  assert.deepEqual(preview, {
    'canonical-url': 'https://meli.la/1GHAQVQ',
    'matched-text': 'https://meli.la/1GHAQVQ',
    title: 'Notebook Gamer',
    description: 'Preco: R$ 8.999,90',
    jpegThumbnail: Buffer.from('jpeg-thumbnail').toString('base64'),
  })
})

test('offer link preview builder returns null when the item has no thumbnail', async () => {
  const builder = createOfferLinkPreviewBuilder()

  const preview = await builder.build(
    {
      title: 'Notebook Gamer',
      price: 8999.9,
      currencyId: 'BRL',
      thumbnailUrl: '',
    },
    'https://meli.la/1GHAQVQ',
  )

  assert.equal(preview, null)
})
