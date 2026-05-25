import * as offerController from '../controllers/offer.controller.js'

export default async function offerRoutes(fastify, { offerIngestionService } = {}) {
  fastify.post('/publish', (req, reply) => offerController.publishOffer(req, reply, offerIngestionService))
}
