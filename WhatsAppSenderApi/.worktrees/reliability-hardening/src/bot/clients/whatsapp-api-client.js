export function createWhatsappApiClient({
  baseUrl,
  fetchImpl = fetch,
} = {}) {
  return {
    async sendTextMessage({ sessionId, to, body, linkPreview }) {
      const response = await fetchImpl(new URL('/api/chat/send/text', baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          token: sessionId,
        },
        body: JSON.stringify({
          Phone: to,
          Body: body,
          LinkPreview: linkPreview,
        }),
      })

      if (!response.ok) {
        const payload = await safeJson(response)
        throw new Error(payload.error || `WhatsApp API returned status ${response.status}`)
      }

      return response.json()
    },
    async sendImageMessage({ sessionId, to, caption = '', imageBase64 }) {
      const response = await fetchImpl(new URL('/api/chat/send/image', baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          token: sessionId,
        },
        body: JSON.stringify({
          Phone: to,
          Caption: caption,
          Image: imageBase64,
        }),
      })

      if (!response.ok) {
        const payload = await safeJson(response)
        throw new Error(payload.error || `WhatsApp API returned status ${response.status}`)
      }

      return response.json()
    },
  }
}

async function safeJson(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}
