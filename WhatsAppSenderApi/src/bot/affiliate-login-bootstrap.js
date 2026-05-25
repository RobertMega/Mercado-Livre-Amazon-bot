import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

function isLoginUrl(url) {
  return /\/lgz\/|\/login/.test(url)
}

async function defaultCreateTempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'affiliate-login-'))
}

async function defaultRemoveDir(dir) {
  if (!dir) {
    return
  }

  await rm(dir, { recursive: true, force: true })
}

export function createAffiliateLoginBootstrap({
  affiliate,
  launchPersistentContext,
  createTempDir = defaultCreateTempDir,
  removeDir = defaultRemoveDir,
} = {}) {
  if (!affiliate?.userDataDir) {
    throw new Error(
      'Set ML_AFFILIATE_PLAYWRIGHT_USER_DATA_DIR before running the affiliate login bootstrap.',
    )
  }

  function createLaunchOptions() {
    const options = {
      headless: false,
    }

    if (affiliate.channel) {
      options.channel = affiliate.channel
    }

    if (affiliate.executablePath) {
      options.executablePath = affiliate.executablePath
    }

    if (affiliate.userAgent) {
      options.userAgent = affiliate.userAgent
    }

    return options
  }

  async function openContext(userDataDir) {
    const context = await launchPersistentContext(userDataDir, createLaunchOptions())
    const page = context.pages()[0] || (await context.newPage())

    await page.goto(affiliate.hubUrl, { waitUntil: 'domcontentloaded' })

    return { context, page }
  }

  return {
    async open() {
      let tempDir = null

      try {
        const { context, page } = await openContext(affiliate.userDataDir)

        return createSession({
          mode: 'saved_profile',
          context,
          page,
          tempDir,
          affiliate,
          removeDir,
        })
      } catch (primaryError) {
        tempDir = await createTempDir()

        try {
          const { context, page } = await openContext(tempDir)

          return createSession({
            mode: 'temporary_profile',
            context,
            page,
            tempDir,
            affiliate,
            removeDir,
            primaryError,
          })
        } catch (fallbackError) {
          await removeDir(tempDir).catch(() => {})
          fallbackError.message = `${primaryError.message} | fallback failed: ${fallbackError.message}`
          throw fallbackError
        }
      }
    },
  }
}

function createSession({
  mode,
  context,
  page,
  tempDir,
  affiliate,
  removeDir,
  primaryError = null,
}) {
  return {
    mode,
    page,
    primaryError,
    async ensureAuthenticated() {
      await page.goto(affiliate.hubUrl, { waitUntil: 'networkidle' })

      if (isLoginUrl(page.url())) {
        throw new Error('Login was not completed for the affiliate profile.')
      }
    },
    async waitForAuthentication({
      timeoutMs = 300000,
      pollIntervalMs = 1000,
    } = {}) {
      const deadline = Date.now() + timeoutMs

      while (Date.now() < deadline) {
        if (!isLoginUrl(page.url())) {
          return
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
      }

      throw new Error('Login was not completed before the timeout expired.')
    },
    async save() {
      if (!affiliate.storageStatePath) {
        return
      }

      await context.storageState({
        path: affiliate.storageStatePath,
        indexedDB: true,
      })
    },
    async close() {
      await context.close()
      await removeDir(tempDir).catch(() => {})
    },
  }
}
