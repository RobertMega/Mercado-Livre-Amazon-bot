# Shopee Metadata Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Shopee extraction fail with a clear diagnostic and structured logging when required metadata is missing, while keeping Mercado Livre unchanged and leaving Shopee extraction pluggable.

**Architecture:** Extract Shopee metadata parsing into a dedicated module that returns both extracted fields and diagnostics. The Shopee handler will use that module, log structured details about found and missing fields, and throw a precise error when title, price, or id cannot be extracted from the fetched HTML.

**Tech Stack:** Node.js, ESM JavaScript, node:test

---

### Task 1: Lock the diagnostic contract with tests

**Files:**
- Modify: `tests/bot/marketplace-handlers.test.js`

- [ ] **Step 1: Add tests for missing-field diagnostics and structured Shopee logging on real shell-like HTML**
- [ ] **Step 2: Run `node --test tests/bot/marketplace-handlers.test.js` and verify the new assertions fail**

### Task 2: Extract Shopee parsing into a dedicated diagnostic module

**Files:**
- Create: `src/bot/handlers/shopee-metadata-extractor.js`
- Modify: `src/bot/handlers/shopee-handler.js`

- [ ] **Step 1: Implement Shopee metadata extraction with `found`, `missing`, and `sources` diagnostics**
- [ ] **Step 2: Update the Shopee handler to log structured diagnostics and throw a clear missing-fields error**
- [ ] **Step 3: Keep Mercado Livre and the generic HTML handler untouched**

### Task 3: Verify the targeted handler tests

**Files:**
- Test: `tests/bot/marketplace-handlers.test.js`

- [ ] **Step 1: Run `node --test tests/bot/marketplace-handlers.test.js`**
- [ ] **Step 2: Confirm the final output is green before reporting completion**
