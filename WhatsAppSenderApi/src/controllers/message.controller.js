// src/controllers/message.controller.js
import * as defaultWhatsappService from '../services/whatsapp.service.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function isMultipart(req) {
  return req.headers['content-type']?.includes('multipart/form-data')
}

/**
 * Parses a base64 string (with or without data URI prefix) into a Buffer.
 * Accepts:
 *   "data:image/jpeg;base64,/9j/4AAQ..."
 *   "/9j/4AAQ..."
 */
function base64ToBuffer(b64) {
  const raw = b64.includes(',') ? b64.split(',')[1] : b64
  return Buffer.from(raw, 'base64')
}

/**
 * Extracts mimetype from a data URI prefix.
 * "data:application/pdf;base64,..." → "application/pdf"
 */
function mimeFromDataUri(b64) {
  const match = b64.match(/^data:([^;]+);base64,/)
  return match ? match[1] : null
}

function getSessionId(req) {
  // HTTP headers are always strings (lowercased), so if the client sends a JSON object,
  // it will arrive as a string. We support either a plain sessionId string or a JSON
  // object like '{"id":"..."}'.
  let token = req.headers['token'] || req.params?.id
  if (!token) return null

  if (typeof token === 'string' && token.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(token)
      return parsed?.id ?? parsed?.sessionId ?? null
    } catch {
      // fall through
    }
  }

  return token
}

// ─── Controllers ────────────────────────────────────────────────────────────

export async function sendText(req, reply, whatsapp = defaultWhatsappService) {
  const id = getSessionId(req)

  if (!id) {
    return reply.code(400).send({ error: 'Missing session id in header "token" or URL param "id"' })
  }

  const { Phone, Body, LinkPreview } = req.body

  if (!Phone || !Body) {
    return reply.code(400).send({ error: 'Fields "Phone" and "Body" are required' })
  }

  try {
    const result = await whatsapp.sendTextMessage(id, Phone, Body, LinkPreview)
    return reply.send(result)
  } catch (err) {
    return reply.code(500).send({ error: err.message })
  }
}

export async function sendImage(req, reply, whatsapp = defaultWhatsappService) {
  const id = getSessionId(req)
  if (!id) {
    return reply.code(400).send({ error: 'Missing session id in header "token" or URL param "id"' })
  }

  let Phone, Caption, Image

  if (isMultipart(req)) {
    // ── multipart/form-data ──────────────────────────────────────────────
    const parts = req.parts()

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'to')      Phone      = part.value
        if (part.fieldname === 'caption') Caption = part.value
      } else if (part.type === 'file' && part.fieldname === 'image') {
        const chunks = []
        for await (const chunk of part.file) chunks.push(chunk)
        Image = Buffer.concat(chunks)
      }
    }

    if (!Phone || !Image) {
      return reply.code(400).send({ error: 'Fields "Phone" and "image" (file) are required' })
    }
  } else {
    // ── application/json  (base64) ───────────────────────────────────────
    const body = req.body
    Phone      = body?.Phone
    Caption = body?.Caption

    if (!Phone || !body?.Image) {
      return reply.code(400).send({
        error: 'Fields "Phone" and "Image" (base64 string) are required',
      })
    }

    try {
      Image = base64ToBuffer(body.Image)
    } catch {
      return reply.code(400).send({ error: 'Invalid base64 value in "Image"' })
    }
  }

  try {
    const result = await whatsapp.sendImageMessage(id, Phone, Image, Caption)
    return reply.send(result)
  } catch (err) {
    return reply.code(500).send({ error: err.message })
  }
}

export async function sendFile(req, reply) {
  const id = getSessionId(req)
  if (!id) {
    return reply.code(400).send({ error: 'Missing session id in header "token" or URL param "id"' })
  }

  let Phone, Document, FileName, mimetype

  if (isMultipart(req)) {
    // ── multipart/form-data ──────────────────────────────────────────────
    const parts = req.parts()

    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'to') Phone = part.value
      } else if (part.type === 'file' && part.fieldname === 'file') {
        FileName = part.filename
        mimetype = part.mimetype
        const chunks = []
        for await (const chunk of part.file) chunks.push(chunk)
        Document = Buffer.concat(chunks)
      }
    }

    if (!Phone || !Document) {
      return reply.code(400).send({ error: 'Fields "Phone" and "Document" are required' })
    }
  } else {
    // ── application/json  (base64) ───────────────────────────────────────
    const body = req.body
    Phone       = body?.Phone
    FileName = body?.FileName

    if (!Phone || !body?.Document) {
      return reply.code(400).send({
        error: 'Fields "Phone", "Document" (base64 string) and "FileName" are required',
      })
    }

    if (!FileName) {
      return reply.code(400).send({ error: 'Field "FileName" is required when sending base64' })
    }

    // Try to get mimetype from data URI, fallback to octet-stream
    mimetype = mimeFromDataUri(body.Document) ?? body.mimetype ?? 'application/octet-stream'

    try {
      Document = base64ToBuffer(body.Document)
    } catch {
      return reply.code(400).send({ error: 'Invalid base64 value in "Document"' })
    }
  }

  try {
    const result = await whatsapp.sendFileMessage(id, Phone, Document, FileName, mimetype)
    return reply.send(result)
  } catch (err) {
    return reply.code(500).send({ error: err.message })
  }
}
