import test from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../../src/app.js'

function createPrismaDouble({ healthy = true } = {}) {
  return {
    session: {
      findUnique: async () => null,
      findMany: async () => [],
    },
    async $queryRaw() {
      if (!healthy) {
        throw new Error('database unavailable')
      }

      return 1
    },
  }
}

function createWhatsappDouble() {
  return {
    restoreSessionsFromDB: async () => {},
    async sendTextMessage() {
      return { success: true }
    },
  }
}

test('GET /health reports degraded database state when the database probe fails', async () => {
  const app = await buildApp({
    prisma: createPrismaDouble({ healthy: false }),
    whatsappService: createWhatsappDouble(),
    autoRestoreSessions: false,
    logger: false,
    runtimeConfig: {
      apiToken: '',
      panelToken: '',
      bodyLimitBytes: 1024 * 1024,
      multipartFileSizeBytes: 1024 * 1024,
    },
  })

  const response = await app.inject({
    method: 'GET',
    url: '/health',
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.json().status, 'degraded')
  assert.equal(response.json().checks.database.status, 'down')

  await app.close()
})

test('GET /ready returns 503 when the database probe fails', async () => {
  const app = await buildApp({
    prisma: createPrismaDouble({ healthy: false }),
    whatsappService: createWhatsappDouble(),
    autoRestoreSessions: false,
    logger: false,
    runtimeConfig: {
      apiToken: '',
      panelToken: '',
      bodyLimitBytes: 1024 * 1024,
      multipartFileSizeBytes: 1024 * 1024,
    },
  })

  const response = await app.inject({
    method: 'GET',
    url: '/ready',
  })

  assert.equal(response.statusCode, 503)
  assert.equal(response.json().status, 'not_ready')

  await app.close()
})

test('POST /api/chat/send/text requires an API token when runtime auth is enabled', async () => {
  const app = await buildApp({
    prisma: createPrismaDouble(),
    whatsappService: createWhatsappDouble(),
    autoRestoreSessions: false,
    logger: false,
    runtimeConfig: {
      apiToken: 'super-secret',
      panelToken: '',
      bodyLimitBytes: 1024 * 1024,
      multipartFileSizeBytes: 1024 * 1024,
    },
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/chat/send/text',
    headers: {
      token: 'sales-session',
    },
    payload: {
      Phone: '5511999999999',
      Body: 'Oferta valida',
    },
  })

  assert.equal(response.statusCode, 401)
  assert.deepEqual(response.json(), {
    error: 'Unauthorized',
  })

  await app.close()
})

test('GET /panel requires the panel token when panel auth is enabled', async () => {
  const app = await buildApp({
    prisma: createPrismaDouble(),
    whatsappService: createWhatsappDouble(),
    autoRestoreSessions: false,
    logger: false,
    runtimeConfig: {
      apiToken: '',
      panelToken: 'panel-secret',
      bodyLimitBytes: 1024 * 1024,
      multipartFileSizeBytes: 1024 * 1024,
    },
  })

  const response = await app.inject({
    method: 'GET',
    url: '/panel',
  })

  assert.equal(response.statusCode, 401)
  assert.deepEqual(response.json(), {
    error: 'Unauthorized',
  })

  await app.close()
})

test('POST /api/chat/send/text rejects invalid recipient identifiers before reaching the WhatsApp service', async () => {
  const calls = []
  const app = await buildApp({
    prisma: createPrismaDouble(),
    whatsappService: {
      ...createWhatsappDouble(),
      async sendTextMessage(...args) {
        calls.push(args)
        return { success: true }
      },
    },
    autoRestoreSessions: false,
    logger: false,
    runtimeConfig: {
      apiToken: '',
      panelToken: '',
      bodyLimitBytes: 1024 * 1024,
      multipartFileSizeBytes: 1024 * 1024,
    },
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/chat/send/text',
    headers: {
      token: 'sales-session',
    },
    payload: {
      Phone: 'invalid-recipient',
      Body: 'Oferta valida',
    },
  })

  assert.equal(response.statusCode, 400)
  assert.deepEqual(response.json(), {
    error: 'Field "Phone" must be a WhatsApp phone number or JID',
  })
  assert.equal(calls.length, 0)

  await app.close()
})
