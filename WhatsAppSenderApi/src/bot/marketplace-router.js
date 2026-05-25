function normalizeMarketplace(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (normalized.includes('mercado') || normalized === 'ml' || normalized === 'meli') {
    return 'mercado_livre'
  }

  if (normalized.includes('shopee')) {
    return 'shopee'
  }

  if (normalized.includes('amazon')) {
    return 'amazon'
  }

  return null
}

function extractHost(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return ''
  }

  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function resolveOfferUrl({ url = '', link = '', metadata = {} } = {}) {
  if (typeof url === 'string' && url.trim()) {
    return url
  }

  if (typeof link === 'string' && link.trim()) {
    return link
  }

  if (typeof metadata?.url === 'string' && metadata.url.trim()) {
    return metadata.url
  }

  if (typeof metadata?.permalink === 'string' && metadata.permalink.trim()) {
    return metadata.permalink
  }

  return ''
}

export function detectMarketplace({ url = '', link = '', source = '', metadata = {} } = {}) {
  const resolvedUrl = resolveOfferUrl({ url, link, metadata })
  const host = extractHost(resolvedUrl)

  if (host.includes('mercadolivre.com') || host.includes('mercadolibre.com') || host.includes('meli.la')) {
    return 'mercado_livre'
  }

  if (host.includes('shopee')) {
    return 'shopee'
  }

  if (host.includes('amazon.')) {
    return 'amazon'
  }

  return normalizeMarketplace(metadata.platform) || normalizeMarketplace(source) || null
}

export function createMarketplaceRouter({
  handlers = {},
} = {}) {
  return {
    async enrichOffer(input) {
      const marketplace = detectMarketplace(input)

      if (!marketplace || !handlers[marketplace]?.enrichOffer) {
        throw new Error('Unsupported marketplace offer')
      }

      return handlers[marketplace].enrichOffer(input)
    },
  }
}
