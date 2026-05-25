import Fastify from 'fastify'
import multipart from '@fastify/multipart'

import prisma from './lib/prisma.js'
import { getRuntimeConfig } from './lib/runtime-config.js'
import sessionRoutes from './routes/session.routes.js'
import messageRoutes from './routes/message.routes.js'
import panelRoutes from './routes/panel.routes.js'
import * as whatsappService from './services/whatsapp.service.js'

function getBearerToken(headerValue) {
  if (typeof headerValue !== 'string') {
    return ''
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

function createProtectedRouteHook(expectedToken) {
  return async function protectedRouteHook(req, reply) {
    if (!expectedToken) {
      return
    }

    const providedToken =
      req.headers['x-api-key'] ||
      getBearerToken(req.headers.authorization)

    if (providedToken !== expectedToken) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  }
}

async function probeDatabase(prismaClient) {
  if (typeof prismaClient?.$queryRaw !== 'function') {
    return {
      status: 'unknown',
    }
  }

  try {
    await prismaClient.$queryRaw`SELECT 1`

    return {
      status: 'up',
    }
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function buildApp({
  prisma: prismaClient = prisma,
  whatsappService: whatsapp = whatsappService,
  runtimeConfig = getRuntimeConfig(),
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
    bodyLimit: runtimeConfig.bodyLimitBytes,
  })

  await fastify.register(multipart, {
    limits: { fileSize: runtimeConfig.multipartFileSizeBytes },
  })

  await fastify.register(async function protectedPanelRoutes(instance) {
    instance.addHook('onRequest', createProtectedRouteHook(runtimeConfig.panelToken))
    await instance.register(panelRoutes, {
      prefix: '/panel',
      prisma: prismaClient,
      whatsappService: whatsapp,
    })
  })

  await fastify.register(async function protectedApiRoutes(instance) {
    instance.addHook('onRequest', createProtectedRouteHook(runtimeConfig.apiToken))
    await instance.register(sessionRoutes, {
      prefix: '/api/sessions',
      prisma: prismaClient,
      whatsappService: whatsapp,
    })
    await instance.register(messageRoutes, { prefix: '/api/chat', whatsappService: whatsapp })
  })

  fastify.get('/health', async () => {
    const database = await probeDatabase(prismaClient)
    const status = database.status === 'down' ? 'degraded' : 'ok'

    return {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database,
      },
    }
  })

  fastify.get('/ready', async (req, reply) => {
    const database = await probeDatabase(prismaClient)

    if (database.status === 'down') {
      return reply.code(503).send({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          database,
        },
      })
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database,
      },
    }
  })

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
