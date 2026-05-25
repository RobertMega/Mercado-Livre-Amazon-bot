// src/routes/panel.routes.js
import { renderPanel } from '../views/panel.js'

export default async function panelRoutes(fastify, { prisma, whatsappService } = {}) {
  fastify.get('/', async (req, reply) => {
    const sessions = await prisma.session.findMany({ orderBy: { createdAt: 'desc' } })

    const withStatus = sessions.map((s) => ({
      ...s,
      status: whatsappService.getSessionStatus(s.id) || s.status,
      hasQR: !!whatsappService.getSessionQR(s.id),
    }))

    return reply.type('text/html').send(renderPanel(withStatus))
  })
}
