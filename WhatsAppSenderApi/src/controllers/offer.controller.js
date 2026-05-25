export async function publishOffer(req, reply, offerIngestionService) {
  if (!offerIngestionService?.publishIncomingOffer) {
    return reply.code(503).send({ error: 'Offer ingestion service is not configured' })
  }

  try {
    const result = await offerIngestionService.publishIncomingOffer(req.body || {})
    return reply.send(result)
  } catch (error) {
    return reply.code(400).send({ error: error.message })
  }
}
