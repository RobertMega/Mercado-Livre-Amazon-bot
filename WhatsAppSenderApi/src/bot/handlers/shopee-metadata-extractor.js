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

function resolveShopeeId(url, html) {
  const urlMatch = url.match(/\/product\/(\d+)\/(\d+)/i)
  if (urlMatch) {
    return {
      value: `${urlMatch[1]}:${urlMatch[2]}`,
      source: 'url_path',
    }
  }

  const slugMatch = url.match(/-i\.(\d+)\.(\d+)(?:[/?#]|$)/i)
  if (slugMatch) {
    return {
      value: `${slugMatch[1]}:${slugMatch[2]}`,
      source: 'url_slug',
    }
  }

  const itemIdMatch = html.match(/"itemid"\s*:\s*(\d+)/i)
  const shopIdMatch = html.match(/"shopid"\s*:\s*(\d+)/i)

  if (shopIdMatch?.[1] && itemIdMatch?.[1]) {
    return {
      value: `${shopIdMatch[1]}:${itemIdMatch[1]}`,
      source: 'html_json',
    }
  }

  return {
    value: null,
    source: null,
  }
}

function resolveMissing({ id, title, price }) {
  const missing = []

  if (!id) {
    missing.push('id')
  }

  if (!title) {
    missing.push('title')
  }

  if (price === null) {
    missing.push('price')
  }

  return missing
}

export function extractShopeeMetadata({ permalink, html, metadata = {} } = {}) {
  const id = metadata.id
    ? { value: String(metadata.id), source: 'metadata.id' }
    : resolveShopeeId(permalink, html)

  const titleFromMeta = extractMetaContent(html, ['og:title', 'twitter:title'])
  const title = typeof metadata.title === 'string' && metadata.title.trim()
    ? metadata.title.trim()
    : typeof metadata.productName === 'string' && metadata.productName.trim()
      ? metadata.productName.trim()
      : titleFromMeta || extractTitleTag(html) || null

  const titleSource = typeof metadata.title === 'string' && metadata.title.trim()
    ? 'metadata.title'
    : typeof metadata.productName === 'string' && metadata.productName.trim()
      ? 'metadata.productName'
      : titleFromMeta
        ? 'meta.og:title'
        : extractTitleTag(html)
          ? 'html.title'
          : null

  const priceMeta = extractMetaContent(html, ['product:price:amount', 'og:price:amount'])
  const normalizedPrice = normalizePrice(
    metadata.price !== undefined && metadata.price !== null
      ? metadata.price
      : priceMeta,
  )
  const priceSource = metadata.price !== undefined && metadata.price !== null
    ? 'metadata.price'
    : priceMeta
      ? 'meta.product:price:amount'
      : null

  const imageMeta = extractMetaContent(html, ['og:image', 'twitter:image'])
  const thumbnailUrl = typeof metadata.thumbnailUrl === 'string' && metadata.thumbnailUrl.trim()
    ? metadata.thumbnailUrl.trim()
    : typeof metadata.image === 'string' && metadata.image.trim()
      ? metadata.image.trim()
      : imageMeta || null

  const thumbnailSource = typeof metadata.thumbnailUrl === 'string' && metadata.thumbnailUrl.trim()
    ? 'metadata.thumbnailUrl'
    : typeof metadata.image === 'string' && metadata.image.trim()
      ? 'metadata.image'
      : imageMeta
        ? 'meta.og:image'
        : null

  const found = {
    id: id.value,
    title,
    price: normalizedPrice,
    thumbnailUrl,
  }

  return {
    found,
    missing: resolveMissing(found),
    sources: {
      id: id.source,
      title: titleSource,
      price: priceSource,
      thumbnailUrl: thumbnailSource,
    },
  }
}
