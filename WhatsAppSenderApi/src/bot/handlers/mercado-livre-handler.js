import { createHtmlMarketplaceHandler } from './html-marketplace-handler.js'

function resolveMercadoLivreId(url, html) {
  const urlMatch = url.match(/\/p\/(MLB[\w-]+)/i) || url.match(/(MLB[\w-]+)/i)
  if (urlMatch?.[1]) {
    return urlMatch[1].toUpperCase()
  }

  const htmlMatch = html.match(/MLB[\w-]+/i)
  return htmlMatch?.[0]?.toUpperCase() || null
}

export function createMercadoLivreHandler(options = {}) {
  return createHtmlMarketplaceHandler({
    platform: 'mercado_livre',
    idResolver: resolveMercadoLivreId,
    ...options,
  })
}
