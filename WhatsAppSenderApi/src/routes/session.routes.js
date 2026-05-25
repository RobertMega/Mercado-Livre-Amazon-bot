// src/routes/session.routes.js
import { createSessionController } from '../controllers/session.controller.js'

export default async function sessionRoutes(fastify, opts) {
  const sessionController = createSessionController({
    prismaClient: opts.prisma,
    whatsappService: opts.whatsappService,
  })

  fastify.get('/', sessionController.listSessions)
  fastify.post('/', sessionController.createSession)
  fastify.get('/:id', sessionController.getSession)
  fastify.get('/:id/qr', sessionController.getSessionQR)
  fastify.get('/:id/chats', sessionController.listSessionChats)
  fastify.delete('/:id', sessionController.deleteSession)
}
