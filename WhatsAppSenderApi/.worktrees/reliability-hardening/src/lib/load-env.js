import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function loadEnv() {
  try {
    const envContent = readFileSync(join(__dirname, '../../.env'), 'utf-8')
    for (const line of envContent.split('\n')) {
      const [key, ...val] = line.split('=')
      if (key && val.length) process.env[key.trim()] = val.join('=').trim().replace(/^"|"$/g, '')
    }
  } catch (_) {}
}
