import test from 'node:test'
import assert from 'node:assert/strict'

import { formatOfferMessage } from '../../src/bot/format-offer-message.js'

test('formatOfferMessage adds emojis, coupon text, and keeps the affiliate URL isolated for WhatsApp preview detection', () => {
  const body = formatOfferMessage(
    {
      title: 'Notebook Gamer',
      price: 8999.9,
      currencyId: 'BRL',
      coupon: 'GAMER100',
    },
    'https://meli.la/1GHAQVQ',
  )

  assert.equal(body, [
    '🔥 PROMOÇÃO',
    '📦 Notebook Gamer',
    '💰 R$\u00A08.999,90',
    '',
    '🎟️ CUPOM: GAMER100',
    '',
    '👉 LINK:',
    'https://meli.la/1GHAQVQ',
  ].join('\n'))
})

test('formatOfferMessage falls back when there is no available coupon', () => {
  const body = formatOfferMessage(
    {
      title: 'Air Fryer',
      price: 299.9,
      currencyId: 'BRL',
    },
    'https://meli.la/2ABCDE',
  )

  assert.equal(body, [
    '🔥 PROMOÇÃO',
    '📦 Air Fryer',
    '💰 R$\u00A0299,90',
    '',
    '🎟️ CUPOM: SEM CUPOM DISPONIVEL',
    '',
    '👉 LINK:',
    'https://meli.la/2ABCDE',
  ].join('\n'))
})

test('formatOfferMessage identifies Amazon offers and includes discount when present', () => {
  const body = formatOfferMessage(
    {
      platform: 'amazon',
      title: 'Echo Dot',
      price: 249.9,
      currencyId: 'BRL',
      discountPercent: 38,
    },
    'https://www.amazon.com.br/dp/B0ABC12345?tag=tag-20',
  )

  assert.equal(body.includes('OFERTA AMAZON'), true)
  assert.equal(body.includes('38%'), true)
})

test('formatOfferMessage renders Amazon coupon value and code only when extracted', () => {
  const body = formatOfferMessage(
    {
      platform: 'amazon',
      title: 'Produto com cupom',
      price: 59.9,
      currencyId: 'BRL',
      coupons: [
        {
          coupon_value: 'R$20 off',
          coupon_code: 'VEMNOAPP',
          coupon_text: 'Aplicar cupom de R$20 off Insira o código VEMNOAPP',
        },
        {
          coupon_value: 'R$10 off',
          coupon_code: null,
          coupon_text: 'Cupom R$10 off disponível',
        },
      ],
    },
    'https://amzn.to/4sHAqQP',
  )

  assert.equal(body.includes('Cupom: R$20 off'), true)
  assert.equal(body.includes('Código: VEMNOAPP'), true)
  assert.equal(body.includes('Cupom: R$10 off'), true)
  assert.equal(body.includes('SEM CUPOM'), false)
})

test('formatOfferMessage does not render noisy Amazon coupon text from page scripts', () => {
  const body = formatOfferMessage(
    {
      platform: 'amazon',
      title: 'Samsung Smart TV 50" Crystal UHD 4K',
      price: 2499.9,
      currencyId: 'BRL',
      coupons: [
        {
          coupon_value: null,
          coupon_code: 'CLAMPER15',
          coupon_text: 'Oferta 90 dias de Amazon Music gratis incluso Termos [data-selector="cxcwPopoverLink"] { padding-left: 6px; } (function(f) { var _np = window.P._namespace("promotionCTC"); A.ajax("/promotion/signin/redeem", { params: "asin=B0F5X4LL89&anti-csrftoken-a2z=abc" }); })); Desconto de R$ 24,90 com o codigo CLAMPER15 e compra qualificada',
        },
      ],
    },
    'https://amzn.to/4mCMst5',
  )

  assert.equal(body.includes('CLAMPER15'), true)
  assert.equal(body.includes('promotionCTC'), false)
  assert.equal(body.includes('anti-csrftoken'), false)
  assert.equal(body.includes('A.ajax'), false)
  assert.equal(body.includes('padding-left'), false)
  assert.equal(body.includes('90 dias de Amazon Music'), false)
  assert.equal(body.includes('https://amzn.to/4mCMst5'), true)
})

test('formatOfferMessage omits Amazon coupon block when no coupon was extracted', () => {
  const body = formatOfferMessage(
    {
      platform: 'amazon',
      title: 'Produto sem cupom',
      price: 59.9,
      currencyId: 'BRL',
    },
    'https://amzn.to/4sHAqQP',
  )

  assert.equal(body.includes('CUPOM'), false)
  assert.equal(body.includes('Cupom:'), false)
})
