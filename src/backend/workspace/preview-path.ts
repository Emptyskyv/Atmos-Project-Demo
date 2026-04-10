export function buildPreviewProxyBasePath(projectId: string) {
  return `/preview/${encodeURIComponent(projectId)}`
}

export function resolvePreviewTargetOrigin(previewUrl: string | null | undefined) {
  if (!previewUrl) {
    return null
  }

  try {
    const parsedUrl = new URL(previewUrl)

    if (parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === 'localhost') {
      return parsedUrl.origin
    }
  } catch {
    return null
  }

  return null
}

export function toPublicPreviewUrl(projectId: string, previewUrl: string | null | undefined) {
  if (!previewUrl) {
    return null
  }

  return resolvePreviewTargetOrigin(previewUrl)
    ? buildPreviewProxyBasePath(projectId)
    : previewUrl
}
