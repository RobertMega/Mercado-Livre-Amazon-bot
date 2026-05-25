import test from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../../src/app.js'

test('POST /api/chat/send/text forwards LinkPreview to the WhatsApp service', async () => {
  const calls = []

  const fakeWhatsapp = {
    restoreSessionsFromDB: async () => {},
    async sendTextMessage(sessionId, phone, body, linkPreview) {
      calls.push({ sessionId, phone, body, linkPreview })
      return { success: true }
    },
  }

  const fakePrisma = {
    session: {
      findUnique: async () => null,
    },
  }

  const app = await buildApp({
    prisma: fakePrisma,
    whatsappService: fakeWhatsapp,
    autoRestoreSessions: false,
    logger: false,
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/chat/send/text',
    headers: {
      token: 'teclado',
    },
    payload: {
      Phone: '120363404312563581@g.us',
      Body: 'Oferta\n\nhttps://meli.la/1GHAQVQ',
      LinkPreview: {
        title: 'Notebook Gamer',
        'canonical-url': 'https://meli.la/1GHAQVQ',
        'matched-text': 'https://meli.la/1GHAQVQ',
        description: 'Preco: R$ 8.999,90',
        jpegThumbnail: 'abcd',
      },
    },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [
    {
      sessionId: 'teclado',
      phone: '120363404312563581@g.us',
      body: 'Oferta\n\nhttps://meli.la/1GHAQVQ',
      linkPreview: {
        title: 'Notebook Gamer',
        'canonical-url': 'https://meli.la/1GHAQVQ',
        'matched-text': 'https://meli.la/1GHAQVQ',
        description: 'Preco: R$ 8.999,90',
        jpegThumbnail: 'abcd',
      },
    },
  ])

  await app.close()
})

test('POST /api/chat/send/image forwards base64 image payload to the WhatsApp service', async () => {
  const calls = []

  const fakeWhatsapp = {
    restoreSessionsFromDB: async () => {},
    async sendImageMessage(sessionId, phone, image, caption) {
      calls.push({
        sessionId,
        phone,
        image: image.toString('utf8'),
        caption,
      })
      return { success: true }
    },
  }

  const fakePrisma = {
    session: {
      findUnique: async () => null,
    },
  }

  const app = await buildApp({
    prisma: fakePrisma,
    whatsappService: fakeWhatsapp,
    autoRestoreSessions: false,
    logger: false,
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/chat/send/image',
    headers: {
      token: 'teclado',
    },
    payload: {
      Phone: '120363404312563581@g.us',
      Caption: 'Oferta: Notebook Gamer',
      Image: Buffer.from('image-binary').toString('base64'),
    },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [
    {
      sessionId: 'teclado',
      phone: '120363404312563581@g.us',
      image: 'image-binary',
      caption: 'Oferta: Notebook Gamer',
    },
  ])

  await app.close()
})
