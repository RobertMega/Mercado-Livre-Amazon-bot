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

import { extractShopeeMetadata } from './shopee-metadata-extractor.js'

export function createShopeeHandler({
  fetchImpl = fetch,
  logger = console,
} = {}) {
  return {
    async enrichOffer(input) {
      const metadata = input.metadata || {}
      const permalink = normalizeUrl(resolveValue(input.url, input.link, metadata.url, metadata.permalink) || '')

      if (!permalink) {
        throw new Error('Incoming offer is missing a supported url')
      }

      const html = await fetchHtml(fetchImpl, permalink)
      const coupon = resolveValue(metadata.coupon, extractCoupon(html))
      const diagnostic = extractShopeeMetadata({
        permalink,
        html,
        metadata,
      })

      if (diagnostic.missing.length) {
        logger.warn?.({
          event: 'shopee_metadata_incomplete',
          platform: 'shopee',
          permalink,
          found: diagnostic.found,
          missing: diagnostic.missing.filter((field) => field !== 'thumbnailUrl'),
          sources: diagnostic.sources,
        })

        const requiredMissing = diagnostic.missing.filter((field) => field !== 'thumbnailUrl')
        if (requiredMissing.length) {
          throw new Error(
            `Could not extract required shopee offer metadata: missing ${requiredMissing.join(', ')}`,
          )
        }
      }

      return {
        platform: 'shopee',
        id: String(diagnostic.found.id),
        title: diagnostic.found.title,
        price: diagnostic.found.price,
        currencyId: resolveValue(metadata.currencyId, 'BRL'),
        coupon: typeof coupon === 'string' ? coupon : null,
        permalink,
        thumbnailUrl: diagnostic.found.thumbnailUrl || '',
      }
    },
  }
}
