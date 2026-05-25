// src/routes/message.routes.js
import * as messageController from '../controllers/message.controller.js'

export default async function messageRoutes(fastify, { whatsappService } = {}) {
  fastify.post('/send/text', (req, reply) => messageController.sendText(req, reply, whatsappService))
  fastify.post('/send/image', (req, reply) => messageController.sendImage(req, reply, whatsappService))
  fastify.post('/send/document', messageController.sendFile)
}
