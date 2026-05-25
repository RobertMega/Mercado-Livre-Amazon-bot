import test from 'node:test'
import assert from 'node:assert/strict'

import { createWhatsappApiClient } from '../../src/bot/clients/whatsapp-api-client.js'

test('whatsapp api client forwards link preview payload when sending text', async () => {
  const requests = []

  const client = createWhatsappApiClient({
    baseUrl: 'http://localhost:3000',
    fetchImpl: async (url, init) => {
      requests.push({
        url: url.toString(),
        init: {
          ...init,
          body: JSON.parse(init.body),
        },
      })

      return {
        ok: true,
        async json() {
          return { success: true }
        },
      }
    },
  })

  await client.sendTextMessage({
    sessionId: 'teclado',
    to: '120363404312563581@g.us',
    body: 'Oferta\n\nhttps://meli.la/1GHAQVQ',
    linkPreview: {
      title: 'Notebook Gamer',
      'canonical-url': 'https://meli.la/1GHAQVQ',
      'matched-text': 'https://meli.la/1GHAQVQ',
      description: 'Preco: R$ 8.999,90',
      jpegThumbnail: 'abcd',
    },
  })

  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0].init.body, {
    Phone: '120363404312563581@g.us',
    Body: 'Oferta\n\nhttps://meli.la/1GHAQVQ',
    LinkPreview: {
      title: 'Notebook Gamer',
      'canonical-url': 'https://meli.la/1GHAQVQ',
      'matched-text': 'https://meli.la/1GHAQVQ',
      description: 'Preco: R$ 8.999,90',
      jpegThumbnail: 'abcd',
    },
  })
})

test('whatsapp api client sends image payload as base64 with caption', async () => {
  const requests = []

  const client = createWhatsappApiClient({
    baseUrl: 'http://localhost:3000',
    fetchImpl: async (url, init) => {
      requests.push({
        url: url.toString(),
        init: {
          ...init,
          body: JSON.parse(init.body),
        },
      })

      return {
        ok: true,
        async json() {
          return { success: true }
        },
      }
    },
  })

  await client.sendImageMessage({
    sessionId: 'teclado',
    to: '120363404312563581@g.us',
    caption: 'Oferta: Notebook Gamer',
    imageBase64: 'abcd',
  })

  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, 'http://localhost:3000/api/chat/send/image')
  assert.deepEqual(requests[0].init.body, {
    Phone: '120363404312563581@g.us',
    Caption: 'Oferta: Notebook Gamer',
    Image: 'abcd',
  })
})
