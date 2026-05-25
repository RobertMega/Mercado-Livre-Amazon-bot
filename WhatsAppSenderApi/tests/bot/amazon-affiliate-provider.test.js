import test from 'node:test'
import assert from 'node:assert/strict'

import { createAmazonAffiliateProvider } from '../../src/bot/providers/amazon-affiliate-provider.js'
import {
  createAmazonAssociatesLinkSession,
  extractAssociatesLinksFromTexts,
} from '../../src/bot/providers/amazon-affiliate-provider.js'

test('amazon affiliate provider can generate SiteStripe short link even when tag is missing', async () => {
  const provider = createAmazonAffiliateProvider({
    tag: '',
    createAssociatesLinkSession: async () => ({
      async createLink() {
        return {
          shortUrl: 'https://amzn.to/4sHAqQP',
        }
      },
      async close() {},
    }),
  })

  const result = await provider.getAffiliateLink({
    id: 'B0ABC12345',
    permalink: 'https://www.amazon.com.br/Echo-Dot-5a-Geracao/dp/B0ABC12345/ref=something?pd_rd_w=abc',
  })

  assert.deepEqual(result, {
    url: 'https://amzn.to/4sHAqQP',
    source: 'sitestripe_short_url',
    usedFallback: false,
    productUrl: 'https://www.amazon.com.br/dp/B0ABC12345',
  })
})

test('amazon affiliate provider prioritizes the short amzn.to link captured from SiteStripe', async () => {
  const logs = []
  const createLinkCalls = []
  const provider = createAmazonAffiliateProvider({
    tag: 'minhatag-20',
    linkFormat: 'short',
    createAssociatesLinkSession: async () => ({
      async createLink({ productUrl }) {
        createLinkCalls.push(productUrl)
        return {
          productUrl,
          shortUrl: 'https://amzn.to/4sHAqQP',
          fullUrl: `${productUrl}?tag=minhatag-20`,
          rawText: 'Link de texto para esta pagina https://amzn.to/4sHAqQP',
        }
      },
      async close() {},
    }),
    logger: {
      info(payload) {
        logs.push(payload)
      },
      warn(payload) {
        logs.push(payload)
      },
    },
  })

  const result = await provider.getAffiliateLink({
    id: 'B0ABC12345',
    permalink: 'https://www.amazon.com.br/dp/B0ABC12345',
  })

  assert.deepEqual(result, {
    url: 'https://amzn.to/4sHAqQP',
    source: 'sitestripe_short_url',
    usedFallback: false,
    productUrl: 'https://www.amazon.com.br/dp/B0ABC12345',
    rawText: 'Link de texto para esta pagina https://amzn.to/4sHAqQP',
  })
  assert.deepEqual(createLinkCalls, ['https://www.amazon.com.br/dp/B0ABC12345'])
  assert.equal(
    logs.some((payload) => payload.event === 'amazon_affiliate_link_generated'
      && payload.affiliateLink === 'https://amzn.to/4sHAqQP'
      && payload.source === 'sitestripe_short_url'),
    true,
  )
})

test('amazon affiliate provider rejects when SiteStripe fails instead of returning a direct link', async () => {
  const provider = createAmazonAffiliateProvider({
    tag: 'minhatag-20',
    createAssociatesLinkSession: async () => ({
      async createLink() {
        throw new Error('Amazon SiteStripe did not load on the product page.')
      },
      async close() {},
    }),
  })

  await assert.rejects(
    provider.getAffiliateLink({
      id: 'B0ABC12345',
      permalink: 'https://www.amazon.com.br/dp/B0ABC12345',
    }),
    /Amazon SiteStripe did not load on the product page/,
  )
})

test('amazon affiliate provider rejects when SiteStripe omits short link instead of returning a direct link', async () => {
  const provider = createAmazonAffiliateProvider({
    tag: 'minhatag-20',
    createAssociatesLinkSession: async () => ({
      async createLink({ productUrl }) {
        return {
          productUrl,
          fullUrl: `${productUrl}?tag=minhatag-20&linkCode=ll1`,
        }
      },
      async close() {},
    }),
  })

  await assert.rejects(
    provider.getAffiliateLink({
      id: 'B0ABC12345',
      permalink: 'https://www.amazon.com.br/dp/B0ABC12345?th=1&psc=1',
    }),
    /Amazon SiteStripe did not return a short amzn.to link/,
  )
})

test('amazon affiliate provider reuses one SiteStripe session and closes it', async () => {
  let createdSessions = 0
  let closedSessions = 0
  const provider = createAmazonAffiliateProvider({
    tag: 'minhatag-20',
    createAssociatesLinkSession: async () => {
      createdSessions += 1
      return {
        async createLink({ productUrl }) {
          return {
            productUrl,
            shortUrl: `https://amzn.to/${productUrl.endsWith('B0ABC12345') ? '4sHAqQP' : '4sHAqQR'}`,
          }
        },
        async close() {
          closedSessions += 1
        },
      }
    },
  })

  const first = await provider.getAffiliateLink({
    id: 'B0ABC12345',
    permalink: 'https://www.amazon.com.br/dp/B0ABC12345',
  })
  const second = await provider.getAffiliateLink({
    id: 'B0ABC12346',
    permalink: 'https://www.amazon.com.br/dp/B0ABC12346',
  })
  await provider.close()

  assert.equal(first.url, 'https://amzn.to/4sHAqQP')
  assert.equal(second.url, 'https://amzn.to/4sHAqQR')
  assert.equal(createdSessions, 1)
  assert.equal(closedSessions, 1)
})

test('amazon associates link session uses storage state context instead of persistent profile when storage state exists', async () => {
  const calls = []
  const session = await createAmazonAssociatesLinkSession({
    storageStatePath: 'sessions/amazon-storage-state.json',
    userDataDir: './sessions/amazon-profile',
    playwrightModule: {
      chromium: {
        async launchPersistentContext() {
          throw new Error('should not open persistent profile when storage state exists')
        },
        async launch(options) {
          calls.push({ type: 'launch', options })
          return {
            async newContext(options) {
              calls.push({ type: 'newContext', options })
              return {
                pages() {
                  return [{
                    setDefaultTimeout() {},
                    async goto() {},
                    async waitForLoadState() {},
                    async waitForTimeout() {},
                    locator() {
                      return { async count() { return 1 }, first() { return this }, filter() { return this }, async click() {}, async waitFor() {} }
                    },
                    getByText() {
                      return { async count() { return 1 }, first() { return this }, async click() {}, async waitFor() {} }
                    },
                    getByRole() {
                      return { async count() { return 1 }, first() { return this }, async click() {}, async waitFor() {} }
                    },
                    async evaluate() {
                      return ['Link de texto para esta pagina https://amzn.to/4sHAqQP']
                    },
                  }]
                },
                async storageState() {},
                async close() {},
              }
            },
            async close() {},
          }
        },
      },
    },
  })

  const result = await session.createLink({ productUrl: 'https://www.amazon.com.br/dp/B0ABC12345' })
  await session.close()

  assert.equal(result.shortUrl, 'https://amzn.to/4sHAqQP')
  assert.equal(calls[1].type, 'newContext')
  assert.deepEqual(calls[1].options, { storageState: 'sessions/amazon-storage-state.json' })
})

test('amazon associates link session requires the SiteStripe get link button before reading a short link', async () => {
  const makeLocator = ({ count = 0, click = true, wait = true } = {}) => ({
    async count() {
      return count
    },
    first() {
      return this
    },
    filter() {
      return this
    },
    async click() {
      if (!click) {
        throw new Error('not clickable')
      }
    },
    async waitFor() {
      if (!wait) {
        throw new Error('not visible')
      }
    },
  })
  const genericTextLocator = makeLocator({ count: 1 })
  const missingLocator = makeLocator({ count: 0, wait: false })

  const session = await createAmazonAssociatesLinkSession({
    storageStatePath: '',
    userDataDir: '',
    playwrightModule: {
      chromium: {
        async launch() {
          return {
            async newContext() {
              return {
                pages() {
                  return [{
                    setDefaultTimeout() {},
                    async goto() {},
                    async waitForLoadState() {},
                    locator(selector) {
                      if (selector === '#amzn-ss-get-link-button') {
                        return missingLocator
                      }
                      if (selector === '#amzn-ss-text-link, #amzn-ss-get-link-button, [id*="amzn-ss"]') {
                        return genericTextLocator
                      }
                      return missingLocator
                    },
                    getByText(pattern) {
                      if (pattern.test('Link de texto')) {
                        return genericTextLocator
                      }
                      return missingLocator
                    },
                    getByRole() {
                      return missingLocator
                    },
                    async evaluate() {
                      return ['Texto solto na pagina https://amzn.to/4sHAqQP']
                    },
                  }]
                },
                async storageState() {},
                async close() {},
              }
            },
            async close() {},
          }
        },
      },
    },
  })

  await assert.rejects(
    session.createLink({ productUrl: 'https://www.amazon.com.br/dp/B0ABC12345' }),
    /Amazon SiteStripe did not load on the product page/,
  )
  await session.close()
})

test('extractAssociatesLinksFromTexts does not include adjacent UI labels in amzn.to short links', () => {
  const result = extractAssociatesLinksFromTexts([
    'Link de texto criado abaixo. https://amzn.to/4tePl63Link type selection Link curto Link completo',
  ])

  assert.equal(result.shortUrl, 'https://amzn.to/4tePl63')
  assert.equal(result.rawText.includes('Link de texto'), true)
})

test('amazon affiliate provider ignores template and uses SiteStripe first', async () => {
  const provider = createAmazonAffiliateProvider({
    tag: 'minhatag-20',
    templateUrl: 'https://amzn.to/link?u={{url}}&asin={{asin}}&tag={{tag}}',
    createAssociatesLinkSession: async () => ({
      async createLink() {
        return {
          shortUrl: 'https://amzn.to/4sHAqQP',
        }
      },
      async close() {},
    }),
  })

  const result = await provider.getAffiliateLink({
    id: 'B0ABC123',
    permalink: 'https://www.amazon.com.br/dp/B0ABC123',
  })

  assert.equal(result.url, 'https://amzn.to/4sHAqQP')
  assert.equal(result.usedFallback, false)
})

test('amazon affiliate provider rejects when SiteStripe is unavailable and tag is missing', async () => {
  const provider = createAmazonAffiliateProvider({
    tag: '',
    templateUrl: 'https://amzn.to/link?u={{url}}',
    createAssociatesLinkSession: async () => ({
      async createLink() {
        throw new Error('Amazon Associates text link popup did not open.')
      },
      async close() {},
    }),
  })

  await assert.rejects(
    provider.getAffiliateLink({
      id: 'B0ABC123',
      permalink: 'https://www.amazon.com.br/dp/B0ABC123?ref_=abc',
    }),
    /Amazon Associates text link popup did not open/,
  )
})

test('extractAssociatesLinksFromTexts captures short link from popup field before full link', () => {
  const result = extractAssociatesLinksFromTexts([
    'Link completo https://www.amazon.com.br/dp/B0ABC12345?tag=minhatag-20&linkCode=ll1',
    'Link curto https://amzn.to/abc12XYZ90 Link completo',
  ])

  assert.equal(result.shortUrl, 'https://amzn.to/abc12XYZ90')
  assert.equal(result.fullUrl, 'https://www.amazon.com.br/dp/B0ABC12345?tag=minhatag-20&linkCode=ll1')
})
