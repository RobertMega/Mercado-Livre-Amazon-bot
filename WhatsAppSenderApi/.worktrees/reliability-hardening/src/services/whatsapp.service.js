// src/services/whatsapp.service.js
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import qrcode from 'qrcode'
import prisma from '../lib/prisma.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SESSIONS_DIR = join(__dirname, '../../sessions')
const logger = pino({ level: 'silent' })

if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true })

// In-memory state for active sockets
const activeSockets = new Map()     // sessionId -> socket
const sessionQRCodes = new Map()    // sessionId -> qrBase64
const sessionStatus = new Map()     // sessionId -> status string
const sessionContacts = new Map()   // sessionId -> Map<jid, normalized chat>
const sessionGroups = new Map()     // sessionId -> Map<jid, normalized chat>

export function getSessionStatus(sessionId) {
  return sessionStatus.get(sessionId) ?? 'disconnected'
}

export function getSessionQR(sessionId) {
  return sessionQRCodes.get(sessionId) ?? null
}

export function getAllActiveSessions() {
  return [...activeSockets.keys()]
}

export async function listSessionChats(sessionId) {
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

export async function createSession(sessionId) {
  if (activeSockets.has(sessionId)) {
    return { message: 'Session already active' }
  }

  sessionStatus.set(sessionId, 'connecting')
  await prisma.session.upsert({
    where: { id: sessionId },
    update: { status: 'connecting' },
    create: { id: sessionId, name: sessionId, status: 'connecting' },
  })

  const authDir = join(SESSIONS_DIR, sessionId)
  mkdirSync(authDir, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger,
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
      const qrBase64 = await qrcode.toDataURL(qr)
      sessionQRCodes.set(sessionId, qrBase64)
      sessionStatus.set(sessionId, 'qr_pending')
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'qr_pending' },
      })
    }

    if (connection === 'open') {
      sessionQRCodes.delete(sessionId)
      sessionStatus.set(sessionId, 'connected')
      await refreshSessionGroups(sessionId, sock).catch(() => {})
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: 'connected' },
      })
      console.log(`[Session ${sessionId}] Connected ✓`)
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut

      console.log(`[Session ${sessionId}] Disconnected. Code: ${code}. Reconnect: ${shouldReconnect}`)

      activeSockets.delete(sessionId)
      sessionQRCodes.delete(sessionId)
      sessionStatus.set(sessionId, 'disconnected')

      await prisma.session.update({
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

export async function removeSession(sessionId) {
  const sock = activeSockets.get(sessionId)

  if (sock) {
    try {
      await sock.logout()
    } catch (_) {}
    activeSockets.delete(sessionId)
  }

  sessionQRCodes.delete(sessionId)
  sessionStatus.delete(sessionId)
  sessionContacts.delete(sessionId)
  sessionGroups.delete(sessionId)

  const authDir = join(SESSIONS_DIR, sessionId)
  if (existsSync(authDir)) {
    rmSync(authDir, { recursive: true, force: true })
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'disconnected' },
  }).catch(() => {})

  return { message: 'Session removed', sessionId }
}

export async function sendTextMessage(sessionId, to, text, linkPreview) {
  const sock = getActiveSocket(sessionId)
  const jid = formatJid(to)

  const normalizedLinkPreview = linkPreview
    ? {
        ...linkPreview,
        jpegThumbnail: linkPreview.jpegThumbnail
          ? Buffer.from(linkPreview.jpegThumbnail, 'base64')
          : undefined,
      }
    : undefined

  await sock.sendMessage(jid, {
    text,
    linkPreview: normalizedLinkPreview,
  })

  await prisma.message.create({
    data: { sessionId, to, type: 'text', content: text, status: 'sent' },
  })

  return { success: true, to: jid, type: 'text' }
}

export async function sendImageMessage(sessionId, to, imageBuffer, caption = '') {
  const sock = getActiveSocket(sessionId)
  const jid = formatJid(to)

  await sock.sendMessage(jid, {
    image: imageBuffer,
    caption,
  })

  await prisma.message.create({
    data: { sessionId, to, type: 'image', content: caption || '[image]', status: 'sent' },
  })

  return { success: true, to: jid, type: 'image' }
}

export async function sendFileMessage(sessionId, to, fileBuffer, filename, mimetype) {
  const sock = getActiveSocket(sessionId)
  const jid = formatJid(to)

  await sock.sendMessage(jid, {
    document: fileBuffer,
    fileName: filename,
    mimetype,
  })

  await prisma.message.create({
    data: { sessionId, to, type: 'file', content: filename, status: 'sent' },
  })

  return { success: true, to: jid, type: 'file', filename }
}

// --- Helpers ---

function getActiveSocket(sessionId) {
  const sock = activeSockets.get(sessionId)
  if (!sock) throw new Error(`Session "${sessionId}" not found or not connected`)
  if (getSessionStatus(sessionId) !== 'connected') {
    throw new Error(`Session "${sessionId}" is not connected yet`)
  }
  return sock
}

function formatJid(to) {
  // Already a full JID (e.g. "120363xxx@g.us" or "5511xxx@s.whatsapp.net")
  if (to.includes('@')) return to

  // Group IDs are longer than 15 digits (phone numbers max out at ~15)
  const digits = to.replace(/\D/g, '')
  if (digits.length > 15) return `${digits}@g.us`

  // Regular phone number → individual contact
  return `${digits}@s.whatsapp.net`
}

function ensureSessionCaches(sessionId) {
  if (!sessionContacts.has(sessionId)) {
    sessionContacts.set(sessionId, new Map())
  }

  if (!sessionGroups.has(sessionId)) {
    sessionGroups.set(sessionId, new Map())
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

  for (const chat of chats) {
    if (!chat.id || !chat.id.endsWith('@s.whatsapp.net')) {
      continue
    }

    const normalized = {
      jid: chat.id,
      name: chat.name || chat.conversationTimestamp?.toString() || chat.id.split('@')[0],
      isGroup: false,
    }

    sessionContacts.get(sessionId).set(normalized.jid, normalized)
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

// Restore sessions from DB on startup
export async function restoreSessionsFromDB() {
  const sessions = await prisma.session.findMany({
    where: { status: { not: 'disconnected' } },
  })
  console.log(`[Startup] Restoring ${sessions.length} session(s) from DB...`)
  for (const session of sessions) {
    const authDir = join(SESSIONS_DIR, session.id)
    if (existsSync(authDir)) {
      await createSession(session.id)
    } else {
      await prisma.session.update({ where: { id: session.id }, data: { status: 'disconnected' } })
    }
  }
}
