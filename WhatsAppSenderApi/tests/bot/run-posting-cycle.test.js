import test from 'node:test'
import assert from 'node:assert/strict'

import { createBotRunner } from '../../src/bot/create-bot-runner.js'
import {
  buildPostingBatchItemKey,
  createPostingBatchSelector,
} from '../../src/bot/select-posting-batch.js'

function createRepositoryDouble(publishedIds = []) {
  const published = new Set(publishedIds)
  const sentItems = []
  const failures = []
  const executions = []

  return {
    sentItems,
    failures,
    executions,
    async createExecution(data) {
      const execution = { id: `exec-${executions.length + 1}`, ...data }
      executions.push(execution)
      return execution
    },
    async finishExecution(id, data) {
      const execution = executions.find((item) => item.id === id)
      Object.assign(execution, data)
    },
    async hasPublishedItem(item) {
      return published.has(typeof item === 'string' ? item : buildPostingBatchItemKey(item))
    },
    async markOfferPublished(data) {
      published.add(data.itemId)
      sentItems.push(data)
    },
    async recordOfferFailure(data) {
      failures.push(data)
    },
  }
}

function createDeterministicBatchSelector() {
  return createPostingBatchSelector({
    randomInt: (max) => max - 1,
  })
}

function createNeverResolvingPromise() {
  return new Promise(() => {})
}

function createAffiliateLinkResult(url, overrides = {}) {
  return {
    url,
    source: 'affiliate',
    usedFallback: false,
    ...overrides,
  }
}

test('runOnce sends up to 5 non-duplicated offers and stores sent items', async () => {
  const repository = createRepositoryDouble(['id:mlb-2'])
  const sentMessages = []

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 5,
      filters: ['notebook gamer'],
    },
    catalogProvider: {
      async search() {
        return [
          { id: 'MLB-1', title: 'Produto 1', price: 10, permalink: 'https://example.com/1' },
          { id: 'MLB-2', title: 'Produto 2', price: 20, permalink: 'https://example.com/2' },
          { id: 'MLB-3', title: 'Produto 3', price: 30, permalink: 'https://example.com/3' },
          { id: 'MLB-4', title: 'Produto 4', price: 40, permalink: 'https://example.com/4' },
          { id: 'MLB-5', title: 'Produto 5', price: 50, permalink: 'https://example.com/5' },
          { id: 'MLB-6', title: 'Produto 6', price: 60, permalink: 'https://example.com/6' },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage(payload) {
        sentMessages.push(payload)
      },
    },
    repository,
    logger: { error() {} },
    batchSelector: createDeterministicBatchSelector(),
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 5)
  assert.equal(result.skippedDuplicates, 1)
  assert.equal(sentMessages.length, 5)
  assert.deepEqual(repository.sentItems.map((item) => item.itemId), ['id:mlb-1', 'id:mlb-3', 'id:mlb-4', 'id:mlb-5', 'id:mlb-6'])
  assert.equal(repository.failures.length, 0)
})

test('runOnce skips items whose affiliate link generation fails and continues sending the batch', async () => {
  const repository = createRepositoryDouble()
  const sentMessages = []

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 2,
      filters: ['cafeteira'],
    },
    catalogProvider: {
      async search() {
        return [
          { id: 'MLB-1', title: 'Produto 1', price: 10, permalink: 'https://example.com/1' },
          { id: 'MLB-2', title: 'Produto 2', price: 20, permalink: 'https://example.com/2' },
          { id: 'MLB-3', title: 'Produto 3', price: 30, permalink: 'https://example.com/3' },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        if (item.id === 'MLB-2') {
          throw new Error('Affiliate unavailable')
        }

        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage(payload) {
        sentMessages.push(payload)
      },
    },
    repository,
    logger: { error() {} },
    batchSelector: createDeterministicBatchSelector(),
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 1)
  assert.equal(repository.failures.length, 1)
  assert.equal(repository.failures[0].itemId, 'id:mlb-2')
  assert.deepEqual(repository.sentItems.map((item) => item.itemId), ['id:mlb-1'])
  assert.equal(sentMessages.length, 1)
})

test('runOnce does not allow overlapping executions', async () => {
  const repository = createRepositoryDouble()
  let releaseCatalog

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 1,
      filters: ['monitor'],
    },
    catalogProvider: {
      async search() {
        await new Promise((resolve) => {
          releaseCatalog = resolve
        })

        return [
          { id: 'MLB-1', title: 'Produto 1', price: 10, permalink: 'https://example.com/1' },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage() {},
    },
    repository,
    logger: { error() {} },
    batchSelector: createDeterministicBatchSelector(),
  })

  const firstRun = runner.runOnce()
  const secondRun = await runner.runOnce()

  assert.equal(secondRun.skipped, true)
  assert.equal(secondRun.reason, 'already_running')

  releaseCatalog()
  await firstRun
})

test('runOnce asks the catalog provider for enough unpublished items to fill the batch', async () => {
  const repository = createRepositoryDouble(['id:mlb-1'])
  let receivedSearchOptions = null

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 3,
      filters: ['monitor'],
    },
    catalogProvider: {
      async search(filters, options) {
        receivedSearchOptions = { filters, options }

        return [
          { id: 'MLB-2', title: 'Produto 2', price: 20, permalink: 'https://example.com/2' },
          { id: 'MLB-3', title: 'Produto 3', price: 30, permalink: 'https://example.com/3' },
          { id: 'MLB-4', title: 'Produto 4', price: 40, permalink: 'https://example.com/4' },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage() {},
    },
    repository,
    logger: { error() {} },
    batchSelector: createDeterministicBatchSelector(),
  })

  await runner.runOnce()

  assert.deepEqual(receivedSearchOptions.filters, ['monitor'])
  assert.equal(receivedSearchOptions.options.targetItemCount, 3)
})

test('runOnce gives the catalog provider the same history check used by the final batch selector', async () => {
  const repository = createRepositoryDouble(['id:mlb-1'])
  let receivedSearchOptions = null

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 1,
      filters: ['monitor'],
    },
    catalogProvider: {
      async search(filters, options) {
        receivedSearchOptions = options
        assert.equal(await options.isRecentlyPublished({
          id: 'MLB-1',
          title: 'Produto publicado',
          permalink: 'https://example.com/1',
        }), true)
        assert.equal(await options.isRecentlyPublished({
          id: 'MLB-2',
          title: 'Produto novo',
          permalink: 'https://example.com/2',
        }), false)

        return [
          { id: 'MLB-2', title: 'Produto novo', price: 20, permalink: 'https://example.com/2' },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage() {},
    },
    repository,
    logger: { error() {} },
    batchSelector: createDeterministicBatchSelector(),
  })

  const result = await runner.runOnce()

  assert.equal(typeof receivedSearchOptions.isRecentlyPublished, 'function')
  assert.equal(result.sentCount, 1)
  assert.deepEqual(repository.sentItems.map((item) => item.itemId), ['id:mlb-2'])
})

test('runOnce blocks already published products by normalized title even when the id changes', async () => {
  const sentMessages = []
  const publishedTitle = 'Fritadeira Sem Óleo Air Fryer 3,5L Mondial'
  const repository = {
    sentItems: [],
    failures: [],
    executions: [],
    async createExecution(data) {
      const execution = { id: 'exec-1', ...data }
      this.executions.push(execution)
      return execution
    },
    async finishExecution(id, data) {
      Object.assign(this.executions.find((item) => item.id === id), data)
    },
    async hasPublishedItem(item) {
      return typeof item === 'object' && item?.title?.toLowerCase() === publishedTitle.toLowerCase()
    },
    async markOfferPublished(data) {
      this.sentItems.push(data)
    },
    async recordOfferFailure(data) {
      this.failures.push(data)
    },
  }

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 1,
      filters: ['air fryer'],
    },
    catalogProvider: {
      async search(filters, options) {
        assert.equal(await options.isRecentlyPublished({
          id: 'MLB-NEW-ID',
          title: publishedTitle,
          permalink: 'https://example.com/new-air-fryer',
        }), true)

        return [
          { id: 'MLB-NEW-ID', title: publishedTitle, price: 199, permalink: 'https://example.com/new-air-fryer', sourceFilter: 'air fryer' },
          { id: 'MLB-FRESH', title: 'Liquidificador Oferta', price: 89, permalink: 'https://example.com/liquidificador', sourceFilter: 'air fryer' },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage(payload) {
        sentMessages.push(payload)
      },
    },
    repository,
    logger: { error() {} },
    batchSelector: createDeterministicBatchSelector(),
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 1)
  assert.deepEqual(repository.sentItems.map((item) => item.itemId), ['id:mlb-fresh'])
  assert.equal(sentMessages.length, 1)
})

test('runOnce blocks already published products by normalized permalink', async () => {
  const repository = {
    sentItems: [],
    failures: [],
    executions: [],
    async createExecution(data) {
      const execution = { id: 'exec-1', ...data }
      this.executions.push(execution)
      return execution
    },
    async finishExecution(id, data) {
      Object.assign(this.executions.find((item) => item.id === id), data)
    },
    async hasPublishedItem(item) {
      return typeof item === 'object' && item?.permalink === 'https://example.com/produto?utm=bot#reviews'
    },
    async markOfferPublished(data) {
      this.sentItems.push(data)
    },
    async recordOfferFailure(data) {
      this.failures.push(data)
    },
  }

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 1,
      filters: ['monitor'],
    },
    catalogProvider: {
      async search() {
        return [
          { id: 'MLB-CHANGED', title: 'Monitor Mesmo Link', price: 499, permalink: 'https://example.com/produto?utm=bot#reviews', sourceFilter: 'monitor' },
          { id: 'MLB-FRESH', title: 'Monitor Novo', price: 599, permalink: 'https://example.com/monitor-novo', sourceFilter: 'monitor' },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage() {},
    },
    repository,
    logger: { error() {} },
    batchSelector: createDeterministicBatchSelector(),
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 1)
  assert.deepEqual(repository.sentItems.map((item) => item.itemId), ['id:mlb-fresh'])
})

test('runOnce alternates source filters before sending when the catalog has variety', async () => {
  const repository = createRepositoryDouble()
  const sentMessages = []

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 5,
      filters: ['air fryer', 'creatina', 'echo dot'],
    },
    catalogProvider: {
      async search() {
        return [
          { id: 'MLB-1', title: 'Air 1', price: 10, permalink: 'https://example.com/1', sourceFilter: 'air fryer' },
          { id: 'MLB-2', title: 'Air 2', price: 20, permalink: 'https://example.com/2', sourceFilter: 'air fryer' },
          { id: 'MLB-3', title: 'Echo 1', price: 30, permalink: 'https://example.com/3', sourceFilter: 'echo dot' },
          { id: 'MLB-4', title: 'Creatina 1', price: 40, permalink: 'https://example.com/4', sourceFilter: 'creatina' },
          { id: 'MLB-5', title: 'Echo 2', price: 50, permalink: 'https://example.com/5', sourceFilter: 'echo dot' },
          { id: 'MLB-6', title: 'Creatina 2', price: 60, permalink: 'https://example.com/6', sourceFilter: 'creatina' },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage(payload) {
        sentMessages.push(payload)
      },
    },
    repository,
    logger: { error() {} },
    batchSelector: createDeterministicBatchSelector(),
  })

  await runner.runOnce()

  assert.deepEqual(repository.sentItems.map((item) => item.itemId), ['id:mlb-1', 'id:mlb-4', 'id:mlb-3', 'id:mlb-2', 'id:mlb-6'])
  assert.deepEqual(repository.sentItems.map((item) => item.title), ['Air 1', 'Creatina 1', 'Echo 1', 'Air 2', 'Creatina 2'])
})

test('runOnce rotates the filter window between consecutive runs so the same first categories do not repeat', async () => {
  const repository = createRepositoryDouble()
  const searchFilterOrders = []

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 3,
      filters: ['alexa', 'ar condicionado', 'aspirador robo', 'creatina', 'echo dot', 'iphone'],
    },
    catalogProvider: {
      async search(filters) {
        searchFilterOrders.push(filters)

        return filters.map((filter, index) => ({
          id: `MLB-${filter.replace(/\s+/g, '-')}`,
          title: `Produto ${filter}`,
          price: 10 + index,
          permalink: `https://example.com/${filter.replace(/\s+/g, '-')}`,
          sourceFilter: filter,
        }))
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage() {},
    },
    repository,
    logger: { error() {} },
    batchSelector: createDeterministicBatchSelector(),
  })

  await runner.runOnce()
  await runner.runOnce()

  assert.deepEqual(searchFilterOrders[0].slice(0, 3), ['alexa', 'ar condicionado', 'aspirador robo'])
  assert.deepEqual(searchFilterOrders[1].slice(0, 3), ['creatina', 'echo dot', 'iphone'])
})

test('runOnce does not repeat the same first filter on consecutive runs when posts per run covers every filter', async () => {
  const repository = createRepositoryDouble()
  const searchFilterOrders = []

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 3,
      filters: ['eletronico', 'casa', 'gamer'],
    },
    catalogProvider: {
      async search(filters) {
        searchFilterOrders.push(filters)

        return filters.map((filter, index) => ({
          id: `AMZ-${searchFilterOrders.length}-${index}`,
          platform: 'amazon',
          title: `Produto ${filter} ${searchFilterOrders.length}`,
          price: 10 + index,
          permalink: `https://example.com/${searchFilterOrders.length}-${index}`,
          sourceFilter: filter,
        }))
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage() {},
    },
    repository,
    logger: { error() {} },
    selectionOptions: {
      preserveSourceOrder: true,
      maxItemsPerSourceFilter: 1,
    },
  })

  await runner.runOnce()
  await runner.runOnce()

  assert.equal(searchFilterOrders[0][0], 'eletronico')
  assert.notEqual(searchFilterOrders[1][0], 'eletronico')
})

test('runOnce performs a fallback search with another term when only one valid item is selected', async () => {
  const repository = createRepositoryDouble()
  const searchFilterOrders = []

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 2,
      filters: ['eletronico', 'casa', 'gamer'],
    },
    catalogProvider: {
      async search(filters) {
        searchFilterOrders.push(filters)

        if (searchFilterOrders.length === 1) {
          return [
            {
              id: 'B0ONLY',
              platform: 'amazon',
              title: 'Echo Dot',
              price: 199,
              permalink: 'https://example.com/echo',
              sourceFilter: 'eletronico',
            },
          ]
        }

        return [
          {
            id: 'B0CASA',
            platform: 'amazon',
            title: 'Air Fryer',
            price: 299,
            permalink: 'https://example.com/air-fryer',
            sourceFilter: 'casa',
          },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage() {},
    },
    repository,
    logger: { error() {} },
    selectionOptions: {
      preserveSourceOrder: true,
      maxItemsPerSourceFilter: 1,
      forceFallbackSearchWhenSingleValidItem: true,
    },
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 2)
  assert.equal(searchFilterOrders.length, 2)
  assert.notEqual(searchFilterOrders[1][0], 'eletronico')
  assert.deepEqual(repository.sentItems.map((item) => item.itemId), ['id:amazon:b0only', 'id:amazon:b0casa'])
})

test('runOnce sends a single image message with the final caption when an offer image is available', async () => {
  const repository = createRepositoryDouble()
  const sentMessages = []

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 1,
      filters: ['air fryer'],
    },
    catalogProvider: {
      async search() {
        return [
          {
            id: 'MLB-1',
            title: 'Produto 1',
            price: 10,
            coupon: 'TESTE10',
            permalink: 'https://example.com/1',
            thumbnailUrl: 'https://example.com/1.jpg',
          },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    offerImageBuilder: {
      async build(item, affiliateLink) {
        return {
          imageBase64: Buffer.from(`image:${item.id}`).toString('base64'),
          caption: [
            '🔥 PROMOÇÃO',
            `📦 ${item.title}`,
            '💰 R$ 10,00',
            '',
            `🎟️ CUPOM: ${item.coupon}`,
            '',
            '👉 LINK:',
            affiliateLink,
          ].join('\n'),
        }
      },
    },
    whatsappClient: {
      async sendImageMessage(payload) {
        sentMessages.push({ type: 'image', payload })
      },
      async sendTextMessage(payload) {
        sentMessages.push({ type: 'text', payload })
      },
    },
    repository,
    logger: { error() {} },
    batchSelector: createDeterministicBatchSelector(),
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 1)
  assert.equal(sentMessages.length, 1)
  assert.deepEqual(sentMessages, [
    {
      type: 'image',
      payload: {
        sessionId: 'sales-session',
        to: '120363400000000000@g.us',
        caption: [
          '🔥 PROMOÇÃO',
          '📦 Produto 1',
          '💰 R$ 10,00',
          '',
          '🎟️ CUPOM: TESTE10',
          '',
          '👉 LINK:',
          'https://example.com/1?aff=1',
        ].join('\n'),
        imageBase64: Buffer.from('image:MLB-1').toString('base64'),
      },
    },
  ])
})

test('runOnce builds a closed varied batch from the aggregated pool and logs selection metrics', async () => {
  const repository = createRepositoryDouble(['id:mlb-history'])
  const sentMessages = []
  const infoLogs = []
  const selectedReferences = []

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 3,
      filters: ['air fryer', 'creatina', 'echo dot'],
    },
    catalogProvider: {
      async search() {
        return {
          termsProcessed: 3,
          rawItemsFound: 6,
          items: [
            { id: 'MLB-1', title: 'Air Fryer', price: 10, permalink: 'https://example.com/1?utm=abc', sourceFilter: 'air fryer' },
            { id: 'MLB-1', title: 'Air Fryer', price: 10, permalink: 'https://example.com/1?utm=xyz', sourceFilter: 'creatina' },
            { id: 'MLB-history', title: 'Creatina', price: 20, permalink: 'https://example.com/2', sourceFilter: 'creatina' },
            { id: 'MLB-3', title: 'Echo Dot', price: 30, permalink: 'https://example.com/3', sourceFilter: 'echo dot' },
            { id: 'MLB-4', title: 'Echo Dot', price: 30, permalink: 'https://example.com/4', sourceFilter: 'air fryer' },
            { id: 'MLB-5', title: 'Mouse Gamer', price: 40, permalink: 'https://example.com/5', sourceFilter: 'echo dot' },
          ],
        }
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        selectedReferences.push(item)
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage(payload) {
        sentMessages.push(payload)
      },
    },
    repository,
    logger: {
      info(payload) {
        infoLogs.push(payload)
      },
      error() {},
    },
    batchSelector: createDeterministicBatchSelector(),
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 3)
  assert.equal(result.skippedDuplicates, 1)
  assert.deepEqual(repository.sentItems.map((item) => item.itemId), ['id:mlb-1', 'id:mlb-3', 'id:mlb-5'])
  assert.equal(new Set(selectedReferences).size, 3)
  assert.equal(Object.isFrozen(selectedReferences[0]), true)
  const batchLogs = infoLogs.filter((payload) => payload.event.startsWith('bot_posting_batch_'))
  const affiliateLogs = infoLogs.filter((payload) => payload.event === 'affiliate_link_generated')
  assert.deepEqual(batchLogs[0], {
    event: 'bot_posting_batch_built',
    executionId: 'exec-1',
    termsProcessed: 3,
    rawItemsFound: 6,
    duplicatesRemoved: 2,
    historyBlocked: 1,
    selectedCount: 3,
  })
  assert.deepEqual(batchLogs[1], {
    event: 'bot_posting_batch_selected',
    executionId: 'exec-1',
    items: [
      { itemId: 'id:mlb-1', title: 'Air Fryer', sourceFilter: 'air fryer' },
      { itemId: 'id:mlb-3', title: 'Echo Dot', sourceFilter: 'echo dot' },
      { itemId: 'id:mlb-5', title: 'Mouse Gamer', sourceFilter: 'echo dot' },
    ],
  })
  assert.deepEqual(affiliateLogs, [
    {
      event: 'affiliate_link_generated',
      executionId: 'exec-1',
      itemId: 'id:mlb-1',
      source: 'affiliate',
      usedFallback: false,
    },
    {
      event: 'affiliate_link_generated',
      executionId: 'exec-1',
      itemId: 'id:mlb-3',
      source: 'affiliate',
      usedFallback: false,
    },
    {
      event: 'affiliate_link_generated',
      executionId: 'exec-1',
      itemId: 'id:mlb-5',
      source: 'affiliate',
      usedFallback: false,
    },
  ])
})

test('runOnce fails the execution when catalog search exceeds the configured timeout', async () => {
  const repository = createRepositoryDouble()

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 1,
      filters: ['air fryer'],
      catalogSearchTimeoutMs: 10,
    },
    catalogProvider: {
      async search() {
        return createNeverResolvingPromise()
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage() {},
    },
    repository,
    logger: { error() {} },
    batchSelector: createDeterministicBatchSelector(),
  })

  await assert.rejects(() => runner.runOnce(), /catalog search timed out/i)
  assert.equal(repository.executions[0].status, 'failed')
  assert.match(repository.executions[0].errorMessage, /catalog search timed out/i)
  assert.ok(repository.executions[0].finishedAt instanceof Date)
})

test('runOnce records a timed out item failure and continues with the next item', async () => {
  const repository = createRepositoryDouble()
  const sentMessages = []

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 2,
      filters: ['cafeteira'],
      offerProcessingTimeoutMs: 10,
    },
    catalogProvider: {
      async search() {
        return [
          { id: 'MLB-1', title: 'Produto 1', price: 10, permalink: 'https://example.com/1' },
          { id: 'MLB-2', title: 'Produto 2', price: 20, permalink: 'https://example.com/2' },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        if (item.id === 'MLB-1') {
          return createNeverResolvingPromise()
        }

        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage(payload) {
        sentMessages.push(payload)
      },
    },
    repository,
    logger: { error() {} },
    batchSelector: createDeterministicBatchSelector(),
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 1)
  assert.equal(repository.failures.length, 1)
  assert.equal(repository.failures[0].itemId, 'id:mlb-1')
  assert.match(repository.failures[0].reason, /bot offer processing .* timed out/i)
  assert.deepEqual(repository.sentItems.map((item) => item.itemId), ['id:mlb-2'])
  assert.equal(sentMessages.length, 1)
})

test('runOnce logs WhatsApp send request and confirmation with the returned message id', async () => {
  const repository = createRepositoryDouble()
  const infoLogs = []

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 1,
      filters: ['cafeteira'],
    },
    catalogProvider: {
      async search() {
        return [
          { id: 'MLB-1', title: 'Produto 1', price: 10, permalink: 'https://example.com/1' },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage() {
        return { success: true, messageId: 'message-1' }
      },
    },
    repository,
    logger: {
      info(payload) {
        infoLogs.push(payload)
      },
      error() {},
    },
    batchSelector: createDeterministicBatchSelector(),
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 1)
  assert.equal(repository.sentItems.length, 1)
  const sendRequestLog = infoLogs.find((payload) => payload.event === 'bot_whatsapp_send_requested')
  assert.ok(sendRequestLog)
  assert.equal(sendRequestLog.executionId, 'exec-1')
  assert.equal(sendRequestLog.itemId, 'id:mlb-1')
  assert.equal(sendRequestLog.sessionId, 'sales-session')
  assert.equal(sendRequestLog.groupJid, '120363400000000000@g.us')
  assert.equal(sendRequestLog.type, 'text')
  assert.equal(sendRequestLog.hasLinkPreview, false)
  assert.equal(sendRequestLog.bodyLength > 0, true)
  assert.deepEqual(infoLogs.filter((payload) => payload.event === 'bot_whatsapp_send_confirmed'), [
    {
      event: 'bot_whatsapp_send_confirmed',
      executionId: 'exec-1',
      itemId: 'id:mlb-1',
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      type: 'text',
      messageId: 'message-1',
    },
  ])
})

test('runOnce records a failure instead of publishing when WhatsApp send is not confirmed', async () => {
  const repository = createRepositoryDouble()
  const errorLogs = []

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 1,
      filters: ['cafeteira'],
    },
    catalogProvider: {
      async search() {
        return [
          { id: 'MLB-1', title: 'Produto 1', price: 10, permalink: 'https://example.com/1' },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(`${item.permalink}?aff=1`)
      },
    },
    whatsappClient: {
      async sendTextMessage() {
        throw new Error('WhatsApp API returned success without a message id')
      },
    },
    repository,
    logger: {
      error(payload) {
        errorLogs.push(payload)
      },
    },
    batchSelector: createDeterministicBatchSelector(),
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 0)
  assert.equal(repository.sentItems.length, 0)
  assert.equal(repository.failures.length, 1)
  assert.equal(repository.failures[0].itemId, 'id:mlb-1')
  assert.match(repository.failures[0].reason, /without a message id/i)
  assert.equal(errorLogs.some((payload) => payload.event === 'bot_whatsapp_send_failed'), true)
})

test('runOnce posts with the permalink fallback when affiliate authentication expires and logs the fallback', async () => {
  const repository = createRepositoryDouble()
  const sentMessages = []
  const infoLogs = []

  const runner = createBotRunner({
    config: {
      sessionId: 'sales-session',
      groupJid: '120363400000000000@g.us',
      postsPerRun: 1,
      filters: ['air fryer'],
    },
    catalogProvider: {
      async search() {
        return [
          { id: 'MLB-1', title: 'Produto 1', price: 10, permalink: 'https://example.com/1' },
        ]
      },
    },
    affiliateProvider: {
      async getAffiliateLink(item) {
        return createAffiliateLinkResult(item.permalink, {
          source: 'permalink',
          usedFallback: true,
          fallbackReason: 'affiliate_reauth_required',
        })
      },
    },
    whatsappClient: {
      async sendTextMessage(payload) {
        sentMessages.push(payload)
      },
    },
    repository,
    logger: {
      info(payload) {
        infoLogs.push(payload)
      },
      error() {},
    },
    batchSelector: createDeterministicBatchSelector(),
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 1)
  assert.equal(sentMessages.length, 1)
  assert.equal(sentMessages[0].body.includes('https://example.com/1'), true)
  assert.equal(repository.sentItems[0].affiliateLink, 'https://example.com/1')
  assert.deepEqual(infoLogs.find((payload) => payload.event === 'affiliate_link_fallback_used'), {
    event: 'affiliate_link_fallback_used',
    executionId: 'exec-1',
    itemId: 'id:mlb-1',
    source: 'permalink',
    fallbackReason: 'affiliate_reauth_required',
  })
  assert.deepEqual(infoLogs.find((payload) => payload.event === 'affiliate_link_generated'), {
    event: 'affiliate_link_generated',
    executionId: 'exec-1',
    itemId: 'id:mlb-1',
    source: 'permalink',
    usedFallback: true,
  })
})
