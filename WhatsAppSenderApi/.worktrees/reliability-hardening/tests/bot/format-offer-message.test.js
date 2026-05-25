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
