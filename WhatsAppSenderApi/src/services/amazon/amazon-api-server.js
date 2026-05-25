import Fastify from 'fastify'

export async function buildAmazonApiApp({
  amazonProvider,
  runner,
  config,
  logger = {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    },
  },
} = {}) {
  const fastify = Fastify({ logger })

  fastify.get('/health', async () => ({
    status: 'ok',
    provider: 'amazon',
    timestamp: new Date().toISOString(),
  }))

  fastify.get('/amazon/search', async (request) => {
    if (!amazonProvider?.search) {
      throw new Error('Amazon provider is not configured.')
    }

    const queryTerm = typeof request.query?.term === 'string' ? request.query.term.trim() : ''
    const terms = queryTerm ? [queryTerm] : config.searchTerms

    return amazonProvider.search(terms, {
      targetItemCount: config.postsPerRun,
    })
  })

  fastify.post('/amazon/run', async () => {
    if (!runner?.runOnce) {
      throw new Error('Amazon runner is not configured.')
    }

    return runner.runOnce()
  })

  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error)
    reply.code(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
    })
  })

  return fastify
}
