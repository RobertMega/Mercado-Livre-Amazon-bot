import test from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../../src/app.js'

test('GET /api/sessions preserves needs_reauth from persistence when runtime has no active socket', async () => {
  const fakePrisma = {
    session: {
      findMany: async () => ([
        {
          id: 'teclado',
          name: 'teclado',
          status: 'needs_reauth',
          createdAt: new Date('2026-04-14T12:00:00.000Z'),
        },
      ]),
    },
  }

  const fakeWhatsapp = {
    getSessionStatus: () => 'disconnected',
    getSessionQR: () => null,
  }

  const app = await buildApp({
    prisma: fakePrisma,
    whatsappService: fakeWhatsapp,
    autoRestoreSessions: false,
    logger: false,
  })

  const response = await app.inject({
    method: 'GET',
    url: '/api/sessions',
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.json()[0].status, 'needs_reauth')

  await app.close()
})

test('POST /api/sessions allows recreating a session marked as needs_reauth', async () => {
  const createdSessions = []
  const fakePrisma = {
    session: {
      findUnique: async () => ({
        id: 'teclado',
        name: 'teclado',
        status: 'needs_reauth',
      }),
    },
  }

  const fakeWhatsapp = {
    getSessionStatus: () => 'needs_reauth',
    createSession: async (sessionId) => {
      createdSessions.push(sessionId)
      return { message: 'Session initialization started', sessionId }
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
    url: '/api/sessions',
    payload: { name: 'Teclado' },
  })

  assert.equal(response.statusCode, 201)
  assert.deepEqual(createdSessions, ['teclado'])

  await app.close()
})
