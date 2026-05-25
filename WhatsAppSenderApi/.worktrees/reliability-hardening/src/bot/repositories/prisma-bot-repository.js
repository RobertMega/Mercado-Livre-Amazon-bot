import prisma from '../../lib/prisma.js'

export function createPrismaBotRepository({ prismaClient = prisma } = {}) {
  return {
    async syncFilters(terms) {
      const normalizedTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))]

      if (!normalizedTerms.length) {
        return []
      }

      await prismaClient.$transaction([
        prismaClient.searchFilter.updateMany({
          where: { term: { notIn: normalizedTerms } },
          data: { isActive: false },
        }),
        ...normalizedTerms.map((term) => prismaClient.searchFilter.upsert({
          where: { term },
          update: { isActive: true },
          create: { term, isActive: true },
        })),
      ])

      return prismaClient.searchFilter.findMany({
        where: { isActive: true },
        orderBy: { term: 'asc' },
      })
    },

    async listActiveFilters() {
      return prismaClient.searchFilter.findMany({
        where: { isActive: true },
        orderBy: { term: 'asc' },
      })
    },

    async createExecution(data) {
      return prismaClient.postingExecution.create({
        data: {
          status: data.status,
          startedAt: data.startedAt,
        },
      })
    },

    async finishExecution(id, data) {
      return prismaClient.postingExecution.update({
        where: { id },
        data,
      })
    },

    async hasPublishedItem(itemId) {
      const record = await prismaClient.publishedOffer.findUnique({
        where: { itemId },
      })

      return !!record
    },

    async markOfferPublished(data) {
      return prismaClient.publishedOffer.create({
        data,
      })
    },

    async recordOfferFailure(data) {
      return prismaClient.postingFailure.create({
        data,
      })
    },
  }
}
