// src/routes/panel.routes.js
import prisma from '../lib/prisma.js'
import * as whatsapp from '../services/whatsapp.service.js'
import { renderPanel } from '../views/panel.js'

export default async function panelRoutes(fastify) {
  fastify.get('/', async (req, reply) => {
    const sessions = await prisma.session.findMany({ orderBy: { createdAt: 'desc' } })

    const withStatus = sessions.map((s) => ({
      ...s,
      status: whatsapp.getSessionStatus(s.id) || s.status,
      hasQR: !!whatsapp.getSessionQR(s.id),
    }))

    return reply.type('text/html').send(renderPanel(withStatus))
  })
}
