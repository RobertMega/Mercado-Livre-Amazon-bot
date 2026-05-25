# Shopee Real Link Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/api/offers/publish` recognize real Shopee Brazil product links in the `...-i.<shopId>.<itemId>` format, including when the payload uses `link` instead of `url`.

**Architecture:** Extend URL resolution once at the router/HTML-handler boundary, then expand the Shopee ID extractor to accept both `/product/<shopId>/<itemId>` and slug-based `-i.<shopId>.<itemId>` URLs. Keep Mercado Livre behavior untouched.

**Tech Stack:** Node.js, ESM JavaScript, Fastify, node:test

---

### Task 1: Lock the failing scenarios with tests

**Files:**
- Modify: `tests/bot/marketplace-router.test.js`
- Modify: `tests/bot/marketplace-handlers.test.js`
- Modify: `tests/api/offer-ingestion.test.js`

- [ ] **Step 1: Add tests for `shopee.com.br` and `www.shopee.com.br` slug URLs plus the `link` payload alias**
- [ ] **Step 2: Run `node --test tests/bot/marketplace-router.test.js tests/bot/marketplace-handlers.test.js tests/api/offer-ingestion.test.js` and verify the new assertions fail**

### Task 2: Implement the minimal routing and parsing changes

**Files:**
- Modify: `src/bot/marketplace-router.js`
- Modify: `src/bot/handlers/html-marketplace-handler.js`
- Modify: `src/bot/handlers/shopee-handler.js`

- [ ] **Step 1: Resolve marketplace host detection from `url || link`**
- [ ] **Step 2: Resolve HTML handler permalink from `url || link || metadata.url || metadata.permalink`**
- [ ] **Step 3: Extend Shopee ID parsing to support `...-i.<shopId>.<itemId>`**

### Task 3: Verify the targeted suite

**Files:**
- Test: `tests/bot/marketplace-router.test.js`
- Test: `tests/bot/marketplace-handlers.test.js`
- Test: `tests/api/offer-ingestion.test.js`

- [ ] **Step 1: Run `node --test tests/bot/marketplace-router.test.js tests/bot/marketplace-handlers.test.js tests/api/offer-ingestion.test.js`**
- [ ] **Step 2: Confirm the final output is green before reporting completion**
