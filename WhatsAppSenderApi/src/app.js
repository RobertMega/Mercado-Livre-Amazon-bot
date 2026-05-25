import Fastify from 'fastify'
import multipart from '@fastify/multipart'

import prisma from './lib/prisma.js'
import sessionRoutes from './routes/session.routes.js'
import messageRoutes from './routes/message.routes.js'
import panelRoutes from './routes/panel.routes.js'
import * as whatsappService from './services/whatsapp.service.js'

export async function buildApp({
  prisma: prismaClient = prisma,
  whatsappService: whatsapp = whatsappService,
  autoRestoreSessions = true,
  logger = {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    },
  },
} = {}) {
  const fastify = Fastify({
    logger,
    bodyLimit: 500 * 1024 * 1024,
  })

  await fastify.register(multipart, {
    limits: { fileSize: 500 * 1024 * 1024 },
  })

  await fastify.register(panelRoutes, { prefix: '/panel' })
  await fastify.register(sessionRoutes, {
    prefix: '/api/sessions',
    prisma: prismaClient,
    whatsappService: whatsapp,
  })
  await fastify.register(messageRoutes, { prefix: '/api/chat', whatsappService: whatsapp })

  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  fastify.setErrorHandler((error, req, reply) => {
    fastify.log.error(error)
    reply.code(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
    })
  })

  if (autoRestoreSessions) {
    fastify.addHook('onReady', async () => {
      await whatsapp.restoreSessionsFromDB()
    })
  }

  return fastify
}
