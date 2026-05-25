# Dynamic Coupon Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect available coupons dynamically for each Mercado Livre offer and include the detected coupon or a fallback label in both text-only and image-based WhatsApp posts without breaking the existing bot flow.

**Architecture:** Keep coupon detection inside the Mercado Livre catalog provider so downstream code can consume a normalized `item.coupon` field. Reuse a shared formatter for both text messages and image captions, while preserving the current runner orchestration and WhatsApp API integration.

**Tech Stack:** Node.js, ESM JavaScript, node:test, Playwright, Fastify

---

### Task 1: Cover coupon extraction in the catalog provider

**Files:**
- Modify: `tests/bot/mercado-livre-provider.test.js`
- Modify: `src/bot/providers/mercado-livre-catalog-provider.js`
- Test: `tests/bot/mercado-livre-provider.test.js`

- [ ] **Step 1: Write the failing tests**

```js
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
            promotions: [{
              type: 'coupon',
              text: 'Cupom R$ 20 OFF',
            }],
          }],
        }
      },
    }),
  })

  const [item] = await provider.search(['creatina'])
  assert.equal(item.coupon, 'R$ 20 OFF')
})

test('catalog provider scraping extracts coupon text from listing cards when present', async () => {
  const provider = createMercadoLivreCatalogProvider({
    fetchImpl: async () => ({ ok: false, status: 403 }),
    createSearchSession: async () => ({
      async search() {
        return [{
          id: 'MLB10',
          title: 'Creatina 1',
          price: 79.9,
          currencyId: 'BRL',
          permalink: 'https://www.mercadolivre.com.br/produto-1/p/MLB10',
          thumbnailUrl: 'https://http2.mlstatic.com/creatina-1.webp',
          coupon: '10% OFF',
        }]
      },
      async close() {},
    }),
  })

  const [item] = await provider.search(['creatina growth'])
  assert.equal(item.coupon, '10% OFF')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/bot/mercado-livre-provider.test.js`
Expected: FAIL because `coupon` is not normalized yet.

- [ ] **Step 3: Write minimal implementation**

```js
function normalizeCouponText(value) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text.replace(/^Cupom\s+/i, '').trim() || null
}

function extractCouponFromPromotions(promotions = []) {
  for (const promotion of promotions) {
    if (promotion?.type === 'coupon') {
      return normalizeCouponText(promotion.text)
    }
  }

  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/bot/mercado-livre-provider.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/bot/mercado-livre-provider.test.js src/bot/providers/mercado-livre-catalog-provider.js
git commit -m "feat: detect coupons in catalog items"
```

### Task 2: Cover coupon rendering in text and image messages

**Files:**
- Modify: `tests/bot/format-offer-message.test.js`
- Modify: `tests/bot/build-offer-image-message.test.js`
- Modify: `src/bot/format-offer-message.js`
- Modify: `src/bot/build-offer-image-message.js`
- Test: `tests/bot/format-offer-message.test.js`
- Test: `tests/bot/build-offer-image-message.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('offer image builder includes coupon text and affiliate link in the caption', async () => {
  const builder = createOfferImageMessageBuilder({
    fetchImpl: async () => ({
      ok: true,
      async arrayBuffer() {
        return Buffer.from('image')
      },
    }),
  })

  const result = await builder.build(
    {
      title: 'Notebook Gamer',
      price: 8999.9,
      currencyId: 'BRL',
      thumbnailUrl: 'https://http2.mlstatic.com/product.webp',
      coupon: 'GAMER100',
    },
    'https://meli.la/1GHAQVQ',
  )

  assert.equal(result.caption, [
    '🔥 PROMOÇÃO',
    '📦 Notebook Gamer',
    '💰 R$ 8.999,90',
    '',
    '🎟️ CUPOM: GAMER100',
    '',
    '👉 LINK:',
    'https://meli.la/1GHAQVQ',
  ].join('\n'))
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/bot/format-offer-message.test.js`
Run: `node tests/bot/build-offer-image-message.test.js`
Expected: FAIL because the image caption still uses the old plain format and `build()` does not accept the affiliate link.

- [ ] **Step 3: Write minimal implementation**

```js
export function buildOfferBody(item, affiliateLink) {
  return [
    '🔥 PROMOÇÃO',
    `📦 ${item.title}`,
    `💰 ${formatPrice(item.price, item.currencyId || 'BRL')}`,
    '',
    `🎟️ CUPOM: ${resolveCouponLabel(item)}`,
    '',
    '👉 LINK:',
    affiliateLink,
  ].join('\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/bot/format-offer-message.test.js`
Run: `node tests/bot/build-offer-image-message.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/bot/format-offer-message.test.js tests/bot/build-offer-image-message.test.js src/bot/format-offer-message.js src/bot/build-offer-image-message.js
git commit -m "feat: render coupons in offer messages"
```

### Task 3: Verify runner behavior and full suite

**Files:**
- Modify: `tests/bot/run-posting-cycle.test.js`
- Modify: `package.json`
- Test: `tests/bot/run-posting-cycle.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
  {
    type: 'text',
    payload: {
      sessionId: 'sales-session',
      to: '120363400000000000@g.us',
      body: 'https://example.com/1?aff=1',
    },
  },
])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/bot/run-posting-cycle.test.js`
Expected: FAIL because the current image caption still lacks coupon and link content.

- [ ] **Step 3: Write minimal implementation**

```js
const offerImageMessage = await offerImageBuilder?.build?.(item, affiliateLink)
```

- [ ] **Step 4: Run full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/bot/run-posting-cycle.test.js package.json src/bot/create-bot-runner.js
git commit -m "test: verify coupon-aware bot posting flow"
```
