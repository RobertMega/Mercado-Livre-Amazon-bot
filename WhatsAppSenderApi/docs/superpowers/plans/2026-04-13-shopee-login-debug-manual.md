# Shopee Login Debug Manual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run shopee:affiliate:login` keep the Shopee browser window open until the user manually stops the process, including when authentication fails.

**Architecture:** Keep the change isolated to the Shopee login runner. Reuse the existing generic bootstrap session API, but change the runner so it never auto-closes the Playwright context, treats login validation/save failures as logged debug events, and stays alive indefinitely after success or error.

**Tech Stack:** Node.js, ESM JavaScript, Playwright, node:test

---

### Task 1: Lock the new runner behavior with tests

**Files:**
- Modify: `tests/bot/shopee-affiliate-login-runner.test.js`
- Test: `tests/bot/shopee-affiliate-login-runner.test.js`

- [ ] **Step 1: Write failing tests for debug/manual keep-alive behavior**
- [ ] **Step 2: Run `node --test tests/bot/shopee-affiliate-login-runner.test.js` and verify the new assertions fail**
- [ ] **Step 3: Implement the minimal runner changes in `src/bot/login-shopee-affiliate-session.js`**
- [ ] **Step 4: Run `node --test tests/bot/shopee-affiliate-login-runner.test.js` and verify it passes**

### Task 2: Verify no regression in shared bootstrap expectations

**Files:**
- Test: `tests/bot/affiliate-login-bootstrap.test.js`

- [ ] **Step 1: Run `node --test tests/bot/affiliate-login-bootstrap.test.js`**
- [ ] **Step 2: If needed, adjust only runner-facing expectations without changing shared bootstrap close semantics**

### Task 3: Verify the targeted bot test set

**Files:**
- Test: `tests/bot/shopee-affiliate-login-runner.test.js`
- Test: `tests/bot/affiliate-login-bootstrap.test.js`

- [ ] **Step 1: Run `node --test tests/bot/shopee-affiliate-login-runner.test.js tests/bot/affiliate-login-bootstrap.test.js`**
- [ ] **Step 2: Confirm the final output is green before reporting completion**
