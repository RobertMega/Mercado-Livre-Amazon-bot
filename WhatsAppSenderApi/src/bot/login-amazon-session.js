import { createInterface } from 'node:readline/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { chromium } from 'playwright'

import { loadEnv } from '../lib/load-env.js'
import { getAmazonConfig } from '../config/amazon.js'

const AMAZON_LOGIN_URL = 'https://www.amazon.com.br/ap/signin'

export function createAmazonLoginRunner({
  config,
  launchPersistentContext = (userDataDir, options) => chromium.launchPersistentContext(userDataDir, options),
  isInteractive = () => Boolean(process.stdin.isTTY),
  waitForManualConfirmation = () => new Promise(() => {}),
  createPrompt = () => createInterface({
    input: process.stdin,
    output: process.stdout,
  }),
  writeOutput = (message) => process.stdout.write(message),
} = {}) {
  return {
    async run() {
      const { playwright } = config
      const launchOptions = {
        headless: false,
      }

      if (playwright.channel) {
        launchOptions.channel = playwright.channel
      }

      if (playwright.executablePath) {
        launchOptions.executablePath = playwright.executablePath
      }

      const rl = createPrompt()
      const context = await launchPersistentContext(playwright.userDataDir, launchOptions)

      try {
        const page = context.pages()[0] || (await context.newPage())
        await page.goto(AMAZON_LOGIN_URL, { waitUntil: 'domcontentloaded' })

        writeOutput('Navegador aberto para login manual da Amazon.\n')
        writeOutput(`Perfil: ${playwright.userDataDir}\n`)
        writeOutput(`Storage state: ${playwright.storageStatePath}\n`)
        writeOutput('Faca login manual na Amazon e pressione Enter quando terminar.\n')

        if (isInteractive()) {
          await rl.question('Faca login manual na Amazon e pressione Enter quando terminar.\n')
        } else {
          writeOutput('Terminal sem entrada interativa. O processo aguardara ate ser interrompido manualmente.\n')
          await waitForManualConfirmation()
        }

        await context.storageState({
          path: playwright.storageStatePath,
          indexedDB: true,
        })

        writeOutput(`Sessao Amazon salva em ${playwright.storageStatePath}\n`)
      } finally {
        rl.close()
        await context.close()
      }
    },
  }
}

export async function runAmazonLoginSession() {
  loadEnv()

  const config = getAmazonConfig()
  const runner = createAmazonLoginRunner({ config })

  await runner.run()
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runAmazonLoginSession()
}
