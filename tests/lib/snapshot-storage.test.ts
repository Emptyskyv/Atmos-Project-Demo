import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createLocalSnapshotStorage, toSnapshotBuffer } from '@/src/backend/storage/snapshots'

describe('createLocalSnapshotStorage', () => {
  let rootDir: string | null = null

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true })
      rootDir = null
    }
  })

  it('writes and reads snapshot blobs from the local filesystem', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'atoms-snapshots-'))
    const storage = createLocalSnapshotStorage({ rootDir })

    await storage.uploadSnapshot(
      'proj_1/snp_1.tar.gz',
      new Blob(['snapshot-bytes'], { type: 'application/gzip' }),
    )

    const storedBytes = await readFile(path.join(rootDir, 'proj_1', 'snp_1.tar.gz'), 'utf8')
    expect(storedBytes).toBe('snapshot-bytes')

    const downloaded = await storage.downloadSnapshot('proj_1/snp_1.tar.gz')
    expect((await toSnapshotBuffer(downloaded)).toString('utf8')).toBe('snapshot-bytes')
  })

  it('rejects path traversal storage keys', async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'atoms-snapshots-'))
    const storage = createLocalSnapshotStorage({ rootDir })

    await expect(
      storage.uploadSnapshot('../escape.tar.gz', new Blob(['bad-data'], { type: 'application/gzip' })),
    ).rejects.toThrow(/Invalid storage key/)
  })
})
