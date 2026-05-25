import test from 'node:test'
import assert from 'node:assert/strict'

import { createMarketplaceAffiliateProvider } from '../../src/bot/providers/marketplace-affiliate-provider.js'

test('marketplace affiliate provider delegates Mercado Livre items to the ML provider', async () => {
  const calls = []

  const provider = createMarketplaceAffiliateProvider({
    providers: {
      mercado_livre: {
        async getAffiliateLink(item) {
          calls.push(item)
          return 'https://meli.la/1GHAQVQ'
        },
      },
      shopee: {
        async getAffiliateLink() {
          throw new Error('should not use shopee provider')
        },
      },
    },
  })

  const affiliateLink = await provider.getAffiliateLink({
    platform: 'mercado_livre',
    id: 'MLB1',
    permalink: 'https://www.mercadolivre.com.br/oferta/p/MLB1',
  })

  assert.equal(affiliateLink, 'https://meli.la/1GHAQVQ')
  assert.deepEqual(calls, [
    {
      platform: 'mercado_livre',
      id: 'MLB1',
      permalink: 'https://www.mercadolivre.com.br/oferta/p/MLB1',
    },
  ])
})

test('marketplace affiliate provider delegates Shopee items to the Shopee provider first', async () => {
  const calls = []
  const provider = createMarketplaceAffiliateProvider({
    shopee: {
      async getAffiliateLink(item) {
        calls.push(item)
        return 'https://shope.ee/abc123'
      },
    },
    providers: {
      mercado_livre: {
        async getAffiliateLink() {
          throw new Error('should not use mercado livre provider')
        },
      },
    },
  })

  const affiliateLink = await provider.getAffiliateLink({
    platform: 'shopee',
    id: '123456',
    permalink: 'https://shopee.com.br/product/123/456',
  })

  assert.equal(affiliateLink, 'https://shope.ee/abc123')
  assert.deepEqual(calls, [
    {
      platform: 'shopee',
      id: '123456',
      permalink: 'https://shopee.com.br/product/123/456',
    },
  ])
})

test('marketplace affiliate provider falls back to the Shopee template when the real provider fails', async () => {
  const provider = createMarketplaceAffiliateProvider({
    shopee: {
      templateUrl: '{{url}}',
      async getAffiliateLink() {
        throw new Error('shopee session expired')
      },
    },
    providers: {
      mercado_livre: {
        async getAffiliateLink() {
          throw new Error('should not use mercado livre provider')
        },
      },
    },
  })

  const affiliateLink = await provider.getAffiliateLink({
    platform: 'shopee',
    id: '123456',
    permalink: 'https://shopee.com.br/product/123/456',
  })

  assert.equal(affiliateLink, 'https%3A%2F%2Fshopee.com.br%2Fproduct%2F123%2F456')
})

test('marketplace affiliate provider keeps publishing Shopee items using the original url when no template is configured', async () => {
  const warnings = []
  const provider = createMarketplaceAffiliateProvider({
    shopee: {
      logger: {
        warn(message) {
          warnings.push(message)
        },
      },
      async getAffiliateLink(item) {
        return item.permalink
      },
    },
    providers: {
      mercado_livre: {
        async getAffiliateLink() {
          throw new Error('should not use mercado livre provider')
        },
      },
    },
  })

  const affiliateLink = await provider.getAffiliateLink({
    platform: 'shopee',
    id: '123456',
    permalink: 'https://shopee.com.br/product/123/456',
  })

  assert.equal(affiliateLink, 'https://shopee.com.br/product/123/456')
  assert.deepEqual(warnings, [])
})

test('marketplace affiliate provider delegates Amazon items to the Amazon provider', async () => {
  const calls = []
  const provider = createMarketplaceAffiliateProvider({
    providers: {
      amazon: {
        async getAffiliateLink(item) {
          calls.push(item)
          return {
            url: 'https://www.amazon.com.br/dp/B0ABC12345?tag=tag-20',
            source: 'affiliate',
            usedFallback: false,
          }
        },
      },
    },
  })

  const affiliateLink = await provider.getAffiliateLink({
    platform: 'amazon',
    id: 'B0ABC12345',
    permalink: 'https://www.amazon.com.br/dp/B0ABC12345',
  })

  assert.deepEqual(affiliateLink, {
    url: 'https://www.amazon.com.br/dp/B0ABC12345?tag=tag-20',
    source: 'affiliate',
    usedFallback: false,
  })
  assert.equal(calls.length, 1)
})
