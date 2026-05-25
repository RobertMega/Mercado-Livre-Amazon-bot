# Offer Message Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the offer message text to include emojis, a coupon section, and a labeled affiliate link without changing the existing function signature or breaking WhatsApp link preview behavior.

**Architecture:** Keep the change isolated to the offer message formatter and its dedicated test file. Preserve the affiliate link as the final standalone line so the rest of the bot flow and WhatsApp preview detection remain compatible.

**Tech Stack:** Node.js, ESM JavaScript, node:test

---

### Task 1: Cover coupon-aware message formatting

**Files:**
- Modify: `tests/bot/format-offer-message.test.js`
- Test: `tests/bot/format-offer-message.test.js`

- [ ] **Step 1: Write the failing tests**

```js
test('formatOfferMessage adds emojis, coupon text, and keeps the affiliate URL isolated for preview detection', () => {
  const body = formatOfferMessage(
    {
      title: 'Notebook Gamer',
      price: 8999.9,
      currencyId: 'BRL',
      coupon: 'GAMER100',
    },
    'https://meli.la/1GHAQVQ',
  )

  assert.equal(body, [
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

test('formatOfferMessage falls back when there is no available coupon', () => {
  const body = formatOfferMessage(
    {
      title: 'Air Fryer',
      price: 299.9,
      currencyId: 'BRL',
    },
    'https://meli.la/2ABCDE',
  )

  assert.equal(body, [
    '🔥 PROMOÇÃO',
    '📦 Air Fryer',
    '💰 R$ 299,90',
    '',
    '🎟️ CUPOM: SEM CUPOM DISPONIVEL',
    '',
    '👉 LINK:',
    'https://meli.la/2ABCDE',
  ].join('\n'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/bot/format-offer-message.test.js`
Expected: FAIL because the current formatter still returns the old plain-text structure and has no coupon handling.

- [ ] **Step 3: Write minimal implementation**

```js
function resolveCouponLabel(item) {
  const coupon = typeof item.coupon === 'string' ? item.coupon.trim() : ''
  return coupon || 'SEM CUPOM DISPONIVEL'
}

export function formatOfferMessage(item, affiliateLink) {
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
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/bot/format-offer-message.test.js src/bot/format-offer-message.js docs/superpowers/plans/2026-04-12-offer-message-formatting.md
git commit -m "feat: enhance offer message formatting"
```

### Task 2: Verify the wider suite still passes

**Files:**
- Modify: `package.json`
- Test: `tests/api/session-chats.test.js`
- Test: `tests/api/send-text-link-preview.test.js`
- Test: `tests/bot/run-posting-cycle.test.js`
- Test: `tests/bot/mercado-livre-provider.test.js`
- Test: `tests/bot/affiliate-link-provider.test.js`
- Test: `tests/bot/format-offer-message.test.js`
- Test: `tests/bot/build-offer-link-preview.test.js`
- Test: `tests/bot/build-offer-image-message.test.js`
- Test: `tests/bot/whatsapp-api-client.test.js`

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`
Expected: PASS, confirming the formatter change did not break the existing API or bot flow.

- [ ] **Step 2: Commit if verification required its own checkpoint**

```bash
git add .
git commit -m "test: verify offer message formatting change"
```
