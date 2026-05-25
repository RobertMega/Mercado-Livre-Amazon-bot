import test from 'node:test'
import assert from 'node:assert/strict'

import { createMercadoLivreCatalogProvider } from '../../src/bot/providers/mercado-livre-catalog-provider.js'

test('catalog provider searches all configured filters and normalizes Mercado Livre items', async () => {
  const requestedUrls = []

  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 2,
    randomInt: (max) => max - 1,
    fetchImpl: async (url) => {
      requestedUrls.push(url)

      return {
        ok: true,
        async json() {
          return {
            results: [
              {
                id: 'MLB1',
                title: 'Produto 1',
                price: 123.45,
                original_price: 199.9,
                sale_price: {
                  amount: 99.9,
                },
                currency_id: 'BRL',
                permalink: 'https://mercadolivre.com/1',
                secure_thumbnail: 'https://http2.mlstatic.com/product-1.webp',
              },
              {
                id: 'MLB2',
                title: 'Produto 2',
                price: 678.9,
                original_price: null,
                currency_id: 'BRL',
                permalink: 'https://mercadolivre.com/2',
                secure_thumbnail: 'https://http2.mlstatic.com/product-2.webp',
              },
            ],
          }
        },
      }
    },
  })

  const result = await provider.search(['notebook gamer', 'air fryer'])
  const items = result.items

  assert.equal(requestedUrls.length, 2)
  assert.match(requestedUrls[0], /sites\/MLB\/search\?q=notebook(\+|%20)gamer&limit=2/)
  assert.match(requestedUrls[1], /sites\/MLB\/search\?q=air(\+|%20)fryer&limit=2/)
  assert.deepEqual(items, [
    {
      id: 'MLB1',
      title: 'Produto 1',
      price: 99.9,
      originalPrice: 199.9,
      coupon: null,
      currencyId: 'BRL',
      permalink: 'https://mercadolivre.com/1',
      thumbnailUrl: 'https://http2.mlstatic.com/product-1.webp',
      sourceFilter: 'notebook gamer',
    },
    {
      id: 'MLB2',
      title: 'Produto 2',
      price: 678.9,
      originalPrice: null,
      coupon: null,
      currencyId: 'BRL',
      permalink: 'https://mercadolivre.com/2',
      thumbnailUrl: 'https://http2.mlstatic.com/product-2.webp',
      sourceFilter: 'notebook gamer',
    },
    {
      id: 'MLB1',
      title: 'Produto 1',
      price: 99.9,
      originalPrice: 199.9,
      coupon: null,
      currencyId: 'BRL',
      permalink: 'https://mercadolivre.com/1',
      thumbnailUrl: 'https://http2.mlstatic.com/product-1.webp',
      sourceFilter: 'air fryer',
    },
    {
      id: 'MLB2',
      title: 'Produto 2',
      price: 678.9,
      originalPrice: null,
      coupon: null,
      currencyId: 'BRL',
      permalink: 'https://mercadolivre.com/2',
      thumbnailUrl: 'https://http2.mlstatic.com/product-2.webp',
      sourceFilter: 'air fryer',
    },
  ])
})

test('catalog provider normalizes coupon text from API promotion data when available', async () => {
  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 1,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          results: [{
            id: 'MLB1',
            title: 'Produto 1',
            price: 123.45,
            currency_id: 'BRL',
            permalink: 'https://mercadolivre.com/1',
            secure_thumbnail: 'https://http2.mlstatic.com/product-1.webp',
            promotions: [
              {
                type: 'coupon',
                text: 'Cupom R$ 20 OFF',
              },
            ],
          }],
        }
      },
    }),
  })

  const { items } = await provider.search(['creatina'])
  const [item] = items

  assert.equal(item.coupon, 'R$ 20 OFF')
  assert.equal(item.sourceFilter, 'creatina')
})

test('catalog provider prioritizes cheaper promotional Mercado Livre items within each filter', async () => {
  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 3,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          results: [
            {
              id: 'MLB-expensive',
              title: 'Smart TV 75 4K',
              price: 5999,
              original_price: null,
              currency_id: 'BRL',
              permalink: 'https://mercadolivre.com/smart-tv',
            },
            {
              id: 'MLB-discount',
              title: 'Fone Bluetooth Promocao',
              price: 299,
              original_price: 499,
              currency_id: 'BRL',
              permalink: 'https://mercadolivre.com/fone',
            },
            {
              id: 'MLB-coupon',
              title: 'Mouse Gamer Cupom',
              price: 89,
              original_price: 129,
              currency_id: 'BRL',
              permalink: 'https://mercadolivre.com/mouse',
              promotions: [
                {
                  type: 'coupon',
                  text: 'Cupom R$ 20 OFF',
                },
              ],
            },
          ],
        }
      },
    }),
  })

  const { items } = await provider.search(['smart tv 4k promocao'])

  assert.deepEqual(items.map((item) => item.id), [
    'MLB-coupon',
    'MLB-discount',
    'MLB-expensive',
  ])
})

test('catalog provider falls back to browser scraping when the public API is forbidden', async () => {
  const requestedUrls = []
  let closed = false
  let receivedOptions

  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 2,
    randomInt: (max) => max - 1,
    fetchImpl: async (url) => {
      requestedUrls.push(url)

      return {
        ok: false,
        status: 403,
      }
    },
    storageStatePath: 'sessions/mercado-livre-catalog-storage-state.json',
    minDelayMs: 1200,
    maxDelayMs: 2400,
    createSearchSession: async (options) => {
      receivedOptions = options

      return {
      async search(term, limit) {
        assert.equal(term, 'creatina growth')
        assert.equal(limit, 2)

        return [
          {
            id: 'MLB10',
            title: 'Creatina 1',
            price: 89.9,
            originalPrice: 99.9,
            coupon: 'R$ 20 OFF',
            currencyId: 'BRL',
            permalink: 'https://www.mercadolivre.com.br/produto-1/p/MLB10',
            thumbnailUrl: 'https://http2.mlstatic.com/creatina-1.webp',
          },
          {
            id: 'MLB11',
            title: 'Creatina 2',
            price: 99.9,
            coupon: null,
            currencyId: 'BRL',
            permalink: 'https://www.mercadolivre.com.br/produto-2/p/MLB11',
            thumbnailUrl: 'https://http2.mlstatic.com/creatina-2.webp',
          },
        ]
      },
      async close() {
        closed = true
      },
    }
    },
  })

  const result = await provider.search(['creatina growth'])
  const items = result.items

  assert.equal(requestedUrls.length, 1)
  assert.equal(receivedOptions.storageStatePath, 'sessions/mercado-livre-catalog-storage-state.json')
  assert.equal(receivedOptions.minDelayMs, 1200)
  assert.equal(receivedOptions.maxDelayMs, 2400)
  assert.deepEqual(items, [
    {
      id: 'MLB10',
      title: 'Creatina 1',
      price: 89.9,
      originalPrice: 99.9,
      coupon: 'R$ 20 OFF',
      currencyId: 'BRL',
      permalink: 'https://www.mercadolivre.com.br/produto-1/p/MLB10',
      thumbnailUrl: 'https://http2.mlstatic.com/creatina-1.webp',
      sourceFilter: 'creatina growth',
    },
    {
      id: 'MLB11',
      title: 'Creatina 2',
      price: 99.9,
      coupon: null,
      currencyId: 'BRL',
      permalink: 'https://www.mercadolivre.com.br/produto-2/p/MLB11',
      thumbnailUrl: 'https://http2.mlstatic.com/creatina-2.webp',
      sourceFilter: 'creatina growth',
    },
  ])

  await provider.close()
  assert.equal(closed, true)
})

test('catalog provider falls back to browser scraping when the public API request times out', async () => {
  let searchSessionCalls = 0

  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 2,
    apiTimeoutMs: 10,
    fetchImpl: () => new Promise(() => {}),
    createSearchSession: async () => ({
      async search(term, limit) {
        searchSessionCalls += 1
        assert.equal(term, 'air fryer')
        assert.equal(limit, 2)

        return [
          {
            id: 'MLB20',
            title: 'Air Fryer Timeout Fallback',
            price: 199.9,
            currencyId: 'BRL',
            permalink: 'https://www.mercadolivre.com.br/produto-timeout/p/MLB20',
            thumbnailUrl: 'https://http2.mlstatic.com/timeout.webp',
          },
        ]
      },
      async close() {},
    }),
  })

  const result = await provider.search(['air fryer'])

  assert.equal(searchSessionCalls, 1)
  assert.deepEqual(result.items, [
    {
      id: 'MLB20',
      title: 'Air Fryer Timeout Fallback',
      price: 199.9,
      currencyId: 'BRL',
      permalink: 'https://www.mercadolivre.com.br/produto-timeout/p/MLB20',
      thumbnailUrl: 'https://http2.mlstatic.com/timeout.webp',
      sourceFilter: 'air fryer',
    },
  ])
})

test('catalog provider recreates the browser search session when Playwright closes unexpectedly', async () => {
  let sessionAttempts = 0

  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 2,
    fetchImpl: async () => ({
      ok: false,
      status: 403,
    }),
    createSearchSession: async () => {
      sessionAttempts += 1

      if (sessionAttempts === 1) {
        return {
          async search() {
            throw new Error('page.goto: Target page, context or browser has been closed')
          },
          async close() {},
        }
      }

      return {
        async search(term, limit) {
          assert.equal(term, 'air fryer')
          assert.equal(limit, 2)

          return [
            {
              id: 'MLB21',
              title: 'Air Fryer Recovery',
              price: 249.9,
              currencyId: 'BRL',
              permalink: 'https://www.mercadolivre.com.br/produto-recovery/p/MLB21',
              thumbnailUrl: 'https://http2.mlstatic.com/recovery.webp',
            },
          ]
        },
        async close() {},
      }
    },
  })

  const result = await provider.search(['air fryer'])

  assert.equal(sessionAttempts, 2)
  assert.deepEqual(result.items, [
    {
      id: 'MLB21',
      title: 'Air Fryer Recovery',
      price: 249.9,
      currencyId: 'BRL',
      permalink: 'https://www.mercadolivre.com.br/produto-recovery/p/MLB21',
      thumbnailUrl: 'https://http2.mlstatic.com/recovery.webp',
      sourceFilter: 'air fryer',
    },
  ])
})

test('catalog provider keeps paging API results until it collects enough unpublished items', async () => {
  const requestedOffsets = []

  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 2,
    randomInt: (max) => max - 1,
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url)
      const offset = Number.parseInt(parsedUrl.searchParams.get('offset') || '0', 10)
      requestedOffsets.push(offset)

      const pages = {
        0: [
          { id: 'MLB1', title: 'Produto 1', price: 10, currency_id: 'BRL', permalink: 'https://mercadolivre.com/1' },
          { id: 'MLB2', title: 'Produto 2', price: 20, currency_id: 'BRL', permalink: 'https://mercadolivre.com/2' },
        ],
        2: [
          { id: 'MLB3', title: 'Produto 3', price: 30, currency_id: 'BRL', permalink: 'https://mercadolivre.com/3' },
          { id: 'MLB4', title: 'Produto 4', price: 40, currency_id: 'BRL', permalink: 'https://mercadolivre.com/4' },
        ],
        4: [
          { id: 'MLB5', title: 'Produto 5', price: 50, currency_id: 'BRL', permalink: 'https://mercadolivre.com/5' },
          { id: 'MLB6', title: 'Produto 6', price: 60, currency_id: 'BRL', permalink: 'https://mercadolivre.com/6' },
        ],
      }

      return {
        ok: true,
        async json() {
          return {
            results: pages[offset] ?? [],
          }
        },
      }
    },
  })

  const result = await provider.search(['air fryer'], {
    targetItemCount: 2,
  })
  const items = result.items

  assert.deepEqual(requestedOffsets, [0, 2, 4])
  assert.deepEqual(items.map((item) => item.id), ['MLB1', 'MLB2', 'MLB3', 'MLB4', 'MLB5', 'MLB6'])
})

test('catalog provider returns aggregated items in ranked provider order', async () => {
  let nextId = 1

  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 3,
    randomInt: () => 0,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        const base = nextId
        nextId += 3

        return {
          results: [
            { id: `MLB${base}`, title: `Produto ${base}`, price: base, currency_id: 'BRL', permalink: `https://mercadolivre.com/${base}` },
            { id: `MLB${base + 1}`, title: `Produto ${base + 1}`, price: base + 1, currency_id: 'BRL', permalink: `https://mercadolivre.com/${base + 1}` },
            { id: `MLB${base + 2}`, title: `Produto ${base + 2}`, price: base + 2, currency_id: 'BRL', permalink: `https://mercadolivre.com/${base + 2}` },
          ],
        }
      },
    }),
  })

  const result = await provider.search(['air fryer', 'notebook gamer'])
  const items = result.items

  assert.deepEqual(items.map((item) => item.id), ['MLB1', 'MLB2', 'MLB3', 'MLB4', 'MLB5', 'MLB6'])
})

test('catalog provider returns one aggregated raw pool with search metrics for all processed terms', async () => {
  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 2,
    fetchImpl: async (url) => {
      const query = new URL(url).searchParams.get('q')

      return {
        ok: true,
        async json() {
          if (query === 'air fryer') {
            return {
              results: [
                { id: 'MLB1', title: 'Air Fryer 1', price: 10, currency_id: 'BRL', permalink: 'https://mercadolivre.com/1' },
                { id: 'MLB2', title: 'Air Fryer 2', price: 20, currency_id: 'BRL', permalink: 'https://mercadolivre.com/2' },
              ],
            }
          }

          return {
            results: [
              { id: 'MLB3', title: 'Creatina 1', price: 30, currency_id: 'BRL', permalink: 'https://mercadolivre.com/3' },
              { id: 'MLB4', title: 'Creatina 2', price: 40, currency_id: 'BRL', permalink: 'https://mercadolivre.com/4' },
            ],
          }
        },
      }
    },
  })

  const result = await provider.search(['air fryer', 'creatina'])

  assert.equal(result.termsProcessed, 2)
  assert.equal(result.rawItemsFound, 4)
  assert.deepEqual(result.items.map((item) => item.id), ['MLB1', 'MLB2', 'MLB3', 'MLB4'])
})

test('catalog provider caps the raw target pool instead of multiplying by every configured filter', async () => {
  const requestedQueries = []

  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 2,
    maxPagesPerFilter: 1,
    fetchImpl: async (url) => {
      const query = new URL(url).searchParams.get('q')
      requestedQueries.push(query)

      return {
        ok: true,
        async json() {
          return {
            results: [
              { id: `MLB-${query}-1`, title: `Produto ${query} 1`, price: 10, currency_id: 'BRL', permalink: `https://mercadolivre.com/${query}/1` },
              { id: `MLB-${query}-2`, title: `Produto ${query} 2`, price: 20, currency_id: 'BRL', permalink: `https://mercadolivre.com/${query}/2` },
            ],
          }
        },
      }
    },
  })

  const result = await provider.search(['air fryer', 'creatina', 'echo dot', 'alexa', 'cadeira gamer'], {
    targetItemCount: 3,
  })

  assert.deepEqual(requestedQueries, ['air fryer', 'creatina', 'echo dot', 'alexa'])
  assert.equal(result.items.length, 8)
})

test('catalog provider stops requesting filters after the raw target pool is reached', async () => {
  const requestedQueries = []

  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 2,
    maxPagesPerFilter: 10,
    fetchImpl: async (url) => {
      const query = new URL(url).searchParams.get('q')
      requestedQueries.push(query)

      return {
        ok: true,
        async json() {
          return {
            results: [
              { id: `MLB-${query}-1`, title: `Produto ${query} 1`, price: 10, currency_id: 'BRL', permalink: `https://mercadolivre.com/${query}/1` },
              { id: `MLB-${query}-2`, title: `Produto ${query} 2`, price: 20, currency_id: 'BRL', permalink: `https://mercadolivre.com/${query}/2` },
            ],
          }
        },
      }
    },
  })

  const result = await provider.search(['air fryer', 'creatina', 'echo dot', 'alexa', 'cadeira gamer'], {
    targetItemCount: 3,
  })

  assert.deepEqual(requestedQueries, ['air fryer', 'creatina', 'echo dot', 'alexa'])
  assert.equal(result.items.length, 8)
})

test('catalog provider limits each filter contribution so a large first result set does not monopolize the target pool', async () => {
  const requestedQueries = []

  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 20,
    maxPagesPerFilter: 1,
    fetchImpl: async (url) => {
      const query = new URL(url).searchParams.get('q')
      requestedQueries.push(query)

      return {
        ok: true,
        async json() {
          return {
            results: Array.from({ length: 20 }, (_, index) => ({
              id: `MLB-${query}-${index + 1}`,
              title: `Produto ${query} ${index + 1}`,
              price: 10 + index,
              currency_id: 'BRL',
              permalink: `https://mercadolivre.com/${query}/${index + 1}`,
            })),
          }
        },
      }
    },
  })

  const result = await provider.search([
    'air fryer',
    'creatina',
    'echo dot',
    'alexa',
    'cadeira gamer',
    'iphone',
    'notebook',
    'smart tv',
    'ventilador',
    'mouse gamer',
    'perfume',
    'whey protein',
    'cafeteira',
  ], {
    targetItemCount: 5,
  })

  assert.deepEqual(requestedQueries, [
    'air fryer',
    'creatina',
    'echo dot',
    'alexa',
    'cadeira gamer',
    'iphone',
    'notebook',
    'smart tv',
    'ventilador',
    'mouse gamer',
    'perfume',
    'whey protein',
  ])
  assert.equal(result.items.length, 12)
  assert.deepEqual(result.items.map((item) => item.sourceFilter), requestedQueries)
})

test('catalog provider skips recently published items before counting the target pool', async () => {
  const requestedQueries = []

  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 2,
    maxPagesPerFilter: 2,
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url)
      const query = parsedUrl.searchParams.get('q')
      const offset = Number.parseInt(parsedUrl.searchParams.get('offset') || '0', 10)
      requestedQueries.push(`${query}:${offset}`)

      return {
        ok: true,
        async json() {
          return {
            results: [
              { id: `MLB-${query}-${offset}-1`, title: `Produto ${query} ${offset} 1`, price: 10, currency_id: 'BRL', permalink: `https://mercadolivre.com/${query}/${offset}/1` },
              { id: `MLB-${query}-${offset}-2`, title: `Produto ${query} ${offset} 2`, price: 20, currency_id: 'BRL', permalink: `https://mercadolivre.com/${query}/${offset}/2` },
            ],
          }
        },
      }
    },
  })

  const result = await provider.search(['air fryer', 'creatina'], {
    targetItemCount: 2,
    isRecentlyPublished: async (item) => item.sourceFilter === 'air fryer' && item.id.endsWith('-0-1'),
  })

  assert.deepEqual(requestedQueries, ['air fryer:0', 'creatina:0', 'air fryer:2', 'creatina:2'])
  assert.deepEqual(result.items.map((item) => item.id), [
    'MLB-air fryer-0-2',
    'MLB-creatina-0-1',
    'MLB-creatina-0-2',
    'MLB-air fryer-2-1',
    'MLB-air fryer-2-2',
    'MLB-creatina-2-1',
  ])
})

test('catalog provider samples across different filters before stopping at the raw target cap', async () => {
  const requestedQueries = []

  const provider = createMercadoLivreCatalogProvider({
    siteId: 'MLB',
    limitPerFilter: 2,
    maxPagesPerFilter: 2,
    fetchImpl: async (url) => {
      const query = new URL(url).searchParams.get('q')
      const offset = Number.parseInt(new URL(url).searchParams.get('offset') || '0', 10)
      requestedQueries.push(`${query}:${offset}`)

      return {
        ok: true,
        async json() {
          return {
            results: [
              { id: `MLB-${query}-${offset}-1`, title: `Produto ${query} 1`, price: 10, currency_id: 'BRL', permalink: `https://mercadolivre.com/${query}/${offset}/1` },
              { id: `MLB-${query}-${offset}-2`, title: `Produto ${query} 2`, price: 20, currency_id: 'BRL', permalink: `https://mercadolivre.com/${query}/${offset}/2` },
            ],
          }
        },
      }
    },
  })

  const result = await provider.search(['alexa', 'furadeira', 'iphone'], {
    targetItemCount: 3,
  })

  assert.deepEqual(requestedQueries, ['alexa:0', 'furadeira:0', 'iphone:0', 'alexa:2'])
  assert.deepEqual(result.items.map((item) => item.sourceFilter), [
    'alexa',
    'alexa',
    'furadeira',
    'furadeira',
    'iphone',
    'iphone',
    'alexa',
    'alexa',
  ])
})
