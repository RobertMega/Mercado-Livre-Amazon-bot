function applyTemplate(template, item) {
  return template
    .replaceAll('{{url}}', encodeURIComponent(item.permalink))
    .replaceAll('{{id}}', item.id)
}

export function createMarketplaceAffiliateProvider({
  providers = {},
  shopee = {},
} = {}) {
  return {
    async getAffiliateLink(item) {
      if (item.platform === 'shopee') {
        if (shopee?.getAffiliateLink) {
          try {
            return await shopee.getAffiliateLink(item)
          } catch (error) {
            if (!shopee.templateUrl) {
              throw error
            }
          }
        }

        if (!shopee.templateUrl) {
          throw new Error('Missing required affiliate configuration: SHOPEE_AFFILIATE_URL_TEMPLATE')
        }

        return applyTemplate(shopee.templateUrl, item)
      }

      const provider = providers[item.platform || 'mercado_livre']

      if (!provider?.getAffiliateLink) {
        throw new Error(`Missing affiliate provider for platform: ${item.platform || 'mercado_livre'}`)
      }

      return provider.getAffiliateLink(item)
    },
    async close() {
      await Promise.all(
        Object.values(providers).map((provider) => provider?.close?.()),
      )
    },
  }
}
