import test from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../../src/app.js'

test('GET /api/sessions/:id/chats returns groups and contacts for a connected session', async () => {
  const fakePrisma = {
    session: {
      findUnique: async ({ where }) => where.id === 'sales-session'
        ? { id: 'sales-session', name: 'sales-session', status: 'connected' }
        : null,
    },
  }

  const fakeWhatsapp = {
    getSessionStatus: () => 'connected',
    listSessionChats: async () => ([
      { jid: '120363400000000000@g.us', name: 'Ofertas', isGroup: true },
      { jid: '5511999999999@s.whatsapp.net', name: 'Maria', isGroup: false },
    ]),
  }

  const app = await buildApp({
    prisma: fakePrisma,
    whatsappService: fakeWhatsapp,
    autoRestoreSessions: false,
    logger: false,
  })

  const response = await app.inject({
    method: 'GET',
    url: '/api/sessions/sales-session/chats',
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    sessionId: 'sales-session',
    chats: [
      { jid: '120363400000000000@g.us', name: 'Ofertas', isGroup: true },
      { jid: '5511999999999@s.whatsapp.net', name: 'Maria', isGroup: false },
    ],
  })

  await app.close()
})

test('GET /api/sessions/:id/chats returns 404 when session does not exist', async () => {
  const fakePrisma = {
    session: {
      findUnique: async () => null,
    },
  }

  const fakeWhatsapp = {
    getSessionStatus: () => 'disconnected',
    listSessionChats: async () => [],
  }

  const app = await buildApp({
    prisma: fakePrisma,
    whatsappService: fakeWhatsapp,
    autoRestoreSessions: false,
    logger: false,
  })

  const response = await app.inject({
    method: 'GET',
    url: '/api/sessions/missing/chats',
  })

  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.json(), { error: 'Session not found' })

  await app.close()
})

test('GET /api/sessions/:id/chats returns 409 when session is not connected', async () => {
  const fakePrisma = {
    session: {
      findUnique: async () => ({ id: 'sales-session', name: 'sales-session', status: 'qr_pending' }),
    },
  }

  const fakeWhatsapp = {
    getSessionStatus: () => 'qr_pending',
    listSessionChats: async () => {
      throw new Error('Session "sales-session" is not connected yet')
    },
  }

  const app = await buildApp({
    prisma: fakePrisma,
    whatsappService: fakeWhatsapp,
    autoRestoreSessions: false,
    logger: false,
  })

  const response = await app.inject({
    method: 'GET',
    url: '/api/sessions/sales-session/chats',
  })

  assert.equal(response.statusCode, 409)
  assert.deepEqual(response.json(), {
    error: 'Session "sales-session" is not connected yet',
  })

  await app.close()
})
