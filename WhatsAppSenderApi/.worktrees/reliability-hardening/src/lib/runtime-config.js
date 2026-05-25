const MB = 1024 * 1024

function parseBytes(value, fallbackBytes) {
  const parsed = Number.parseInt(value, 10)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackBytes
  }

  return parsed
}

export function getRuntimeConfig(env = process.env) {
  return {
    apiToken: env.API_TOKEN?.trim() || '',
    panelToken: env.PANEL_TOKEN?.trim() || '',
    bodyLimitBytes: parseBytes(env.APP_BODY_LIMIT_BYTES, 25 * MB),
    multipartFileSizeBytes: parseBytes(env.APP_MULTIPART_FILE_SIZE_BYTES, 25 * MB),
  }
}
