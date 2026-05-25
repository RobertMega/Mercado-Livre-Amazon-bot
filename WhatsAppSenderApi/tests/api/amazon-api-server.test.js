import test from 'node:test'
import assert from 'node:assert/strict'

import { buildAmazonApiApp } from '../../src/services/amazon/amazon-api-server.js'

test('amazon api exposes health and isolated search endpoints', async () => {
  const app = await buildAmazonApiApp({
    amazonProvider: {
      async search(terms, options) {
        return {
          termsProcessed: terms.length,
          rawItemsFound: 1,
          items: [{ id: 'B0ABC123', title: 'Echo Dot', options }],
        }
      },
    },
    config: {
      searchTerms: ['alexa promocao'],
      postsPerRun: 2,
    },
    logger: false,
  })

  const health = await app.inject({ method: 'GET', url: '/health' })
  assert.equal(health.statusCode, 200)
  assert.equal(JSON.parse(health.body).status, 'ok')

  const search = await app.inject({ method: 'GET', url: '/amazon/search?term=echo%20dot' })
  assert.equal(search.statusCode, 200)
  assert.deepEqual(JSON.parse(search.body), {
    termsProcessed: 1,
    rawItemsFound: 1,
    items: [
      {
        id: 'B0ABC123',
        title: 'Echo Dot',
        options: {
          targetItemCount: 2,
        },
      },
    ],
  })

  await app.close()
})

test('amazon api run endpoint invokes the isolated runner', async () => {
  const app = await buildAmazonApiApp({
    runner: {
      async runOnce() {
        return { sentCount: 1 }
      },
    },
    config: { searchTerms: [], postsPerRun: 1 },
    logger: false,
  })

  const response = await app.inject({ method: 'POST', url: '/amazon/run' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(response.body), { sentCount: 1 })

  await app.close()
})
