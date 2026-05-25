import { createInterface } from 'node:readline/promises'
import process from 'node:process'

import { chromium } from 'playwright'

import { loadEnv } from '../lib/load-env.js'
import { getBotConfig } from './config.js'
import { createAffiliateLoginBootstrap } from './affiliate-login-bootstrap.js'

loadEnv()

const { affiliate } = getBotConfig()
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
})

const bootstrap = createAffiliateLoginBootstrap({
  affiliate,
  launchPersistentContext: (userDataDir, options) => chromium.launchPersistentContext(userDataDir, options),
})

const session = await bootstrap.open()

try {
  if (session.mode === 'temporary_profile') {
    process.stdout.write(
      '\nNao foi possivel abrir sessions/affiliate-profile. O login sera feito em um perfil temporario limpo e a sessao autenticada sera salva em sessions/affiliate-storage-state.json.\n\n',
    )
  }

  process.stdout.write(
    '\nFaca o login manual no navegador aberto. Depois volte ao terminal e pressione Enter.\n\n',
  )

  if (process.stdin.isTTY) {
    await rl.question('')
  } else {
    process.stdout.write('Terminal sem entrada interativa. Vou aguardar a conclusao do login automaticamente.\n')
    await session.waitForAuthentication()
  }

  await session.ensureAuthenticated()
  await session.save()

  process.stdout.write(
    session.mode === 'temporary_profile'
      ? 'Sessao de afiliado salva em sessions/affiliate-storage-state.json usando perfil temporario.\n'
      : `Sessao de afiliado salva em ${affiliate.userDataDir}\n`,
  )
} finally {
  rl.close()
  await session.close()
}
