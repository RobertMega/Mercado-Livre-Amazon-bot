# Bot Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the posting bot recover automatically from transient Playwright affiliate-session crashes and clear orphaned `running` executions on startup.

**Architecture:** Keep the fix narrow. The affiliate provider will treat browser/session-closed failures as disposable session errors, reset the cached session, and retry once. The bot startup path will mark unfinished `PostingExecution` rows as failed before starting a new cycle so scheduler state reflects reality.

**Tech Stack:** Node.js, ESM JavaScript, Playwright, Prisma, node:test

---

### Task 1: Cover affiliate session recovery

**Files:**
- Modify: `tests/bot/affiliate-link-provider.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run `node --test tests/bot/affiliate-link-provider.test.js` and verify the new case fails**
- [ ] **Step 3: Implement the minimal retry/reset logic in the provider**
- [ ] **Step 4: Re-run `node --test tests/bot/affiliate-link-provider.test.js` and verify it passes**

### Task 2: Cover stale execution cleanup

**Files:**
- Create: `tests/bot/prisma-bot-repository.test.js`
- Modify: `src/bot/repositories/prisma-bot-repository.js`
- Modify: `src/bot/main.js`

- [ ] **Step 1: Write the failing repository test for clearing orphaned `running` executions**
- [ ] **Step 2: Run `node --test tests/bot/prisma-bot-repository.test.js` and verify it fails**
- [ ] **Step 3: Add repository cleanup method and call it during bot startup**
- [ ] **Step 4: Re-run both focused tests and verify they pass**

### Task 3: Verify runtime behavior

**Files:**
- Modify: none expected

- [ ] **Step 1: Run the focused bot tests**
- [ ] **Step 2: Inspect live process/API/database state**
- [ ] **Step 3: Run one real bot cycle and confirm a completed execution or an actionable runtime blocker**
