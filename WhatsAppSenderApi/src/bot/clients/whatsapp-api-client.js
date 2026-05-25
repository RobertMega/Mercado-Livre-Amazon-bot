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

      const payload = await safeJson(response)

      if (!response.ok) {
        throw new Error(payload.error || `WhatsApp API returned status ${response.status}`)
      }

      return assertConfirmedSend(payload)
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

      const payload = await safeJson(response)

      if (!response.ok) {
        throw new Error(payload.error || `WhatsApp API returned status ${response.status}`)
      }

      return assertConfirmedSend(payload)
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

function assertConfirmedSend(payload) {
  if (payload?.success !== true) {
    throw new Error('WhatsApp API did not confirm send success')
  }

  if (!payload.messageId) {
    throw new Error('WhatsApp API returned success without a message id')
  }

  return payload
}
