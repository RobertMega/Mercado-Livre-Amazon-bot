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

  const items = await provider.search(['notebook gamer', 'air fryer'])

  assert.equal(requestedUrls.length, 2)
  assert.match(requestedUrls[0], /sites\/MLB\/search\?q=notebook%20gamer&limit=2/)
  assert.match(requestedUrls[1], /sites\/MLB\/search\?q=air%20fryer&limit=2/)
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

  const [item] = await provider.search(['creatina'])

  assert.equal(item.coupon, 'R$ 20 OFF')
})

test('catalog provider falls back to browser scraping when the public API is forbidden', async () => {
  const requestedUrls = []
  let closed = false

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
    createSearchSession: async () => ({
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
    }),
  })

  const items = await provider.search(['creatina growth'])

  assert.equal(requestedUrls.length, 1)
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
  ])

  await provider.close()
  assert.equal(closed, true)
})

test('catalog provider shuffles aggregated items before returning them', async () => {
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

  const items = await provider.search(['air fryer', 'notebook gamer'])

  assert.deepEqual(items.map((item) => item.id), ['MLB2', 'MLB3', 'MLB4', 'MLB5', 'MLB6', 'MLB1'])
})
