function applyTemplate(template, item) {
  return template
    .replaceAll('{{url}}', encodeURIComponent(item.permalink))
    .replaceAll('{{id}}', item.id)
}

export function normalizeShopeePermalink(permalink) {
  try {
    const url = new URL(permalink)
    url.hash = ''
    return url.toString()
  } catch {
    return permalink
  }
}

function resolveTemplateLink(templateUrl, item) {
  if (typeof templateUrl !== 'string' || !templateUrl.trim()) {
    return ''
  }

  return applyTemplate(templateUrl, item).trim()
}

function logFallback(logger, message) {
  logger?.warn?.(message)
}

export function createShopeeAffiliateLinkResolver({
  officialGenerator = null,
  templateUrl = '',
  logger = console,
} = {}) {
  function resolveFallback(item, reason) {
    const templateLink = resolveTemplateLink(templateUrl, item)

    if (templateLink) {
      logFallback(
        logger,
        `Shopee publicada em modo fallback usando template de afiliado. Motivo: ${reason}`,
      )
      return templateLink
    }

    logFallback(
      logger,
      `Shopee publicada em modo fallback usando URL original. Motivo: ${reason}`,
    )
    return item.permalink
  }

  return {
    async resolve(item) {
      const normalizedItem = {
        ...item,
        permalink: normalizeShopeePermalink(item.permalink),
      }

      if (!officialGenerator?.generateAffiliateLink) {
        return resolveFallback(normalizedItem, 'gerador oficial nao configurado')
      }

      try {
        const generatedLink = await officialGenerator.generateAffiliateLink({
          item,
          url: normalizedItem.permalink,
        })

        if (typeof generatedLink === 'string' && generatedLink.trim()) {
          return generatedLink.trim()
        }

        return resolveFallback(normalizedItem, 'gerador oficial retornou link vazio')
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        return resolveFallback(normalizedItem, reason)
      }
    },
    async close() {
      await officialGenerator?.close?.()
    },
  }
}
