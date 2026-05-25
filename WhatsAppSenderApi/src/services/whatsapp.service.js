import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import qrcode from 'qrcode'

import prisma from '../lib/prisma.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DEFAULT_SESSIONS_DIR = join(__dirname, '../../sessions')
const BAD_MAC_THRESHOLD = 3
const DEFAULT_SEND_DELAY_MS = 3000
const MIN_SEND_DELAY_MS = 2000
const MAX_SEND_DELAY_MS = 5000

function isSessionCryptoErrorMessage(message) {
  return /bad mac|failed to decrypt message with any known session/i.test(message || '')
}

function extractLogMessage(args) {
  return args
    .flatMap((value) => {
      if (typeof value === 'string') {
        return [value]
      }

      if (value instanceof Error) {
        return [value.stack || value.message]
      }

      if (value && typeof value === 'object') {
        return [value.msg, value.message, value.err?.message, value.err?.stack].filter(Boolean)
      }

      return []
    })
    .join(' ')
}

function createBaileysLogger({ sessionId, onCryptoError }) {
  const baseLogger = pino({ level: 'silent' })

  function forward(level, args) {
    const message = extractLogMessage(args)

    if (isSessionCryptoErrorMessage(message)) {
      onCryptoError(sessionId, message)
    }

    const writer = baseLogger[level]
    if (typeof writer === 'function') {
      writer.apply(baseLogger, args)
    }
  }

  return {
    level: 'silent',
    child() {
      return createBaileysLogger({ sessionId, onCryptoError })
    },
    trace(...args) {
      forward('trace', args)
    },
    debug(...args) {
      forward('debug', args)
    },
    info(...args) {
      forward('info', args)
    },
    warn(...args) {
      forward('warn', args)
    },
    error(...args) {
      forward('error', args)
    },
    fatal(...args) {
      forward('fatal', args)
    },
  }
}

function resolveSendDelayMs(value = process.env.WHATSAPP_SEND_DELAY_MS) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value)
  }

  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    return DEFAULT_SEND_DELAY_MS
  }

  return Math.min(MAX_SEND_DELAY_MS, Math.max(MIN_SEND_DELAY_MS, parsed))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeUserJid(jid) {
  if (!jid || typeof jid !== 'string') {
    return null
  }

  const [user, server] = jid.split('@')
  if (!user || !server) {
    return jid
  }

  return `${user.replace(/:\d+$/, '')}@${server}`
}

function getSocketUser(sock) {
  const rawId = sock?.user?.id || null

  return {
    socketUserId: normalizeUserJid(rawId),
    socketUserRawId: rawId,
    socketUserName: sock?.user?.name || sock?.user?.verifiedName || null,
  }
}

function buildSendResultSummary(result) {
  return {
    messageId: result?.key?.id,
    remoteJid: result?.key?.remoteJid,
    fromMe: result?.key?.fromMe,
    participant: result?.key?.participant,
    status: result?.status,
  }
}

function buildErrorSummary(error) {
  return {
    errorName: error?.name,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorStack: error?.stack,
    errorCause: error?.cause instanceof Error
      ? error.cause.message
      : error?.cause,
  }
}

export function createWhatsappService({
  prismaClient = prisma,
  makeSocket = makeWASocket,
  useAuthState = useMultiFileAuthState,
  fetchBaileysVersionImpl = fetchLatestBaileysVersion,
  qrcodeLib = qrcode,
  existsSyncImpl = existsSync,
  mkdirSyncImpl = mkdirSync,
  rmSyncImpl = rmSync,
  sessionsDir = DEFAULT_SESSIONS_DIR,
  logger = console,
  sendDelayMs = resolveSendDelayMs(),
  sleepImpl = sleep,
  nowImpl = Date.now,
  expectedUserJid = process.env.WHATSAPP_EXPECTED_USER_JID || '',
} = {}) {
  if (!existsSyncImpl(sessionsDir)) {
    mkdirSyncImpl(sessionsDir, { recursive: true })
  }

  const activeSockets = new Map()
  const sessionQRCodes = new Map()
  const sessionStatus = new Map()
  const sessionContacts = new Map()
  const sessionGroups = new Map()
  const sessionCryptoErrorCounts = new Map()
  const sessionRecoveryLocks = new Set()
  const sessionSendQueues = new Map()
  const sessionLastSendFinishedAt = new Map()

  function ensureSessionCaches(sessionId) {
    if (!sessionContacts.has(sessionId)) {
      sessionContacts.set(sessionId, new Map())
    }

    if (!sessionGroups.has(sessionId)) {
      sessionGroups.set(sessionId, new Map())
    }
  }

  function clearSessionCaches(sessionId) {
    sessionQRCodes.delete(sessionId)
    sessionContacts.delete(sessionId)
    sessionGroups.delete(sessionId)
    sessionCryptoErrorCounts.delete(sessionId)
  }

  function getSessionStatus(sessionId) {
    return sessionStatus.get(sessionId) ?? 'disconnected'
  }

  function getSessionQR(sessionId) {
    return sessionQRCodes.get(sessionId) ?? null
  }

  function getAllActiveSessions() {
    return [...activeSockets.keys()]
  }

  async function invalidateSessionForReauth(sessionId, reason = '') {
    if (sessionRecoveryLocks.has(sessionId)) {
      return
    }

    sessionRecoveryLocks.add(sessionId)
    const sock = activeSockets.get(sessionId)
    activeSockets.delete(sessionId)
    clearSessionCaches(sessionId)
    sessionStatus.set(sessionId, 'needs_reauth')

    try {
      if (sock?.logout) {
        await sock.logout().catch(() => {})
      }

      const authDir = join(sessionsDir, sessionId)
      if (existsSyncImpl(authDir)) {
        rmSyncImpl(authDir, { recursive: true, force: true })
      }

      await prismaClient.session.update({
        where: { id: sessionId },
        data: {
          status: 'needs_reauth',
        },
      }).catch(() => {})

      if (reason) {
        logger.error?.(`[Session ${sessionId}] Reauthentication required: ${reason}`)
      }
    } finally {
      sessionRecoveryLocks.delete(sessionId)
    }
  }

  function reportSessionCryptoError(sessionId, message = '') {
    if (!isSessionCryptoErrorMessage(message)) {
      return
    }

    const count = (sessionCryptoErrorCounts.get(sessionId) ?? 0) + 1
    sessionCryptoErrorCounts.set(sessionId, count)

    if (count >= BAD_MAC_THRESHOLD) {
      sessionCryptoErrorCounts.set(sessionId, 0)
      queueMicrotask(() => {
        invalidateSessionForReauth(sessionId, message).catch(() => {})
      })
    }
  }

  function normalizeContact(contact) {
    const jid = contact.id || contact.jid
    if (!jid || !jid.endsWith('@s.whatsapp.net')) {
      return null
    }

    return {
      jid,
      name: contact.name || contact.notify || contact.verifiedName || jid.split('@')[0],
      isGroup: false,
    }
  }

  function normalizeGroup(group) {
    const jid = group.id
    if (!jid || !jid.endsWith('@g.us')) {
      return null
    }

    return {
      jid,
      name: group.subject || jid,
      isGroup: true,
    }
  }

  function upsertContacts(sessionId, contacts = []) {
    ensureSessionCaches(sessionId)
    const cache = sessionContacts.get(sessionId)

    for (const contact of contacts) {
      const normalized = normalizeContact(contact)
      if (normalized) {
        cache.set(normalized.jid, normalized)
      }
    }
  }

  function upsertChats(sessionId, chats = []) {
    ensureSessionCaches(sessionId)
    const cache = sessionContacts.get(sessionId)

    for (const chat of chats) {
      if (!chat.id || !chat.id.endsWith('@s.whatsapp.net')) {
        continue
      }

      cache.set(chat.id, {
        jid: chat.id,
        name: chat.name || chat.conversationTimestamp?.toString() || chat.id.split('@')[0],
        isGroup: false,
      })
    }
  }

  function upsertGroups(sessionId, groups = []) {
    ensureSessionCaches(sessionId)
    const cache = sessionGroups.get(sessionId)

    for (const group of groups) {
      const normalized = normalizeGroup(group)
      if (normalized) {
        cache.set(normalized.jid, normalized)
      }
    }
  }

  async function refreshSessionGroups(sessionId, sock) {
    const groups = await sock.groupFetchAllParticipating()
    upsertGroups(sessionId, Object.values(groups))
  }

  function getActiveSocket(sessionId) {
    const status = getSessionStatus(sessionId)
    const sock = activeSockets.get(sessionId)

    if (!sock) {
      if (status === 'needs_reauth') {
        throw new Error(`Session "${sessionId}" requires re-authentication via QR code`)
      }

      throw new Error(`Session "${sessionId}" not found or not connected`)
    }

    if (status === 'needs_reauth') {
      throw new Error(`Session "${sessionId}" requires re-authentication via QR code`)
    }

    if (status !== 'connected') {
      throw new Error(`Session "${sessionId}" is not connected yet`)
    }

    if ('user' in sock && !sock.user) {
      throw new Error(`Session "${sessionId}" socket is not ready for sending`)
    }

    return sock
  }

  function formatJid(to) {
    if (to.includes('@')) return to

    const digits = to.replace(/\D/g, '')
    if (digits.length > 15) return `${digits}@g.us`

    return `${digits}@s.whatsapp.net`
  }

  async function listSessionChats(sessionId) {
    const sock = getActiveSocket(sessionId)
    await refreshSessionGroups(sessionId, sock)

    const groups = [...(sessionGroups.get(sessionId)?.values() ?? [])]
    const contacts = [...(sessionContacts.get(sessionId)?.values() ?? [])]

    return [...groups, ...contacts].sort((left, right) => {
      if (left.isGroup !== right.isGroup) {
        return left.isGroup ? -1 : 1
      }

      return left.name.localeCompare(right.name, 'pt-BR')
    })
  }

  async function createSession(sessionId) {
    if (activeSockets.has(sessionId)) {
      return { message: 'Session already active' }
    }

    sessionStatus.set(sessionId, 'connecting')
    sessionCryptoErrorCounts.set(sessionId, 0)

    await prismaClient.session.upsert({
      where: { id: sessionId },
      update: { status: 'connecting' },
      create: { id: sessionId, name: sessionId, status: 'connecting' },
    })

    const authDir = join(sessionsDir, sessionId)
    mkdirSyncImpl(authDir, { recursive: true })

    const { state, saveCreds } = await useAuthState(authDir)
    const { version } = await fetchBaileysVersionImpl()

    const sock = makeSocket({
      version,
      logger: createBaileysLogger({
        sessionId,
        onCryptoError: reportSessionCryptoError,
      }),
      auth: state,
      printQRInTerminal: false,
      browser: ['WhatsApp API', 'Chrome', '1.0.0'],
      generateHighQualityLinkPreview: true,
    })

    activeSockets.set(sessionId, sock)
    ensureSessionCaches(sessionId)

    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('messaging-history.set', ({ contacts = [], chats = [] }) => {
      upsertContacts(sessionId, contacts)
      upsertChats(sessionId, chats)
    })
    sock.ev.on('contacts.upsert', (contacts) => upsertContacts(sessionId, contacts))
    sock.ev.on('contacts.update', (contacts) => upsertContacts(sessionId, contacts))
    sock.ev.on('groups.upsert', (groups) => upsertGroups(sessionId, groups))
    sock.ev.on('groups.update', (groups) => upsertGroups(sessionId, groups))

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        const qrBase64 = await qrcodeLib.toDataURL(qr)
        sessionQRCodes.set(sessionId, qrBase64)
        sessionStatus.set(sessionId, 'qr_pending')
        await prismaClient.session.update({
          where: { id: sessionId },
          data: { status: 'qr_pending' },
        }).catch(() => {})
      }

      if (connection === 'open') {
        sessionQRCodes.delete(sessionId)
        sessionStatus.set(sessionId, 'connected')
        sessionCryptoErrorCounts.set(sessionId, 0)
        await refreshSessionGroups(sessionId, sock).catch(() => {})
        await prismaClient.session.update({
          where: { id: sessionId },
          data: { status: 'connected' },
        }).catch(() => {})
        logger.info?.(`[Session ${sessionId}] Connected`)
      }

      if (connection === 'close') {
        if (getSessionStatus(sessionId) === 'needs_reauth') {
          activeSockets.delete(sessionId)
          return
        }

        const code = new Boom(lastDisconnect?.error)?.output?.statusCode
        const shouldReconnect = code !== DisconnectReason.loggedOut

        logger.info?.(`[Session ${sessionId}] Disconnected. Code: ${code}. Reconnect: ${shouldReconnect}`)

        activeSockets.delete(sessionId)
        sessionQRCodes.delete(sessionId)
        sessionStatus.set(sessionId, 'disconnected')

        await prismaClient.session.update({
          where: { id: sessionId },
          data: { status: shouldReconnect ? 'reconnecting' : 'disconnected' },
        }).catch(() => {})

        if (shouldReconnect) {
          setTimeout(() => createSession(sessionId), 5000)
        }
      }
    })

    return { message: 'Session initialization started', sessionId }
  }

  async function removeSession(sessionId) {
    const sock = activeSockets.get(sessionId)

    if (sock) {
      try {
        await sock.logout()
      } catch {}
      activeSockets.delete(sessionId)
    }

    clearSessionCaches(sessionId)
    sessionStatus.delete(sessionId)
    sessionSendQueues.delete(sessionId)
    sessionLastSendFinishedAt.delete(sessionId)

    const authDir = join(sessionsDir, sessionId)
    if (existsSyncImpl(authDir)) {
      rmSyncImpl(authDir, { recursive: true, force: true })
    }

    await prismaClient.session.update({
      where: { id: sessionId },
      data: { status: 'disconnected' },
    }).catch(() => {})

    return { message: 'Session removed', sessionId }
  }

  function logSendInfo(payload) {
    logger.info?.(payload)
  }

  function logSendError(payload) {
    logger.error?.(payload)
  }

  async function waitForSendDelay(sessionId) {
    if (!(sendDelayMs > 0)) {
      return
    }

    const lastFinishedAt = sessionLastSendFinishedAt.get(sessionId)
    if (!lastFinishedAt) {
      return
    }

    const elapsedMs = nowImpl() - lastFinishedAt
    const remainingMs = sendDelayMs - elapsedMs
    if (remainingMs > 0) {
      await sleepImpl(remainingMs)
    }
  }

  function enqueueSessionSend(sessionId, task) {
    const previous = sessionSendQueues.get(sessionId) ?? Promise.resolve()
    const queuedTask = previous.catch(() => {}).then(task)

    sessionSendQueues.set(sessionId, queuedTask)
    queuedTask.finally(() => {
      if (sessionSendQueues.get(sessionId) === queuedTask) {
        sessionSendQueues.delete(sessionId)
      }
    }).catch(() => {})

    return queuedTask
  }

  async function sendQueuedMessage({
    sessionId,
    to,
    type,
    content,
    operation,
    payloadMetadata = {},
  }) {
    const queuedAt = nowImpl()
    const normalizedExpectedUserJid = normalizeUserJid(expectedUserJid)

    logSendInfo({
      event: 'whatsapp_send_queued',
      sessionId,
      to,
      type,
      ...payloadMetadata,
      queuedAt: new Date(queuedAt).toISOString(),
    })

    return enqueueSessionSend(sessionId, async () => {
      await waitForSendDelay(sessionId)

      const startedAt = nowImpl()
      let jid = null
      let socketUser = {}

      try {
        const sock = getActiveSocket(sessionId)
        jid = formatJid(to)
        socketUser = getSocketUser(sock)

        if (
          normalizedExpectedUserJid &&
          socketUser.socketUserId &&
          socketUser.socketUserId !== normalizedExpectedUserJid
        ) {
          throw new Error(
            `Active WhatsApp user "${socketUser.socketUserId}" does not match expected "${normalizedExpectedUserJid}"`,
          )
        }

        logSendInfo({
          event: 'whatsapp_send_started',
          sessionId,
          to,
          jid,
          type,
          expectedUserJid: normalizedExpectedUserJid || null,
          ...socketUser,
          ...payloadMetadata,
          queuedAt: new Date(queuedAt).toISOString(),
          startedAt: new Date(startedAt).toISOString(),
          queueWaitMs: startedAt - queuedAt,
        })

        const result = await operation(sock, jid)
        const finishedAt = nowImpl()
        const resultSummary = buildSendResultSummary(result)

        if (!resultSummary.messageId) {
          logSendInfo({
            event: 'whatsapp_send_unconfirmed',
            sessionId,
            to,
            jid,
            type,
            expectedUserJid: normalizedExpectedUserJid || null,
            ...socketUser,
            ...payloadMetadata,
            ...resultSummary,
            queuedAt: new Date(queuedAt).toISOString(),
            startedAt: new Date(startedAt).toISOString(),
            finishedAt: new Date(finishedAt).toISOString(),
            queueWaitMs: startedAt - queuedAt,
            durationMs: finishedAt - startedAt,
          })

          throw new Error(`WhatsApp send for session "${sessionId}" did not return a message id`)
        }

        sessionLastSendFinishedAt.set(sessionId, finishedAt)

        await prismaClient.message.create({
          data: { sessionId, to, type, content, status: 'sent' },
        })

        logSendInfo({
          event: 'whatsapp_send_succeeded',
          sessionId,
          to,
          jid,
          type,
          expectedUserJid: normalizedExpectedUserJid || null,
          ...socketUser,
          ...payloadMetadata,
          ...resultSummary,
          queuedAt: new Date(queuedAt).toISOString(),
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date(finishedAt).toISOString(),
          queueWaitMs: startedAt - queuedAt,
          durationMs: finishedAt - startedAt,
        })

        return result
      } catch (error) {
        const finishedAt = nowImpl()
        sessionLastSendFinishedAt.set(sessionId, finishedAt)

        await prismaClient.message.create({
          data: { sessionId, to, type, content, status: 'failed' },
        }).catch(() => {})

        logSendError({
          event: 'whatsapp_send_failed',
          sessionId,
          to,
          jid,
          type,
          expectedUserJid: normalizedExpectedUserJid || null,
          ...socketUser,
          ...payloadMetadata,
          queuedAt: new Date(queuedAt).toISOString(),
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date(finishedAt).toISOString(),
          queueWaitMs: startedAt - queuedAt,
          durationMs: finishedAt - startedAt,
          ...buildErrorSummary(error),
        })

        throw error
      }
    })
  }

  async function sendTextMessage(sessionId, to, text, linkPreview) {
    const normalizedLinkPreview = linkPreview
      ? {
          ...linkPreview,
          jpegThumbnail: linkPreview.jpegThumbnail
            ? Buffer.from(linkPreview.jpegThumbnail, 'base64')
            : undefined,
        }
      : undefined

    const result = await sendQueuedMessage({
      sessionId,
      to,
      type: 'text',
      content: text,
      payloadMetadata: {
        bodyLength: text.length,
        hasLinkPreview: Boolean(normalizedLinkPreview),
        payloadKeys: normalizedLinkPreview ? ['text', 'linkPreview'] : ['text'],
      },
      operation: (sock, jid) => sock.sendMessage(jid, {
        text,
        linkPreview: normalizedLinkPreview,
      }),
    })

    return { success: true, to: formatJid(to), type: 'text', messageId: result?.key?.id }
  }

  async function sendImageMessage(sessionId, to, imageBuffer, caption = '') {
    const result = await sendQueuedMessage({
      sessionId,
      to,
      type: 'image',
      content: caption || '[image]',
      payloadMetadata: {
        captionLength: caption.length,
        imageBytes: imageBuffer.length,
        payloadKeys: caption ? ['image', 'caption'] : ['image'],
      },
      operation: (sock, jid) => sock.sendMessage(jid, {
        image: imageBuffer,
        caption,
      }),
    })

    return { success: true, to: formatJid(to), type: 'image', messageId: result?.key?.id }
  }

  async function sendFileMessage(sessionId, to, fileBuffer, filename, mimetype) {
    const result = await sendQueuedMessage({
      sessionId,
      to,
      type: 'file',
      content: filename,
      payloadMetadata: {
        filename,
        mimetype,
        fileBytes: fileBuffer.length,
        payloadKeys: ['document', 'fileName', 'mimetype'],
      },
      operation: (sock, jid) => sock.sendMessage(jid, {
        document: fileBuffer,
        fileName: filename,
        mimetype,
      }),
    })

    return { success: true, to: formatJid(to), type: 'file', filename, messageId: result?.key?.id }
  }

  async function restoreSessionsFromDB() {
    const sessions = await prismaClient.session.findMany({
      where: { status: { not: 'disconnected' } },
    })

    const restorableSessions = sessions.filter((session) => session.status !== 'needs_reauth')

    logger.info?.(`[Startup] Restoring ${restorableSessions.length} session(s) from DB...`)

    for (const session of restorableSessions) {
      const authDir = join(sessionsDir, session.id)
      if (existsSyncImpl(authDir)) {
        await createSession(session.id)
      } else {
        await prismaClient.session.update({
          where: { id: session.id },
          data: { status: 'disconnected' },
        }).catch(() => {})
      }
    }
  }

  return {
    getSessionStatus,
    getSessionQR,
    getAllActiveSessions,
    listSessionChats,
    createSession,
    removeSession,
    sendTextMessage,
    sendImageMessage,
    sendFileMessage,
    restoreSessionsFromDB,
    reportSessionCryptoError,
  }
}

const defaultService = createWhatsappService()

export const getSessionStatus = (...args) => defaultService.getSessionStatus(...args)
export const getSessionQR = (...args) => defaultService.getSessionQR(...args)
export const getAllActiveSessions = (...args) => defaultService.getAllActiveSessions(...args)
export const listSessionChats = (...args) => defaultService.listSessionChats(...args)
export const createSession = (...args) => defaultService.createSession(...args)
export const removeSession = (...args) => defaultService.removeSession(...args)
export const sendTextMessage = (...args) => defaultService.sendTextMessage(...args)
export const sendImageMessage = (...args) => defaultService.sendImageMessage(...args)
export const sendFileMessage = (...args) => defaultService.sendFileMessage(...args)
export const restoreSessionsFromDB = (...args) => defaultService.restoreSessionsFromDB(...args)
