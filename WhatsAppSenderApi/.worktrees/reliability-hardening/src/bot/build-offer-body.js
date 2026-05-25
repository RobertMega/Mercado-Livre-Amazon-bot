function formatPrice(price, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(price)
}

function resolveCouponLabel(item) {
  const coupon = typeof item.coupon === 'string' ? item.coupon.trim() : ''
  return coupon || 'SEM CUPOM DISPONIVEL'
}

export function buildOfferBody(item, affiliateLink) {
  return [
    '🔥 PROMOÇÃO',
    `📦 ${item.title}`,
    `💰 ${formatPrice(item.price, item.currencyId || 'BRL')}`,
    '',
    `🎟️ CUPOM: ${resolveCouponLabel(item)}`,
    '',
    '👉 LINK:',
    affiliateLink,
  ].join('\n')
}
