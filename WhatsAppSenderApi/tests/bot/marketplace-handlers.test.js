import test from 'node:test'
import assert from 'node:assert/strict'

import { createMercadoLivreHandler } from '../../src/bot/handlers/mercado-livre-handler.js'
import { createShopeeHandler } from '../../src/bot/handlers/shopee-handler.js'

test('Mercado Livre handler enriches an offer with coupon', async () => {
  const handler = createMercadoLivreHandler({
    fetchImpl: async () => ({
      ok: true,
      async text() {
        return `
          <html>
            <head>
              <meta property="og:title" content="Notebook Gamer ML" />
              <meta property="product:price:amount" content="8999.90" />
              <meta property="og:image" content="https://ml.example/notebook.jpg" />
            </head>
            <body>
              Cupom ML100
            </body>
          </html>
        `
      },
    }),
  })

  const item = await handler.enrichOffer({
    url: 'https://www.mercadolivre.com.br/notebook-gamer/p/MLB123',
  })

  assert.deepEqual(item, {
    platform: 'mercado_livre',
    id: 'MLB123',
    title: 'Notebook Gamer ML',
    price: 8999.9,
    currencyId: 'BRL',
    coupon: 'ML100',
    permalink: 'https://www.mercadolivre.com.br/notebook-gamer/p/MLB123',
    thumbnailUrl: 'https://ml.example/notebook.jpg',
  })
})

test('Mercado Livre handler enriches an offer without coupon', async () => {
  const handler = createMercadoLivreHandler({
    fetchImpl: async () => ({
      ok: true,
      async text() {
        return `
          <html>
            <head>
              <meta property="og:title" content="Air Fryer ML" />
              <meta property="product:price:amount" content="299.90" />
              <meta property="og:image" content="https://ml.example/airfryer.jpg" />
            </head>
            <body></body>
          </html>
        `
      },
    }),
  })

  const item = await handler.enrichOffer({
    url: 'https://www.mercadolivre.com.br/air-fryer/p/MLB456',
  })

  assert.equal(item.platform, 'mercado_livre')
  assert.equal(item.id, 'MLB456')
  assert.equal(item.coupon, null)
})

test('Shopee handler enriches an offer with coupon', async () => {
  const handler = createShopeeHandler({
    fetchImpl: async () => ({
      ok: true,
      async text() {
        return `
          <html>
            <head>
              <meta property="og:title" content="Fone Gamer Shopee" />
              <meta property="product:price:amount" content="199.90" />
              <meta property="og:image" content="https://shopee.example/fone.jpg" />
            </head>
            <body>
              Use o cupom SHP10
            </body>
          </html>
        `
      },
    }),
  })

  const item = await handler.enrichOffer({
    url: 'https://shopee.com.br/product/123/456',
  })

  assert.deepEqual(item, {
    platform: 'shopee',
    id: '123:456',
    title: 'Fone Gamer Shopee',
    price: 199.9,
    currencyId: 'BRL',
    coupon: 'SHP10',
    permalink: 'https://shopee.com.br/product/123/456',
    thumbnailUrl: 'https://shopee.example/fone.jpg',
  })
})

test('Shopee handler enriches an offer without coupon', async () => {
  const handler = createShopeeHandler({
    fetchImpl: async () => ({
      ok: true,
      async text() {
        return `
          <html>
            <head>
              <meta property="og:title" content="Mouse Shopee" />
              <meta property="product:price:amount" content="89.90" />
              <meta property="og:image" content="https://shopee.example/mouse.jpg" />
            </head>
            <body></body>
          </html>
        `
      },
    }),
  })

  const item = await handler.enrichOffer({
    url: 'https://shopee.com.br/product/555/999',
  })

  assert.equal(item.platform, 'shopee')
  assert.equal(item.id, '555:999')
  assert.equal(item.coupon, null)
})

test('Shopee handler enriches a real shopee.com.br slug product url in i.<shopId>.<itemId> format', async () => {
  const handler = createShopeeHandler({
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
  })

  const item = await handler.enrichOffer({
    link: 'https://shopee.com.br/Balan%C3%A7a-Bioimpedancia-Digital-Bluetooth-Corporal-at%C3%A9-180kg-Resultado-Pelo-Celular-i.378143264.23696668795',
  })

  assert.deepEqual(item, {
    platform: 'shopee',
    id: '378143264:23696668795',
    title: 'Balanca Bioimpedancia',
    price: 79.9,
    currencyId: 'BRL',
    coupon: null,
    permalink: 'https://shopee.com.br/Balan%C3%A7a-Bioimpedancia-Digital-Bluetooth-Corporal-at%C3%A9-180kg-Resultado-Pelo-Celular-i.378143264.23696668795',
    thumbnailUrl: 'https://shopee.example/balanca.jpg',
  })
})

test('Shopee handler logs structured diagnostics and throws clear missing-fields error for shell HTML', async () => {
  const logs = []
  const handler = createShopeeHandler({
    fetchImpl: async () => ({
      ok: true,
      async text() {
        return `
          <!doctype html>
          <html>
            <head>
              <meta name="shopee:version" content="sw-WEBFE-MKP" />
            </head>
            <body>
              <script>window.__APP_ID__ = 1;</script>
              <div id="main"></div>
            </body>
          </html>
        `
      },
    }),
    logger: {
      warn(payload) {
        logs.push(payload)
      },
    },
  })

  await assert.rejects(
    () =>
      handler.enrichOffer({
        link: 'https://shopee.com.br/Balan%C3%A7a-Bioimpedancia-Digital-Bluetooth-Corporal-at%C3%A9-180kg-Resultado-Pelo-Celular-i.378143264.23696668795',
      }),
    /Could not extract required shopee offer metadata: missing title, price/,
  )

  assert.equal(logs.length, 1)
  assert.deepEqual(logs[0], {
    event: 'shopee_metadata_incomplete',
    platform: 'shopee',
    permalink: 'https://shopee.com.br/Balan%C3%A7a-Bioimpedancia-Digital-Bluetooth-Corporal-at%C3%A9-180kg-Resultado-Pelo-Celular-i.378143264.23696668795',
    found: {
      id: '378143264:23696668795',
      title: null,
      price: null,
      thumbnailUrl: null,
    },
    missing: ['title', 'price'],
    sources: {
      id: 'url_slug',
      title: null,
      price: null,
      thumbnailUrl: null,
    },
  })
})
