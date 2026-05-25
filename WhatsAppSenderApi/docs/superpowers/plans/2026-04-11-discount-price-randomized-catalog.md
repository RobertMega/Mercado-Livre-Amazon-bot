# Discount Price And Randomized Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bot publish the lowest visible Mercado Livre price and randomize the candidate product order across filters.

**Architecture:** Keep the existing bot flow intact and concentrate the behavior change in the catalog provider. The provider will normalize both promotional and original prices, prefer the promotional/current price for downstream messaging, and shuffle the aggregated item list before the runner evaluates duplicates and sends messages.

**Tech Stack:** Node.js, Playwright, node:test, Fastify, Prisma

---

### Task 1: Cover discount normalization and randomized order

**Files:**
- Modify: `tests/bot/mercado-livre-provider.test.js`
- Test: `tests/bot/mercado-livre-provider.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('catalog provider prefers promotional price from API items', async () => {
  const provider = createMercadoLivreCatalogProvider({
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          results: [{
            id: 'MLB1',
            title: 'Produto 1',
            price: 199.9,
            original_price: 249.9,
            sale_price: { amount: 149.9 },
            currency_id: 'BRL',
            permalink: 'https://mercadolivre.com/1',
          }],
        }
      },
    }),
  })

  const [item] = await provider.search(['air fryer'])
  assert.equal(item.price, 149.9)
  assert.equal(item.originalPrice, 249.9)
})

test('catalog provider shuffles aggregated items before returning them', async () => {
  const provider = createMercadoLivreCatalogProvider({
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          results: [
            { id: 'MLB1', title: 'A', price: 10, currency_id: 'BRL', permalink: 'https://mercadolivre.com/1' },
            { id: 'MLB2', title: 'B', price: 20, currency_id: 'BRL', permalink: 'https://mercadolivre.com/2' },
            { id: 'MLB3', title: 'C', price: 30, currency_id: 'BRL', permalink: 'https://mercadolivre.com/3' },
          ],
        }
      },
    }),
    randomInt: () => 0,
  })

  const items = await provider.search(['air fryer'])
  assert.deepEqual(items.map((item) => item.id), ['MLB2', 'MLB3', 'MLB1'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/bot/mercado-livre-provider.test.js`
Expected: FAIL because `originalPrice` is missing, discount price is ignored, and item order is unchanged.

- [ ] **Step 3: Write minimal implementation**

```js
function extractApiPrice(item) {
  return item.sale_price?.amount ?? item.price
}

function shuffleItems(items, randomInt) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/bot/mercado-livre-provider.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/bot/mercado-livre-provider.test.js src/bot/providers/mercado-livre-catalog-provider.js
git commit -m "feat: prefer discount prices and shuffle catalog items"
```

### Task 2: Cover discounted scraping behavior and full verification

**Files:**
- Modify: `tests/bot/mercado-livre-provider.test.js`
- Modify: `package.json`
- Test: `tests/bot/mercado-livre-provider.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('catalog provider scraping keeps the current displayed price and original price when available', async () => {
  const provider = createMercadoLivreCatalogProvider({
    fetchImpl: async () => ({ ok: false, status: 403 }),
    createSearchSession: async () => ({
      async search() {
        return [{
          id: 'MLB10',
          title: 'Creatina 1',
          price: 79.9,
          originalPrice: 99.9,
          currencyId: 'BRL',
          permalink: 'https://www.mercadolivre.com.br/produto-1/p/MLB10',
        }]
      },
      async close() {},
    }),
  })

  const [item] = await provider.search(['creatina growth'])
  assert.equal(item.price, 79.9)
  assert.equal(item.originalPrice, 99.9)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/bot/mercado-livre-provider.test.js`
Expected: FAIL if the provider drops `originalPrice` or rewrites the current price.

- [ ] **Step 3: Write minimal implementation**

```js
items.push({
  id,
  title,
  price: currentPrice,
  originalPrice,
  currencyId: currency,
  permalink,
  thumbnailUrl,
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tests/bot/mercado-livre-provider.test.js src/bot/providers/mercado-livre-catalog-provider.js
git commit -m "test: cover discounted scraped prices"
```
