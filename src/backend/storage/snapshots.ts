import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveAppDataPath } from '@/src/backend/platform/data-root'

type LocalSnapshotStorageOptions = {
  rootDir?: string
}

async function toSnapshotBuffer(file: Blob) {
  const blobLike = file as Blob & {
    arrayBuffer?: () => Promise<ArrayBuffer>
    text?: () => Promise<string>
  }

  if (typeof blobLike.arrayBuffer === 'function') {
    return Buffer.from(await blobLike.arrayBuffer())
  }

  if (typeof blobLike.text === 'function') {
    return Buffer.from(await blobLike.text())
  }

  if (typeof FileReader !== 'undefined') {
    return await new Promise<Buffer>((resolve, reject) => {
      const reader = new FileReader()

      reader.onerror = () => {
        reject(reader.error ?? new Error('Failed to read snapshot blob'))
      }
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(Buffer.from(reader.result))
          return
        }

        if (typeof reader.result === 'string') {
          resolve(Buffer.from(reader.result))
          return
        }

        reject(new Error('Unsupported snapshot blob'))
      }

      reader.readAsArrayBuffer(file)
    })
  }

  throw new Error('Unsupported snapshot blob')
}

function resolveStoragePath(rootDir: string, storageKey: string) {
  const normalizedStorageKey = path.posix.normalize(storageKey)

  if (
    normalizedStorageKey === '' ||
    normalizedStorageKey === '.' ||
    normalizedStorageKey.startsWith('../') ||
    normalizedStorageKey.includes('/../')
  ) {
    throw new Error('Invalid storage key')
  }

  const resolvedRoot = path.resolve(rootDir)
  const resolvedPath = path.resolve(resolvedRoot, normalizedStorageKey)

  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Invalid storage key')
  }

  return resolvedPath
}

function getDefaultSnapshotRootDir() {
  return resolveAppDataPath('snapshots')
}

export function createLocalSnapshotStorage({ rootDir = getDefaultSnapshotRootDir() }: LocalSnapshotStorageOptions = {}) {
  return {
    async uploadSnapshot(storageKey: string, file: Blob) {
      const destinationPath = resolveStoragePath(rootDir, storageKey)
      await mkdir(path.dirname(destinationPath), { recursive: true })
      await writeFile(destinationPath, await toSnapshotBuffer(file))
    },
    async downloadSnapshot(storageKey: string) {
      const sourcePath = resolveStoragePath(rootDir, storageKey)
      const contents = await readFile(sourcePath)
      return new Blob([contents], { type: 'application/gzip' })
    },
  }
}

const defaultSnapshotStorage = createLocalSnapshotStorage()

export const uploadSnapshot = defaultSnapshotStorage.uploadSnapshot
export const downloadSnapshot = defaultSnapshotStorage.downloadSnapshot
export { toSnapshotBuffer }

export function buildSnapshotFileUrl(snapshotId: string) {
  return `/api/snapshots/${snapshotId}/file`
}
