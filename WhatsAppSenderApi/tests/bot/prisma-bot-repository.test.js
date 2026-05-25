import test from 'node:test'
import assert from 'node:assert/strict'

import { createPrismaBotRepository } from '../../src/bot/repositories/prisma-bot-repository.js'

test('markStaleExecutionsAsFailed marks unfinished running executions as failed', async () => {
  const updateManyCalls = []
  const now = new Date('2026-04-14T02:20:00.000Z')

  const repository = createPrismaBotRepository({
    prismaClient: {
      postingExecution: {
        async updateMany(payload) {
          updateManyCalls.push(payload)
          return { count: 2 }
        },
      },
    },
  })

  const result = await repository.markStaleExecutionsAsFailed({ now })

  assert.equal(result.count, 2)
  assert.equal(updateManyCalls.length, 1)
  assert.deepEqual(updateManyCalls[0], {
    where: {
      status: 'running',
      finishedAt: null,
    },
    data: {
      status: 'failed',
      errorMessage: 'Execution interrupted before completion',
      finishedAt: now,
    },
  })
})

test('hasPublishedItem matches previously posted offers by normalized permalink', async () => {
  const findUniqueCalls = []
  const repository = createPrismaBotRepository({
    prismaClient: {
      publishedOffer: {
        async findUnique(payload) {
          findUniqueCalls.push(payload)
          return null
        },
        async findMany() {
          return [
            {
              title: 'Produto publicado',
              permalink: 'https://example.com/produto?utm=old#reviews',
            },
          ]
        },
      },
    },
  })

  const result = await repository.hasPublishedItem({
    id: 'MLB-NEW',
    title: 'Outro titulo',
    permalink: 'https://example.com/produto?utm=new#section',
  })

  assert.equal(result, true)
  assert.deepEqual(findUniqueCalls, [
    {
      where: {
        itemId: 'id:mlb-new',
      },
    },
  ])
})

test('hasPublishedItem matches previously posted offers by normalized title', async () => {
  const repository = createPrismaBotRepository({
    prismaClient: {
      publishedOffer: {
        async findUnique() {
          return null
        },
        async findMany() {
          return [
            {
              title: '  Fritadeira   Sem Óleo Air Fryer 3,5L Mondial  ',
              permalink: 'https://example.com/old-air-fryer',
            },
          ]
        },
      },
    },
  })

  const result = await repository.hasPublishedItem({
    id: 'MLB-NEW',
    title: 'fritadeira sem óleo air fryer 3,5l mondial',
    permalink: 'https://example.com/new-air-fryer',
  })

  assert.equal(result, true)
})
