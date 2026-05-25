import { createInterface } from 'node:readline/promises'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { chromium } from 'playwright'

import { loadEnv } from '../lib/load-env.js'
import { getBotConfig } from './config.js'
import { createAffiliateLoginBootstrap } from './affiliate-login-bootstrap.js'

export function createShopeeAffiliateLoginRunner({
  shopeeAffiliate,
  bootstrap,
  debug = true,
  isInteractive = () => Boolean(process.stdin.isTTY),
  waitForManualConfirmation = () => new Promise(() => {}),
  waitForBrowserClose = () => new Promise(() => {}),
  createPrompt = () => createInterface({
    input: process.stdin,
    output: process.stdout,
  }),
  writeOutput = (message) => process.stdout.write(message),
  writeError = (message) => process.stderr.write(message),
} = {}) {
  return {
    async run() {
      const rl = createPrompt()
      const session = await bootstrap.open()

      try {
        writeOutput('Navegador aberto para login da Shopee Afiliados.\n')

        if (session.mode === 'temporary_profile') {
          writeOutput(
            '\nNao foi possivel abrir o perfil salvo da Shopee. O login sera feito em um perfil temporario limpo e a sessao autenticada sera salva no storage state configurado.\n\n',
          )
        }

        writeOutput('Faça login manual e pressione Enter quando terminar\n')

        if (isInteractive()) {
          await rl.question('Faça login manual e pressione Enter quando terminar\n')
        } else {
          writeOutput('Terminal sem entrada interativa. O processo permanecera aberto ate ser interrompido manualmente.\n')
          await waitForManualConfirmation()
        }

        try {
          await session.ensureAuthenticated?.()
          await session.save()
          writeOutput('Storage state salvo.\n')
          writeOutput(
            session.mode === 'temporary_profile'
              ? 'Sessao de afiliado da Shopee salva no storage state configurado usando perfil temporario.\n'
              : `Sessao de afiliado da Shopee salva em ${shopeeAffiliate.userDataDir}\n`,
          )
        } catch (error) {
          if (!debug) {
            throw error
          }

          const message = error instanceof Error ? error.stack || error.message : String(error)
          writeError(`Erro no fluxo de login da Shopee: ${message}\n`)
        }

        writeOutput('A janela permanecera aberta para login manual. Encerre o processo manualmente quando terminar.\n')
        await waitForBrowserClose()
      } finally {
        rl.close()
      }
    },
  }
}

export async function runShopeeAffiliateLoginSession() {
  loadEnv()

  const { shopee } = getBotConfig()
  const bootstrap = createAffiliateLoginBootstrap({
    affiliate: shopee.affiliate,
    launchPersistentContext: (userDataDir, options) => chromium.launchPersistentContext(userDataDir, options),
  })

  const runner = createShopeeAffiliateLoginRunner({
    shopeeAffiliate: shopee.affiliate,
    bootstrap,
  })

  await runner.run()
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runShopeeAffiliateLoginSession()
}
