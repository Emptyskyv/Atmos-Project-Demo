// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProcessManager } from '@/src/backend/workspace/process-manager'

const tempDirs: string[] = []

async function createTempWorkspace() {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'atoms-process-manager-'))
  tempDirs.push(workspaceDir)
  return workspaceDir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      rm(dir, {
        recursive: true,
        force: true,
      }),
    ),
  )
})

describe('process manager', () => {
  it('returns a first-party preview path for long-running dev servers', async () => {
    const workspaceDir = await createTempWorkspace()
    const manager = createProcessManager()
    try {
      await writeFile(
        path.join(workspaceDir, 'serve.js'),
        'require("node:http").createServer((_, res) => res.end("ok")).listen(process.env.PORT, process.env.HOST); setInterval(() => {}, 1 << 30)\n',
      )

      const result = await manager.run('proj-preview', 'node serve.js', {
        workspaceDir,
      })

      expect(result.exitCode).toBe(0)
      expect(result.previewUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
      expect(manager.getPreviewUrl('proj-preview')).toBe(result.previewUrl)
    } finally {
      await manager.dispose('proj-preview')
    }
  })

  it('persists shell cwd and exported env across bash commands for a project', async () => {
    const workspaceDir = await createTempWorkspace()
    await mkdir(path.join(workspaceDir, 'subdir'))
    const manager = createProcessManager()
    try {
      await manager.run('proj-session', 'cd subdir && export ATOMS_SESSION_MARKER=hello-from-shell', {
        workspaceDir,
      })
      const result = await manager.run(
        'proj-session',
        'printf "%s\\n%s" "$(pwd)" "$ATOMS_SESSION_MARKER"',
        {
          workspaceDir,
        },
      )

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain(`${path.sep}subdir`)
      expect(result.output).toContain('hello-from-shell')
    } finally {
      await manager.dispose('proj-session')
    }
  })

  it('allows a later bash call to override the session cwd and carry that forward', async () => {
    const workspaceDir = await createTempWorkspace()
    await mkdir(path.join(workspaceDir, 'subdir-a'))
    await mkdir(path.join(workspaceDir, 'subdir-b'))
    const manager = createProcessManager()
    try {
      await manager.run('proj-override', 'cd subdir-a', {
        workspaceDir,
      })

      const overrideResult = await manager.run('proj-override', 'pwd', {
        workspaceDir,
        cwd: path.join(workspaceDir, 'subdir-b'),
      })
      const followupResult = await manager.run('proj-override', 'pwd', {
        workspaceDir,
      })

      expect(overrideResult.exitCode).toBe(0)
      expect(overrideResult.cwd).toContain(`${path.sep}subdir-b`)
      expect(followupResult.output).toContain(`${path.sep}subdir-b`)
    } finally {
      await manager.dispose('proj-override')
    }
  })
})
