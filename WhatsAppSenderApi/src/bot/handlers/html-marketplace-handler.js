function decodeHtml(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .trim()
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function extractMetaContent(html, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, 'i'),
      new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["']`, 'i'),
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match?.[1]) {
        return decodeHtml(match[1])
      }
    }
  }

  return ''
}

function extractTitleTag(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1] ? stripTags(match[1]) : ''
}

function normalizePrice(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== 'string') {
    return null
  }

  const digits = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')

  const price = Number.parseFloat(digits)
  return Number.isFinite(price) ? price : null
}

function extractCoupon(html) {
  const patterns = [
    /cupom[:\s-]+([A-Z0-9$% ]{3,})/i,
    /coupon[:\s-]+([A-Z0-9$% ]{3,})/i,
    /use o cupom[:\s-]+([A-Z0-9$% ]{3,})/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    const coupon = match?.[1]?.replace(/\s+/g, ' ').trim()
    if (coupon) {
      return coupon
    }
  }

  return null
}

function normalizeUrl(url) {
  try {
    const parsedUrl = new URL(url)
    parsedUrl.hash = ''
    return parsedUrl.toString()
  } catch {
    return url
  }
}

async function fetchHtml(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    },
  })

  if (!response.ok) {
    throw new Error(`Offer page request failed with status ${response.status}`)
  }

  return response.text()
}

function resolveValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

export function createHtmlMarketplaceHandler({
  platform,
  idResolver,
  fetchImpl = fetch,
} = {}) {
  return {
    async enrichOffer(input) {
      const metadata = input.metadata || {}
      const permalink = normalizeUrl(resolveValue(input.url, input.link, metadata.url, metadata.permalink) || '')

      if (!permalink) {
        throw new Error('Incoming offer is missing a supported url')
      }

      const html = await fetchHtml(fetchImpl, permalink)
      const title = resolveValue(
        metadata.title,
        metadata.productName,
        extractMetaContent(html, ['og:title', 'twitter:title']),
        extractTitleTag(html),
      )
      const price = normalizePrice(resolveValue(
        metadata.price,
        extractMetaContent(html, ['product:price:amount', 'og:price:amount']),
      ))
      const thumbnailUrl = resolveValue(
        metadata.thumbnailUrl,
        metadata.image,
        extractMetaContent(html, ['og:image', 'twitter:image']),
      ) || ''
      const coupon = resolveValue(metadata.coupon, extractCoupon(html))
      const itemId = resolveValue(metadata.id, idResolver(permalink, html))

      if (!title || price === null || !itemId) {
        throw new Error(`Could not extract required ${platform} offer metadata`)
      }

      return {
        platform,
        id: String(itemId),
        title,
        price,
        currencyId: resolveValue(metadata.currencyId, 'BRL'),
        coupon: typeof coupon === 'string' ? coupon : null,
        permalink,
        thumbnailUrl,
      }
    },
  }
}
