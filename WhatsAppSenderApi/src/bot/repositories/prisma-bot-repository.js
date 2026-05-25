import prisma from '../../lib/prisma.js'
import {
  buildPostingBatchIdentityParts,
  buildPostingBatchItemKey,
} from '../select-posting-batch.js'

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

    async markStaleExecutionsAsFailed({
      now = new Date(),
      errorMessage = 'Execution interrupted before completion',
    } = {}) {
      return prismaClient.postingExecution.updateMany({
        where: {
          status: 'running',
          finishedAt: null,
        },
        data: {
          status: 'failed',
          errorMessage,
          finishedAt: now,
        },
      })
    },

    async hasPublishedItem(item) {
      const itemId = typeof item === 'string' ? item : buildPostingBatchItemKey(item)
      const identity = typeof item === 'string'
        ? null
        : buildPostingBatchIdentityParts(item)

      const exactRecord = await prismaClient.publishedOffer.findUnique({
        where: { itemId },
      })

      if (exactRecord) {
        return true
      }

      if (!identity?.normalizedPermalink && !identity?.normalizedTitle) {
        return false
      }

      const publishedOffers = await prismaClient.publishedOffer.findMany({
        select: {
          title: true,
          permalink: true,
        },
      })

      return publishedOffers.some((offer) => {
        const publishedIdentity = buildPostingBatchIdentityParts(offer)

        return (
          identity.normalizedPermalink &&
          publishedIdentity.normalizedPermalink === identity.normalizedPermalink
        ) || (
          identity.normalizedTitle &&
          publishedIdentity.normalizedTitle === identity.normalizedTitle
        )
      })
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
