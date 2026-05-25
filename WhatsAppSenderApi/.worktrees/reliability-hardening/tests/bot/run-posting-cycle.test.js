import test from 'node:test'
import assert from 'node:assert/strict'

import { createBotRunner } from '../../src/bot/create-bot-runner.js'

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
    async hasPublishedItem(itemId) {
      return published.has(itemId)
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

test('runOnce sends up to 5 non-duplicated offers and stores sent items', async () => {
  const repository = createRepositoryDouble(['MLB-2'])
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
        return `${item.permalink}?aff=1`
      },
    },
    whatsappClient: {
      async sendTextMessage(payload) {
        sentMessages.push(payload)
      },
    },
    repository,
    logger: { error() {} },
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 5)
  assert.equal(result.skippedDuplicates, 1)
  assert.equal(sentMessages.length, 5)
  assert.deepEqual(repository.sentItems.map((item) => item.itemId), ['MLB-1', 'MLB-3', 'MLB-4', 'MLB-5', 'MLB-6'])
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

        return `${item.permalink}?aff=1`
      },
    },
    whatsappClient: {
      async sendTextMessage(payload) {
        sentMessages.push(payload)
      },
    },
    repository,
    logger: { error() {} },
  })

  const result = await runner.runOnce()

  assert.equal(result.sentCount, 2)
  assert.equal(repository.failures.length, 1)
  assert.equal(repository.failures[0].itemId, 'MLB-2')
  assert.deepEqual(repository.sentItems.map((item) => item.itemId), ['MLB-1', 'MLB-3'])
  assert.equal(sentMessages.length, 2)
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
        return `${item.permalink}?aff=1`
      },
    },
    whatsappClient: {
      async sendTextMessage() {},
    },
    repository,
    logger: { error() {} },
  })

  const firstRun = runner.runOnce()
  const secondRun = await runner.runOnce()

  assert.equal(secondRun.skipped, true)
  assert.equal(secondRun.reason, 'already_running')

  releaseCatalog()
  await firstRun
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
        return `${item.permalink}?aff=1`
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
