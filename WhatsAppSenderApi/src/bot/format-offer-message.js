import { buildOfferBody } from './build-offer-body.js'

export function formatOfferMessage(item, affiliateLink) {
  return buildOfferBody(item, affiliateLink)
}
