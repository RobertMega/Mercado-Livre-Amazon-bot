import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createShopeeAffiliateProvider,
  createPlaywrightShopeeAffiliateSession,
} from '../../src/bot/providers/shopee-affiliate-provider.js'

test('shopee affiliate provider uses the injected official generator when available', async () => {
  const calls = []

  const provider = createShopeeAffiliateProvider({
    officialGenerator: {
      async generateAffiliateLink(payload) {
        calls.push(payload)
        return 'https://shope.ee/real-aff-link'
      },
    },
  })

  const affiliateLink = await provider.getAffiliateLink({
    platform: 'shopee',
    id: '123:456',
    permalink: 'https://shopee.com.br/product/123/456#reviews',
  })

  assert.equal(affiliateLink, 'https://shope.ee/real-aff-link')
  assert.deepEqual(calls, [
    {
      item: {
        platform: 'shopee',
        id: '123:456',
        permalink: 'https://shopee.com.br/product/123/456#reviews',
      },
      url: 'https://shopee.com.br/product/123/456',
    },
  ])
})

test('shopee affiliate provider falls back to the configured template when no official generator is configured', async () => {
  const warnings = []

  const provider = createShopeeAffiliateProvider({
    templateUrl: '{{url}}',
    logger: {
      warn(message) {
        warnings.push(message)
      },
    },
  })

  const affiliateLink = await provider.getAffiliateLink({
    platform: 'shopee',
    id: '123:456',
    permalink: 'https://shopee.com.br/product/123/456',
  })

  assert.equal(affiliateLink, 'https%3A%2F%2Fshopee.com.br%2Fproduct%2F123%2F456')
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /fallback/i)
  assert.match(warnings[0], /template/i)
})

test('shopee affiliate provider falls back to the configured template when the official generator fails', async () => {
  const warnings = []

  const provider = createShopeeAffiliateProvider({
    templateUrl: '{{url}}',
    officialGenerator: {
      async generateAffiliateLink() {
        throw new Error('official api unavailable')
      },
    },
    logger: {
      warn(message) {
        warnings.push(message)
      },
    },
  })

  const affiliateLink = await provider.getAffiliateLink({
    platform: 'shopee',
    id: '123:456',
    permalink: 'https://shopee.com.br/product/123/456',
  })

  assert.equal(affiliateLink, 'https%3A%2F%2Fshopee.com.br%2Fproduct%2F123%2F456')
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /fallback/i)
  assert.match(warnings[0], /official api unavailable/i)
})

test('shopee affiliate provider falls back to the original product url when no template is configured', async () => {
  const warnings = []

  const provider = createShopeeAffiliateProvider({
    logger: {
      warn(message) {
        warnings.push(message)
      },
    },
  })

  const affiliateLink = await provider.getAffiliateLink({
    platform: 'shopee',
    id: '123:456',
    permalink: 'https://shopee.com.br/product/123/456#reviews',
  })

  assert.equal(affiliateLink, 'https://shopee.com.br/product/123/456')
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /fallback/i)
  assert.match(warnings[0], /url original/i)
})

test('shopee affiliate provider does not use Playwright by default when session config is absent', async () => {
  const provider = createShopeeAffiliateProvider({
    templateUrl: '{{url}}',
    createAffiliateSession: createPlaywrightShopeeAffiliateSession,
    userDataDir: '',
    storageStatePath: '',
  })

  const affiliateLink = await provider.getAffiliateLink({
    platform: 'shopee',
    id: '123:456',
    permalink: 'https://shopee.com.br/product/123/456',
  })

  assert.equal(affiliateLink, 'https%3A%2F%2Fshopee.com.br%2Fproduct%2F123%2F456')
})
