import test from 'node:test'
import assert from 'node:assert/strict'

import { createWhatsappService } from '../../src/services/whatsapp.service.js'

function createPrismaDouble() {
  const messages = []

  return {
    messages,
    session: {
      async upsert() {},
      async update() {},
      async findMany() {
        return []
      },
    },
    message: {
      async create({ data }) {
        messages.push(data)
        return data
      },
    },
  }
}

async function createConnectedService({
  sock,
  logger = false,
  sendDelayMs = 0,
  sleepImpl = async () => {},
  expectedUserJid,
} = {}) {
  let connectionHandler
  const prisma = createPrismaDouble()
  const service = createWhatsappService({
    prismaClient: prisma,
    makeSocket: () => ({
      ...sock,
      user: sock.user ?? { id: 'bot@s.whatsapp.net' },
      ev: {
        on(event, handler) {
          if (event === 'connection.update') {
            connectionHandler = handler
          }
        },
      },
    }),
    useAuthState: async () => ({
      state: {},
      saveCreds: async () => {},
    }),
    fetchBaileysVersionImpl: async () => ({ version: [1, 0, 0] }),
    qrcodeLib: { toDataURL: async () => 'data:image/png;base64,qr' },
    existsSyncImpl: () => true,
    mkdirSyncImpl: () => {},
    rmSyncImpl: () => {},
    sessionsDir: 'sessions',
    logger,
    sendDelayMs,
    sleepImpl,
    expectedUserJid,
  })

  await service.createSession('teclado')
  await connectionHandler({ connection: 'open' })

  return { service, prisma }
}

test('sendTextMessage serializes simultaneous sends for the same session', async () => {
  const sendCalls = []
  let releaseFirstSend

  const { service } = await createConnectedService({
    sock: {
      async sendMessage(jid, payload) {
        sendCalls.push({ jid, payload })

        if (sendCalls.length === 1) {
          await new Promise((resolve) => {
            releaseFirstSend = resolve
          })
        }

        return { key: { id: `message-${sendCalls.length}` } }
      },
    },
  })

  const firstSend = service.sendTextMessage('teclado', '120363404312563581@g.us', 'primeira')
  const secondSend = service.sendTextMessage('teclado', '120363404312563581@g.us', 'segunda')

  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(sendCalls.length, 1)
  assert.equal(sendCalls[0].payload.text, 'primeira')

  releaseFirstSend()
  await Promise.all([firstSend, secondSend])

  assert.equal(sendCalls.length, 2)
  assert.equal(sendCalls[1].payload.text, 'segunda')
})

test('sendTextMessage waits the configured delay before the next queued send', async () => {
  const events = []
  const { service } = await createConnectedService({
    sendDelayMs: 2500,
    sleepImpl: async (delayMs) => {
      events.push({ event: 'sleep', delayMs })
    },
    sock: {
      async sendMessage(jid, payload) {
        events.push({ event: 'send', text: payload.text })
        return { key: { id: payload.text } }
      },
    },
  })

  await Promise.all([
    service.sendTextMessage('teclado', '120363404312563581@g.us', 'primeira'),
    service.sendTextMessage('teclado', '120363404312563581@g.us', 'segunda'),
  ])

  assert.deepEqual(events, [
    { event: 'send', text: 'primeira' },
    { event: 'sleep', delayMs: 2500 },
    { event: 'send', text: 'segunda' },
  ])
})

test('sendTextMessage rejects unconfirmed Baileys results without a message id', async () => {
  const infoLogs = []
  const errorLogs = []
  const { service, prisma } = await createConnectedService({
    logger: {
      info(payload) {
        infoLogs.push(payload)
      },
      error(payload) {
        errorLogs.push(payload)
      },
    },
    sock: {
      async sendMessage() {
        return { key: { remoteJid: '120363404312563581@g.us', fromMe: true } }
      },
    },
  })

  await assert.rejects(
    () => service.sendTextMessage('teclado', '120363404312563581@g.us', 'sem confirmacao'),
    /did not return a message id/i,
  )

  assert.equal(infoLogs.some((payload) => payload.event === 'whatsapp_send_unconfirmed'), true)
  assert.equal(errorLogs.some((payload) => payload.event === 'whatsapp_send_failed'), true)
  assert.deepEqual(prisma.messages.map((message) => ({
    content: message.content,
    status: message.status,
  })), [
    { content: 'sem confirmacao', status: 'failed' },
  ])
})

test('sendTextMessage blocks sends when the active socket user differs from the expected user', async () => {
  const sendCalls = []
  const errorLogs = []
  const { service } = await createConnectedService({
    expectedUserJid: '5511999999999@s.whatsapp.net',
    logger: {
      error(payload) {
        errorLogs.push(payload)
      },
    },
    sock: {
      user: { id: '5511888888888:1@s.whatsapp.net', name: 'Conta errada' },
      async sendMessage(jid, payload) {
        sendCalls.push({ jid, payload })
        return { key: { id: 'should-not-send' } }
      },
    },
  })

  await assert.rejects(
    () => service.sendTextMessage('teclado', '120363404312563581@g.us', 'bloquear'),
    /active WhatsApp user .* does not match expected/i,
  )

  assert.equal(sendCalls.length, 0)
  assert.equal(errorLogs.some((payload) => payload.event === 'whatsapp_send_failed' && payload.socketUserId === '5511888888888@s.whatsapp.net'), true)
})

test('sendTextMessage preserves link, emoji and line breaks in the Baileys payload', async () => {
  const sendCalls = []
  const message = [
    'PROMOCAO 🔥',
    '',
    'Produto com desconto',
    'https://meli.la/1GHAQVQ',
  ].join('\n')

  const { service } = await createConnectedService({
    sock: {
      async sendMessage(jid, payload) {
        sendCalls.push({ jid, payload })
        return { key: { id: 'payload-ok', remoteJid: jid, fromMe: true } }
      },
    },
  })

  await service.sendTextMessage('teclado', '120363404312563581@g.us', message, {
    title: 'Produto',
    jpegThumbnail: Buffer.from('thumb').toString('base64'),
  })

  assert.equal(sendCalls.length, 1)
  assert.equal(sendCalls[0].payload.text, message)
  assert.equal(sendCalls[0].payload.linkPreview.title, 'Produto')
  assert.ok(Buffer.isBuffer(sendCalls[0].payload.linkPreview.jpegThumbnail))
})

test('sendTextMessage logs success and records failed messages when Baileys rejects', async () => {
  const infoLogs = []
  const errorLogs = []
  const { service, prisma } = await createConnectedService({
    logger: {
      info(payload) {
        infoLogs.push(payload)
      },
      error(payload) {
        errorLogs.push(payload)
      },
    },
    sock: {
      async sendMessage(jid, payload) {
        if (payload.text === 'falha') {
          throw new Error('socket stalled')
        }

        return { key: { id: 'ok' } }
      },
    },
  })

  await service.sendTextMessage('teclado', '120363404312563581@g.us', 'ok')
  await assert.rejects(
    () => service.sendTextMessage('teclado', '120363404312563581@g.us', 'falha'),
    /socket stalled/,
  )
  await service.sendTextMessage('teclado', '120363404312563581@g.us', 'depois')

  assert.equal(infoLogs.some((payload) => payload.event === 'whatsapp_send_queued'), true)
  assert.equal(infoLogs.some((payload) => payload.event === 'whatsapp_send_started'), true)
  assert.equal(infoLogs.some((payload) => payload.event === 'whatsapp_send_succeeded'), true)
  assert.equal(errorLogs.some((payload) => payload.event === 'whatsapp_send_failed' && payload.errorMessage === 'socket stalled'), true)
  assert.deepEqual(prisma.messages.map((message) => ({
    content: message.content,
    status: message.status,
  })), [
    { content: 'ok', status: 'sent' },
    { content: 'falha', status: 'failed' },
    { content: 'depois', status: 'sent' },
  ])
})
