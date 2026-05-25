import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPostingBatchItemKey,
  createPostingBatchSelector,
} from '../../src/bot/select-posting-batch.js'

test('buildPostingBatchItemKey prefers normalized id before permalink and title', () => {
  assert.equal(buildPostingBatchItemKey({
    id: '  MLB-123  ',
    permalink: 'https://example.com/product?a=1#section',
    title: 'Produto legal',
  }), 'id:mlb-123')

  assert.equal(buildPostingBatchItemKey({
    permalink: 'https://example.com/product?a=1#section',
    title: 'Produto legal',
  }), 'url:https://example.com/product')

  assert.equal(buildPostingBatchItemKey({
    title: '  Produto    Legal  ',
  }), 'title:produto legal')
})

test('buildPostingBatchItemKey namespaces ids when a provider platform is present', () => {
  assert.equal(buildPostingBatchItemKey({
    platform: 'amazon',
    id: '  B0ABC123  ',
    permalink: 'https://www.amazon.com.br/dp/B0ABC123',
  }), 'id:amazon:b0abc123')
})

test('posting batch selector removes duplicates by id, permalink and normalized title before truncating', async () => {
  const selector = createPostingBatchSelector({
    randomInt: () => 0,
  })

  const result = await selector.select({
    filters: ['air fryer', 'creatina', 'echo dot'],
    postsPerRun: 4,
    items: [
      { id: 'MLB-1', title: 'Air Fryer 4L', permalink: 'https://example.com/p1?ref=abc', sourceFilter: 'air fryer' },
      { id: 'MLB-1', title: 'Air Fryer 4L', permalink: 'https://example.com/p1?ref=xyz', sourceFilter: 'creatina' },
      { id: 'MLB-2', title: 'Creatina 300g', permalink: 'https://example.com/p2#reviews', sourceFilter: 'creatina' },
      { id: 'MLB-3', title: 'Creatina 300g', permalink: 'https://example.com/p3', sourceFilter: 'echo dot' },
      { id: 'MLB-4', title: 'Echo Dot 5', permalink: 'https://example.com/p4', sourceFilter: 'echo dot' },
      { id: 'MLB-5', title: 'Fone Bluetooth', permalink: 'https://example.com/p4?utm=1', sourceFilter: 'air fryer' },
      { id: 'MLB-6', title: 'Mouse Gamer', permalink: 'https://example.com/p6', sourceFilter: 'air fryer' },
    ],
    isRecentlyPublished: async () => false,
  })

  assert.equal(result.termsProcessed, 3)
  assert.equal(result.rawItemsFound, 7)
  assert.equal(result.duplicatesRemoved, 3)
  assert.equal(result.historyBlocked, 0)
  assert.deepEqual(result.selectedItems.map((item) => item.id), ['MLB-6', 'MLB-2', 'MLB-4', 'MLB-1'])
})

test('posting batch selector blocks history matches and returns frozen cloned batch items', async () => {
  const selector = createPostingBatchSelector({
    randomInt: (max) => max - 1,
  })

  const sourceItems = [
    { id: 'MLB-1', title: 'Produto 1', permalink: 'https://example.com/1', sourceFilter: 'a' },
    { id: 'MLB-2', title: 'Produto 2', permalink: 'https://example.com/2', sourceFilter: 'b' },
    { id: 'MLB-3', title: 'Produto 3', permalink: 'https://example.com/3', sourceFilter: 'c' },
  ]

  const result = await selector.select({
    filters: ['a', 'b', 'c'],
    postsPerRun: 3,
    items: sourceItems,
    isRecentlyPublished: async (item) => item.id === 'MLB-2',
  })

  assert.equal(result.duplicatesRemoved, 0)
  assert.equal(result.historyBlocked, 1)
  assert.deepEqual(result.selectedItems.map((item) => item.id), ['MLB-1', 'MLB-3'])
  assert.notEqual(result.selectedItems[0], sourceItems[0])
  assert.equal(Object.isFrozen(result.selectedItems), true)
  assert.equal(Object.isFrozen(result.selectedItems[0]), true)
})

test('posting batch selector distributes the batch across different source filters before repeating one category', async () => {
  const selector = createPostingBatchSelector({
    randomInt: () => 0,
  })

  const result = await selector.select({
    filters: ['air fryer', 'alexa', 'furadeira', 'celular', 'cama'],
    postsPerRun: 5,
    items: [
      { id: 'MLB-1', title: 'Air Fryer 1', permalink: 'https://example.com/1', sourceFilter: 'air fryer' },
      { id: 'MLB-2', title: 'Air Fryer 2', permalink: 'https://example.com/2', sourceFilter: 'air fryer' },
      { id: 'MLB-3', title: 'Alexa 1', permalink: 'https://example.com/3', sourceFilter: 'alexa' },
      { id: 'MLB-4', title: 'Furadeira 1', permalink: 'https://example.com/4', sourceFilter: 'furadeira' },
      { id: 'MLB-5', title: 'Celular 1', permalink: 'https://example.com/5', sourceFilter: 'celular' },
      { id: 'MLB-6', title: 'Cama 1', permalink: 'https://example.com/6', sourceFilter: 'cama' },
      { id: 'MLB-7', title: 'Alexa 2', permalink: 'https://example.com/7', sourceFilter: 'alexa' },
    ],
    isRecentlyPublished: async () => false,
  })

  assert.deepEqual(result.selectedItems.map((item) => item.sourceFilter), [
    'air fryer',
    'alexa',
    'furadeira',
    'celular',
    'cama',
  ])
})

test('posting batch selector fills the remaining slots with repeated filters only after exhausting the unique ones', async () => {
  const selector = createPostingBatchSelector({
    randomInt: () => 0,
  })

  const result = await selector.select({
    filters: ['air fryer', 'alexa', 'furadeira'],
    postsPerRun: 5,
    items: [
      { id: 'MLB-1', title: 'Air Fryer 1', permalink: 'https://example.com/1', sourceFilter: 'air fryer' },
      { id: 'MLB-2', title: 'Air Fryer 2', permalink: 'https://example.com/2', sourceFilter: 'air fryer' },
      { id: 'MLB-3', title: 'Air Fryer 3', permalink: 'https://example.com/3', sourceFilter: 'air fryer' },
      { id: 'MLB-4', title: 'Alexa 1', permalink: 'https://example.com/4', sourceFilter: 'alexa' },
      { id: 'MLB-5', title: 'Furadeira 1', permalink: 'https://example.com/5', sourceFilter: 'furadeira' },
    ],
    isRecentlyPublished: async () => false,
  })

  assert.deepEqual(result.selectedItems.map((item) => item.sourceFilter), [
    'air fryer',
    'alexa',
    'furadeira',
    'air fryer',
    'air fryer',
  ])
})

test('posting batch selector preserves ranked order inside each source filter while varying filters', async () => {
  const selector = createPostingBatchSelector({
    randomInt: () => 0,
    preserveSourceOrder: true,
  })

  const result = await selector.select({
    filters: ['smart tv', 'mouse gamer'],
    postsPerRun: 4,
    items: [
      { id: 'MLB-tv-cheap', title: 'Smart TV oferta barata', price: 999, permalink: 'https://example.com/tv-cheap', sourceFilter: 'smart tv' },
      { id: 'MLB-tv-expensive', title: 'Smart TV cara', price: 5999, permalink: 'https://example.com/tv-expensive', sourceFilter: 'smart tv' },
      { id: 'MLB-mouse-cheap', title: 'Mouse oferta barata', price: 89, permalink: 'https://example.com/mouse-cheap', sourceFilter: 'mouse gamer' },
      { id: 'MLB-mouse-expensive', title: 'Mouse premium', price: 799, permalink: 'https://example.com/mouse-expensive', sourceFilter: 'mouse gamer' },
    ],
    isRecentlyPublished: async () => false,
  })

  assert.deepEqual(result.selectedItems.map((item) => item.id), [
    'MLB-tv-cheap',
    'MLB-mouse-cheap',
    'MLB-tv-expensive',
    'MLB-mouse-expensive',
  ])
})

test('posting batch selector limits selected items to one per source filter when configured', async () => {
  const selector = createPostingBatchSelector({
    randomInt: () => 0,
    preserveSourceOrder: true,
    maxItemsPerSourceFilter: 1,
  })

  const result = await selector.select({
    filters: ['eletronico', 'casa', 'gamer'],
    postsPerRun: 5,
    items: [
      { id: 'AMZ-1', title: 'Echo Dot', permalink: 'https://example.com/1', sourceFilter: 'eletronico' },
      { id: 'AMZ-2', title: 'Echo Show', permalink: 'https://example.com/2', sourceFilter: 'eletronico' },
      { id: 'AMZ-3', title: 'Air Fryer', permalink: 'https://example.com/3', sourceFilter: 'casa' },
      { id: 'AMZ-4', title: 'Panela', permalink: 'https://example.com/4', sourceFilter: 'casa' },
      { id: 'AMZ-5', title: 'Mouse Gamer', permalink: 'https://example.com/5', sourceFilter: 'gamer' },
    ],
    isRecentlyPublished: async () => false,
  })

  assert.deepEqual(result.selectedItems.map((item) => item.id), ['AMZ-1', 'AMZ-3', 'AMZ-5'])
})

test('posting batch selector blocks items matching recent memory by product id or title', async () => {
  const selector = createPostingBatchSelector({
    randomInt: () => 0,
    preserveSourceOrder: true,
    recentItemKeys: [
      'id:amazon:b0recent',
      'title:echo dot 5a geracao',
    ],
  })

  const result = await selector.select({
    filters: ['alexa', 'casa', 'gamer'],
    postsPerRun: 3,
    items: [
      { platform: 'amazon', id: 'B0RECENT', title: 'Produto diferente', permalink: 'https://example.com/recent', sourceFilter: 'alexa' },
      { platform: 'amazon', id: 'B0NEWID', title: 'Echo Dot 5a Geracao', permalink: 'https://example.com/title', sourceFilter: 'casa' },
      { platform: 'amazon', id: 'B0VALID', title: 'Mouse Gamer', permalink: 'https://example.com/valid', sourceFilter: 'gamer' },
    ],
    isRecentlyPublished: async () => false,
  })

  assert.equal(result.recentMemoryBlocked, 2)
  assert.deepEqual(result.selectedItems.map((item) => item.id), ['B0VALID'])
})
