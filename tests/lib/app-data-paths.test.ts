// @vitest-environment node

import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAppDataRootDir } from '@/src/backend/platform/data-root'

describe('resolveAppDataRootDir', () => {
  it('defaults to the repository .data directory when no deployment-specific env is set', () => {
    expect(resolveAppDataRootDir({}, '/workspace/atoms')).toBe('/workspace/atoms/.data')
  })

  it('prefers an explicit ATOMS_DATA_ROOT when provided', () => {
    expect(
      resolveAppDataRootDir(
        {
          ATOMS_DATA_ROOT: './runtime-data',
          RAILWAY_VOLUME_MOUNT_PATH: '/railway/volume',
        },
        '/workspace/atoms',
      ),
    ).toBe(path.resolve('/workspace/atoms', 'runtime-data'))
  })

  it('uses the Railway volume mount path when available', () => {
    expect(
      resolveAppDataRootDir(
        {
          RAILWAY_VOLUME_MOUNT_PATH: '/railway/volume',
        },
        '/workspace/atoms',
      ),
    ).toBe('/railway/volume/atoms')
  })
})
