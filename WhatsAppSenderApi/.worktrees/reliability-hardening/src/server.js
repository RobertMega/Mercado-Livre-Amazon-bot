// src/server.js
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { buildApp } from './app.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load env manually (no dotenv needed in Node 20+)
try {
  const envContent = readFileSync(join(__dirname, '../.env'), 'utf-8')
  for (const line of envContent.split('\n')) {
    const [key, ...val] = line.split('=')
    if (key && val.length) process.env[key.trim()] = val.join('=').trim().replace(/^"|"$/g, '')
  }
} catch (_) {}

const PORT = parseInt(process.env.PORT || '3000')
const HOST = process.env.HOST || '0.0.0.0'

const fastify = await buildApp()

// Start
try {
  await fastify.listen({ port: PORT, host: HOST })
  fastify.log.info(`🟢 Panel: http://localhost:${PORT}`)
  fastify.log.info(`🔵 API:   http://localhost:${PORT}/api`)

} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
