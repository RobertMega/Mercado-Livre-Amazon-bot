// src/controllers/session.controller.js
import prisma from '../lib/prisma.js'
import * as whatsapp from '../services/whatsapp.service.js'

export function createSessionController({
  prismaClient = prisma,
  whatsappService = whatsapp,
} = {}) {
  function resolveSessionStatus(sessionId, persistedStatus) {
    const runtimeStatus = whatsappService.getSessionStatus(sessionId)

    if (runtimeStatus === 'disconnected' && persistedStatus === 'needs_reauth') {
      return 'needs_reauth'
    }

    return runtimeStatus || persistedStatus
  }

  return {
    async listSessions(req, reply) {
      const sessions = await prismaClient.session.findMany({
        orderBy: { createdAt: 'desc' },
      })

      const result = sessions.map((s) => ({
        ...s,
        status: resolveSessionStatus(s.id, s.status),
        hasQR: !!whatsappService.getSessionQR(s.id),
      }))

      return reply.send(result)
    },

    async createSession(req, reply) {
      const { name } = req.body

      if (!name || typeof name !== 'string' || !name.trim()) {
        return reply.code(400).send({ error: 'Field "name" is required' })
      }

      const sessionId = name.trim().toLowerCase().replace(/\s+/g, '-')

      const existing = await prismaClient.session.findUnique({ where: { id: sessionId } })
      const currentStatus = existing ? resolveSessionStatus(sessionId, existing.status) : 'disconnected'

      if (existing && !['disconnected', 'needs_reauth'].includes(currentStatus)) {
        return reply.code(409).send({ error: 'Session already active', sessionId })
      }

      const result = await whatsappService.createSession(sessionId)
      return reply.code(201).send(result)
    },

    async getSession(req, reply) {
      const { id } = req.params
      const session = await prismaClient.session.findUnique({ where: { id } })

      if (!session) return reply.code(404).send({ error: 'Session not found' })

      return reply.send({
        ...session,
        status: resolveSessionStatus(id, session.status),
        hasQR: !!whatsappService.getSessionQR(id),
      })
    },

    async getSessionQR(req, reply) {
      const { id } = req.params
      const qr = whatsappService.getSessionQR(id)

      if (!qr) {
        return reply.code(404).send({ error: 'QR code not available. Session may already be connected or not started.' })
      }

      return reply.send({ qr })
    },

    async listSessionChats(req, reply) {
      const { id } = req.params
      const session = await prismaClient.session.findUnique({ where: { id } })

      if (!session) {
        return reply.code(404).send({ error: 'Session not found' })
      }

      const status = resolveSessionStatus(id, session.status)

      if (status === 'needs_reauth') {
        return reply.code(409).send({ error: `Session "${id}" requires re-authentication via QR code` })
      }

      if (status !== 'connected') {
        return reply.code(409).send({ error: `Session "${id}" is not connected yet` })
      }

      const chats = await whatsappService.listSessionChats(id)
      return reply.send({ sessionId: id, chats })
    },

    async deleteSession(req, reply) {
      const { id } = req.params
      const session = await prismaClient.session.findUnique({ where: { id } })
      if (!session) return reply.code(404).send({ error: 'Session not found' })

      const result = await whatsappService.removeSession(id)
      await prismaClient.session.delete({ where: { id } }).catch(() => {})

      return reply.send(result)
    },
  }
}

const defaultController = createSessionController()

export const listSessions = defaultController.listSessions
export const createSession = defaultController.createSession
export const getSession = defaultController.getSession
export const getSessionQR = defaultController.getSessionQR
export const listSessionChats = defaultController.listSessionChats
export const deleteSession = defaultController.deleteSession
