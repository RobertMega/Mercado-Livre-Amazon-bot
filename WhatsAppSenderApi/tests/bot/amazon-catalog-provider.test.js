import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createAmazonCatalogProvider,
  extractAmazonCouponsFromTexts,
  scoreAmazonItem,
} from '../../src/bot/providers/amazon-catalog-provider.js'

test('amazon catalog provider shuffles terms and returns scored unique offer candidates', async () => {
  const searches = []
  const provider = createAmazonCatalogProvider({
    maxPagesPerFilter: 1,
    randomInt: () => 0,
    logger: { info() {}, warn() {} },
    createSearchSession: async () => ({
      async search(term) {
        searches.push(term)
        return [
          {
            id: 'B0LOW',
            title: 'Echo Dot 5',
            price: 249.9,
            originalPrice: 399.9,
            rating: 4.8,
            coupon: 'R$ 20 OFF',
            permalink: 'https://www.amazon.com.br/dp/B0LOW',
            sourceFilter: term,
          },
          {
            id: 'B0LOW',
            title: 'Echo Dot 5',
            price: 249.9,
            permalink: 'https://www.amazon.com.br/dp/B0LOW?ref_=abc',
            sourceFilter: term,
          },
          {
            id: 'B0FULL',
            title: 'Produto sem promocao',
            price: 999.9,
            originalPrice: null,
            rating: 3.5,
            permalink: 'https://www.amazon.com.br/dp/B0FULL',
            sourceFilter: term,
          },
        ]
      },
      async close() {},
    }),
  })

  const result = await provider.search(['alexa promocao', 'air fryer oferta'], {
    targetItemCount: 2,
    isRecentlyPublished: async (item) => item.id === 'B0FULL',
  })

  assert.deepEqual(searches, ['air fryer oferta', 'alexa promocao'])
  assert.equal(result.termsProcessed, 2)
  assert.equal(result.rawItemsFound, 6)
  assert.deepEqual(result.items.map((item) => item.id), ['B0LOW'])
  assert.equal(result.items[0].platform, 'amazon')
  assert.equal(result.items[0].discountPercent, 38)
})

test('amazon catalog provider can preserve the received search term order', async () => {
  const searches = []
  const provider = createAmazonCatalogProvider({
    maxPagesPerFilter: 1,
    preserveSearchTermOrder: true,
    randomInt: () => 0,
    logger: { info() {}, warn() {} },
    createSearchSession: async () => ({
      async search(term) {
        searches.push(term)
        return [
          {
            id: `B0-${term.replace(/\s+/g, '-')}`,
            title: `Produto ${term}`,
            price: 99,
            rating: 4.5,
            permalink: `https://www.amazon.com.br/dp/${term.replace(/\s+/g, '-')}`,
            sourceFilter: term,
          },
        ]
      },
      async close() {},
    }),
  })

  await provider.search(['eletronico', 'casa', 'gamer'], {
    targetItemCount: 3,
  })

  assert.deepEqual(searches, ['eletronico', 'casa', 'gamer'])
})

test('scoreAmazonItem prioritizes coupons, discounts, affordable price and rating', () => {
  const promoted = scoreAmazonItem({
    price: 199.9,
    originalPrice: 399.9,
    discountPercent: 50,
    rating: 4.7,
    coupon: 'R$ 30 OFF',
  })
  const regular = scoreAmazonItem({
    price: 1200,
    originalPrice: null,
    rating: 3.8,
  })

  assert.ok(promoted > regular)
})

test('scoreAmazonItem strongly penalizes expensive amazon items even when they have promotion signals', () => {
  const affordablePromoted = scoreAmazonItem({
    price: 299.9,
    originalPrice: 349.9,
    discountPercent: 14,
    rating: 4.1,
  })
  const expensivePromoted = scoreAmazonItem({
    price: 3999.9,
    originalPrice: 4999.9,
    discountPercent: 40,
    rating: 4.8,
    coupon: 'R$ 50 OFF',
  })

  assert.ok(affordablePromoted > expensivePromoted)
})

test('amazon catalog provider discards expensive amazon items before returning offer candidates', async () => {
  const provider = createAmazonCatalogProvider({
    maxPagesPerFilter: 1,
    logger: { info() {}, warn() {} },
    createSearchSession: async () => ({
      async search(term) {
        return [
          {
            id: 'B0EXPENSIVE',
            title: 'Notebook caro com cupom',
            price: 2499.9,
            originalPrice: 3999.9,
            discountPercent: 38,
            rating: 4.8,
            coupon: 'R$ 300 OFF',
            permalink: 'https://www.amazon.com.br/dp/B0EXPENSIVE',
            sourceFilter: term,
          },
          {
            id: 'B0AFFORDABLE',
            title: 'Whey protein promocao',
            price: 129.9,
            originalPrice: 199.9,
            discountPercent: 35,
            rating: 4.6,
            coupon: 'R$ 20 OFF',
            permalink: 'https://www.amazon.com.br/dp/B0AFFORDABLE',
            sourceFilter: term,
          },
        ]
      },
      async close() {},
    }),
  })

  const result = await provider.search(['whey protein promocao'])

  assert.deepEqual(result.items.map((item) => item.id), ['B0AFFORDABLE'])
})

test('amazon catalog provider discards invalid original prices lower than current price', async () => {
  const provider = createAmazonCatalogProvider({
    maxPagesPerFilter: 1,
    logger: { info() {}, warn() {} },
    createSearchSession: async () => ({
      async search(term) {
        return [
          {
            id: 'B0PRICE123',
            title: 'Produto com preco anterior invalido',
            price: 59.9,
            originalPrice: 29.95,
            rating: 5,
            permalink: 'https://www.amazon.com.br/dp/B0PRICE123',
            sourceFilter: term,
          },
        ]
      },
      async close() {},
    }),
  })

  const result = await provider.search(['echo dot oferta'])

  assert.equal(result.items[0].originalPrice, null)
  assert.equal(result.items[0].discountPercent, null)
})

test('extractAmazonCouponsFromTexts extracts visible coupon values, codes and raw promotion text', () => {
  const coupons = extractAmazonCouponsFromTexts([
    'Aplicar cupom de R$20 off Insira o código VEMNOAPP ao finalizar a compra',
    'Resgatar R$ 15 OFF com o código COMPRANOAPP',
    'Texto sem cupom',
  ])

  assert.deepEqual(coupons, [
    {
      coupon_value: 'R$20 off',
      coupon_code: 'VEMNOAPP',
      coupon_text: 'R$20 off Insira o código VEMNOAPP ao finalizar a compra',
    },
    {
      coupon_value: 'R$ 15 OFF',
      coupon_code: 'COMPRANOAPP',
      coupon_text: 'Resgatar R$ 15 OFF com o código COMPRANOAPP',
    },
  ])
})

test('extractAmazonCouponsFromTexts supports discount without code and limits multiple coupons to two', () => {
  const coupons = extractAmazonCouponsFromTexts([
    'Cupom R$10 off disponível',
    'Aplicar cupom R$20 off código PRIME20',
    'Resgatar R$30 off código TERCEIRO30',
  ])

  assert.deepEqual(coupons, [
    {
      coupon_value: 'R$10 off',
      coupon_code: null,
      coupon_text: 'Cupom R$10 off disponível',
    },
    {
      coupon_value: 'R$20 off',
      coupon_code: 'PRIME20',
      coupon_text: 'Aplicar cupom R$20 off código PRIME20',
    },
  ])
})

test('extractAmazonCouponsFromTexts extracts multiple visible coupon snippets from one noisy promotion block', () => {
  const coupons = extractAmazonCouponsFromTexts([
    'function(){ignored} Resgatar R$20 off.Insira o código VEMNOAPP na hora do pagamento. Válido na sua primeira compra no app Termos function(){ignored} Resgatar R$20 off.Insira o código COMPRANOAPP na hora do pagamento. Na sua primeira compra na Amazon. Válido somente no app Termos',
  ])

  assert.deepEqual(coupons, [
    {
      coupon_value: 'R$20 off',
      coupon_code: 'VEMNOAPP',
      coupon_text: 'R$20 off. Insira o código VEMNOAPP na hora do pagamento. Válido na sua primeira compra no app',
    },
    {
      coupon_value: 'R$20 off',
      coupon_code: 'COMPRANOAPP',
      coupon_text: 'R$20 off. Insira o código COMPRANOAPP na hora do pagamento. Na sua primeira compra na Amazon. Válido somente no app',
    },
  ])
})

test('extractAmazonCouponsFromTexts ignores product descriptions and import fee totals that only mention coupon in title text', () => {
  const coupons = extractAmazonCouponsFromTexts([
    'R$109,02 Taxas de importação já incluídas Item: R$ 72,68 Total: R$ 109,02 Comprar agora: Cortador de papel para cortar papel, cupom, etiqueta e artesanato',
    'Você sente dor de cabeça por vouchers, recibos, cartões e cupons? Organizador de cupom em pasta sanfonada',
  ])

  assert.deepEqual(coupons, [])
})

test('amazon catalog provider enriches products with coupon details from the product page', async () => {
  const logs = []
  const provider = createAmazonCatalogProvider({
    maxPagesPerFilter: 1,
    logger: {
      info(payload) {
        logs.push(payload)
      },
      warn() {},
    },
    createSearchSession: async () => ({
      async search(term) {
        return [
          {
            id: 'B0COUPON123',
            title: 'Produto com cupom',
            price: 59.9,
            rating: 4.7,
            permalink: 'https://www.amazon.com.br/dp/B0COUPON123',
            sourceFilter: term,
          },
        ]
      },
      async getProductDetails() {
        return {
          coupons: [
            {
              coupon_value: 'R$20 off',
              coupon_code: 'DYNAMIC20',
              coupon_text: 'Aplicar cupom de R$20 off Insira o código DYNAMIC20',
            },
          ],
        }
      },
      async close() {},
    }),
  })

  const result = await provider.search(['produto cupom'])

  assert.equal(result.items[0].coupon_value, 'R$20 off')
  assert.equal(result.items[0].coupon_code, 'DYNAMIC20')
  assert.equal(result.items[0].coupon_text, 'Aplicar cupom de R$20 off Insira o código DYNAMIC20')
  assert.deepEqual(result.items[0].coupons, [
    {
      coupon_value: 'R$20 off',
      coupon_code: 'DYNAMIC20',
      coupon_text: 'Aplicar cupom de R$20 off Insira o código DYNAMIC20',
    },
  ])
  assert.equal(logs.some((payload) => payload.event === 'amazon_coupon_detected' && payload.coupon_code === 'DYNAMIC20'), true)
})

test('amazon catalog provider stops enriching the current page after the target pool is reached', async () => {
  let detailCalls = 0
  const provider = createAmazonCatalogProvider({
    maxPagesPerFilter: 1,
    logger: { info() {}, warn() {} },
    createSearchSession: async () => ({
      async search(term) {
        return Array.from({ length: 20 }, (_, index) => ({
          id: `B0FAST${String(index).padStart(4, '0')}`,
          title: `Produto Amazon ${index}`,
          price: 49.9 + index,
          rating: 4.5,
          permalink: `https://www.amazon.com.br/dp/B0FAST${String(index).padStart(4, '0')}`,
          sourceFilter: term,
        }))
      },
      async getProductDetails() {
        detailCalls += 1
        return { coupons: [] }
      },
      async close() {},
    }),
  })

  const result = await provider.search(['mamadeira oferta'], { targetItemCount: 3 })

  assert.equal(detailCalls, 6)
  assert.equal(result.items.length, 6)
})
