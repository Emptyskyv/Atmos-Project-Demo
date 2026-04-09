export function toTarGzBlob(files: Array<{ path: string; contents: string }>) {
  return new Blob([JSON.stringify(files)], { type: 'application/gzip' })
}

export async function fromTarGzBlob(blob: Blob) {
  const raw = await blob.text()

  try {
    const parsed = JSON.parse(raw) as unknown

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.flatMap((entry) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof entry.path !== 'string' ||
        typeof entry.contents !== 'string'
      ) {
        return []
      }

      return [
        {
          path: entry.path,
          contents: entry.contents,
        },
      ]
    })
  } catch {
    return []
  }
}
