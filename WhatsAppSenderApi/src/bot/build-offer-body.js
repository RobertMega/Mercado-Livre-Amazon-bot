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

function resolveHeadline(item) {
  return item.platform === 'amazon' ? '🔥 OFERTA AMAZON' : '🔥 PROMOÇÃO'
}

function resolveDiscountLine(item) {
  if (!Number.isFinite(item.discountPercent) || !(item.discountPercent > 0)) {
    return null
  }

  return `DESCONTO: ${item.discountPercent}%`
}

function normalizeAmazonCoupons(item) {
  if (Array.isArray(item.coupons) && item.coupons.length) {
    return item.coupons
      .slice(0, 2)
      .map((coupon) => ({
        coupon_value: coupon.coupon_value || coupon.couponValue || null,
        coupon_code: coupon.coupon_code || coupon.couponCode || null,
        coupon_text: coupon.coupon_text || coupon.couponText || null,
      }))
      .filter((coupon) => coupon.coupon_value || coupon.coupon_code || coupon.coupon_text)
  }

  if (item.coupon_value || item.coupon_code || item.coupon_text) {
    return [{
      coupon_value: item.coupon_value || null,
      coupon_code: item.coupon_code || null,
      coupon_text: item.coupon_text || null,
    }]
  }

  return []
}

function isNoisyAmazonCouponText(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) {
    return false
  }

  return text.length > 180 ||
    /function\s*\(|A\.ajax|anti-csrftoken|data-selector|window\.|promotionId|offerListingId|padding-left|cxcw/i.test(text)
}

function buildAmazonCouponLines(item) {
  const coupons = normalizeAmazonCoupons(item)
  const lines = []

  for (const coupon of coupons) {
    const couponValue = coupon.coupon_value || (
      isNoisyAmazonCouponText(coupon.coupon_text) ? null : coupon.coupon_text
    )
    if (couponValue) {
      lines.push(`🎟️ Cupom: ${couponValue}`)
    }
    if (coupon.coupon_code) {
      lines.push(`🏷️ Código: ${coupon.coupon_code}`)
    }
  }

  return lines
}

export function buildOfferBody(item, affiliateLink) {
  const baseLines = [
    resolveHeadline(item),
    `📦 ${item.title}`,
    `💰 ${formatPrice(item.price, item.currencyId || 'BRL')}`,
    resolveDiscountLine(item),
  ].filter((line) => line !== null)

  const couponLines = item.platform === 'amazon'
    ? buildAmazonCouponLines(item)
    : [`🎟️ CUPOM: ${resolveCouponLabel(item)}`]

  return [
    ...baseLines,
    '',
    ...couponLines,
    ...(couponLines.length ? [''] : []),
    '👉 LINK:',
    affiliateLink,
  ].join('\n')
}
