import test from 'node:test'
import assert from 'node:assert/strict'

import { createWhatsappService } from '../../src/services/whatsapp.service.js'

test('whatsapp service resets a session to needs_reauth after repeated Bad MAC errors', async () => {
  const removedDirs = []
  const prismaUpdates = []
  let logoutCalls = 0
  let connectionHandler

  const sock = {
    ev: {
      on(event, handler) {
        if (event === 'connection.update') {
          connectionHandler = handler
        }
      },
    },
    async logout() {
      logoutCalls += 1
    },
  }

  const service = createWhatsappService({
    prismaClient: {
      session: {
        async upsert() {},
        async update(args) {
          prismaUpdates.push(args)
        },
        async findMany() {
          return []
        },
      },
      message: {
        async create() {},
      },
    },
    makeSocket: () => sock,
    useAuthState: async () => ({
      state: {},
      saveCreds: async () => {},
    }),
    fetchBaileysVersionImpl: async () => ({ version: [1, 0, 0] }),
    qrcodeLib: { toDataURL: async () => 'data:image/png;base64,qr' },
    existsSyncImpl: () => true,
    mkdirSyncImpl: () => {},
    rmSyncImpl: (target) => {
      removedDirs.push(target)
    },
    sessionsDir: 'sessions',
  })

  await service.createSession('teclado')
  await connectionHandler?.({ connection: 'open' })

  service.reportSessionCryptoError('teclado', 'Bad MAC Error: Bad MAC')
  service.reportSessionCryptoError('teclado', 'Failed to decrypt message with any known session...')
  service.reportSessionCryptoError('teclado', 'Session error: Error: Bad MAC Error: Bad MAC')

  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(service.getSessionStatus('teclado'), 'needs_reauth')
  assert.equal(logoutCalls, 1)
  assert.equal(removedDirs.length, 1)
  assert.match(removedDirs[0], /sessions[\\/]teclado$/)
  assert.equal(prismaUpdates.at(-1).data.status, 'needs_reauth')
})

test('restoreSessionsFromDB skips persisted needs_reauth sessions', async () => {
  const createdSessions = []

  const service = createWhatsappService({
    prismaClient: {
      session: {
        async findMany() {
          return [
            { id: 'needs-qr', status: 'needs_reauth' },
            { id: 'ready', status: 'connected' },
          ]
        },
        async upsert({ where }) {
          createdSessions.push(where.id)
        },
        async update() {},
      },
      message: {
        async create() {},
      },
    },
    makeSocket: () => ({
      ev: { on() {} },
    }),
    useAuthState: async () => ({
      state: {},
      saveCreds: async () => {},
    }),
    fetchBaileysVersionImpl: async () => ({ version: [1, 0, 0] }),
    qrcodeLib: { toDataURL: async () => 'data:image/png;base64,qr' },
    existsSyncImpl: (target) => /ready$/.test(target),
    mkdirSyncImpl: () => {},
    rmSyncImpl: () => {},
    sessionsDir: 'sessions',
  })

  await service.restoreSessionsFromDB()

  assert.deepEqual(createdSessions, ['ready'])
})
