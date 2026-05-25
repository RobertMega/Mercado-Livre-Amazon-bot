import test from 'node:test'
import assert from 'node:assert/strict'

import { createMarketplaceRouter, detectMarketplace } from '../../src/bot/marketplace-router.js'

test('detectMarketplace identifies Mercado Livre, Shopee and Amazon links', () => {
  assert.equal(detectMarketplace({ url: 'https://www.mercadolivre.com.br/oferta/p/MLB123' }), 'mercado_livre')
  assert.equal(detectMarketplace({ url: 'https://shopee.com.br/product/123/456' }), 'shopee')
  assert.equal(detectMarketplace({ url: 'https://www.amazon.com.br/dp/B0ABC12345' }), 'amazon')
  assert.equal(
    detectMarketplace({
      url: 'https://shopee.com.br/Balanca-Bioimpedancia-i.378143264.23696668795',
    }),
    'shopee',
  )
  assert.equal(
    detectMarketplace({
      url: 'https://www.shopee.com.br/Balanca-Bioimpedancia-i.378143264.23696668795',
    }),
    'shopee',
  )
})

test('detectMarketplace accepts link as an alias for url', () => {
  assert.equal(
    detectMarketplace({
      link: 'https://shopee.com.br/Balanca-Bioimpedancia-i.378143264.23696668795',
    }),
    'shopee',
  )
})

test('detectMarketplace falls back to explicit source metadata when url is missing', () => {
  assert.equal(detectMarketplace({ source: 'Shopee' }), 'shopee')
  assert.equal(detectMarketplace({ metadata: { platform: 'mercado_livre' } }), 'mercado_livre')
})

test('marketplace router delegates payload enrichment to the matching handler', async () => {
  const calls = []

  const router = createMarketplaceRouter({
    handlers: {
      mercado_livre: {
        async enrichOffer(input) {
          calls.push({ platform: 'mercado_livre', input })
          return { platform: 'mercado_livre', id: 'MLB1', title: 'Produto ML' }
        },
      },
      shopee: {
        async enrichOffer(input) {
          calls.push({ platform: 'shopee', input })
          return { platform: 'shopee', id: 'SHP1', title: 'Produto Shopee' }
        },
      },
    },
  })

  const mlItem = await router.enrichOffer({ url: 'https://www.mercadolivre.com.br/oferta/p/MLB1' })
  const shopeeItem = await router.enrichOffer({ url: 'https://shopee.com.br/product/10/20' })

  assert.deepEqual(mlItem, { platform: 'mercado_livre', id: 'MLB1', title: 'Produto ML' })
  assert.deepEqual(shopeeItem, { platform: 'shopee', id: 'SHP1', title: 'Produto Shopee' })
  assert.deepEqual(calls, [
    {
      platform: 'mercado_livre',
      input: { url: 'https://www.mercadolivre.com.br/oferta/p/MLB1' },
    },
    {
      platform: 'shopee',
      input: { url: 'https://shopee.com.br/product/10/20' },
    },
  ])
})

test('marketplace router rejects unsupported marketplace links', async () => {
  const router = createMarketplaceRouter({
    handlers: {
      mercado_livre: { async enrichOffer() {} },
      shopee: { async enrichOffer() {} },
    },
  })

  await assert.rejects(
    () => router.enrichOffer({ url: 'https://example.com/oferta/123' }),
    /Unsupported marketplace offer/,
  )
})
