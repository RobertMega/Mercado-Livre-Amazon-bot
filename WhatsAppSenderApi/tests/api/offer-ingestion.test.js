import test from 'node:test'
import assert from 'node:assert/strict'

import { buildApp } from '../../src/app.js'
import { createOfferIngestionService } from '../../src/bot/create-offer-ingestion-service.js'
import { createMarketplaceRouter } from '../../src/bot/marketplace-router.js'
import { createShopeeHandler } from '../../src/bot/handlers/shopee-handler.js'

test('POST /api/offers/publish forwards the incoming offer payload to the ingestion service', async () => {
  const calls = []

  const app = await buildApp({
    prisma: {
      session: {
        findUnique: async () => null,
      },
    },
    whatsappService: {
      restoreSessionsFromDB: async () => {},
    },
    offerIngestionService: {
      async publishIncomingOffer(payload) {
        calls.push(payload)
        return {
          success: true,
          platform: 'shopee',
          itemId: '123456',
        }
      },
    },
    autoRestoreSessions: false,
    logger: false,
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/offers/publish',
    payload: {
      url: 'https://shopee.com.br/product/123/456',
      source: 'whatsapp',
      metadata: {
        coupon: 'SHP10',
      },
    },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [
    {
      url: 'https://shopee.com.br/product/123/456',
      source: 'whatsapp',
      metadata: {
        coupon: 'SHP10',
      },
    },
  ])
  assert.deepEqual(response.json(), {
    success: true,
    platform: 'shopee',
    itemId: '123456',
  })

  await app.close()
})

test('POST /api/offers/publish accepts a shopee link payload alias and keeps platform shopee', async () => {
  const calls = []

  const app = await buildApp({
    prisma: {
      session: {
        findUnique: async () => null,
      },
    },
    whatsappService: {
      restoreSessionsFromDB: async () => {},
    },
    offerIngestionService: {
      async publishIncomingOffer(payload) {
        calls.push(payload)
        return {
          success: true,
          platform: 'shopee',
          itemId: '378143264:23696668795',
        }
      },
    },
    autoRestoreSessions: false,
    logger: false,
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/offers/publish',
    payload: {
      link: 'https://shopee.com.br/Balan%C3%A7a-Bioimpedancia-Digital-Bluetooth-Corporal-at%C3%A9-180kg-Resultado-Pelo-Celular-i.378143264.23696668795',
      source: 'whatsapp',
    },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [
    {
      link: 'https://shopee.com.br/Balan%C3%A7a-Bioimpedancia-Digital-Bluetooth-Corporal-at%C3%A9-180kg-Resultado-Pelo-Celular-i.378143264.23696668795',
      source: 'whatsapp',
    },
  ])
  assert.deepEqual(response.json(), {
    success: true,
    platform: 'shopee',
    itemId: '378143264:23696668795',
  })

  await app.close()
})

test('POST /api/offers/publish classifies a real Shopee Brasil slug link as platform shopee', async () => {
  const publishedItems = []
  const app = await buildApp({
    prisma: {
      session: {
        findUnique: async () => null,
      },
    },
    whatsappService: {
      restoreSessionsFromDB: async () => {},
    },
    offerIngestionService: createOfferIngestionService({
      marketplaceRouter: createMarketplaceRouter({
        handlers: {
          shopee: createShopeeHandler({
            fetchImpl: async () => ({
              ok: true,
              async text() {
                return `
                  <html>
                    <head>
                      <meta property="og:title" content="Balanca Bioimpedancia" />
                      <meta property="product:price:amount" content="79.90" />
                      <meta property="og:image" content="https://shopee.example/balanca.jpg" />
                    </head>
                    <body></body>
                  </html>
                `
              },
            }),
          }),
        },
      }),
      offerPublisher: {
        async publishItem(item) {
          publishedItems.push(item)
          return {
            skipped: false,
          }
        },
      },
    }),
    autoRestoreSessions: false,
    logger: false,
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/offers/publish',
    payload: {
      link: 'https://www.shopee.com.br/Balan%C3%A7a-Bioimpedancia-Digital-Bluetooth-Corporal-at%C3%A9-180kg-Resultado-Pelo-Celular-i.378143264.23696668795',
    },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    success: true,
    platform: 'shopee',
    itemId: '378143264:23696668795',
    skipped: false,
    reason: null,
  })
  assert.deepEqual(publishedItems, [
    {
      platform: 'shopee',
      id: '378143264:23696668795',
      title: 'Balanca Bioimpedancia',
      price: 79.9,
      currencyId: 'BRL',
      coupon: null,
      permalink: 'https://www.shopee.com.br/Balan%C3%A7a-Bioimpedancia-Digital-Bluetooth-Corporal-at%C3%A9-180kg-Resultado-Pelo-Celular-i.378143264.23696668795',
      thumbnailUrl: 'https://shopee.example/balanca.jpg',
    },
  ])

  await app.close()
})
