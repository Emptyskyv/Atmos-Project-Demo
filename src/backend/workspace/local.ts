import { spawn } from 'node:child_process'
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { downloadSnapshot } from '@/src/backend/storage/snapshots'
import { fromTarGzBlob } from '@/src/frontend/workspace/tarball'

export type WorkspaceFile = {
  path: string
  contents: string
}

export type WorkspaceEntry = {
  path: string
  type: 'file' | 'directory'
}

type LocalWorkspaceOptions = {
  rootDir?: string
  downloadSnapshotFile?: typeof downloadSnapshot
}

const WORKSPACE_MARKER = '.atoms-workspace.json'
const IGNORED_SEGMENTS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  '.turbo',
])

function getDefaultWorkspaceRootDir() {
  return path.join(process.cwd(), '.data', 'workspaces')
}

function normalizeProjectId(projectId: string) {
  return projectId.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function isIgnoredRelativePath(relativePath: string) {
  if (!relativePath || relativePath === WORKSPACE_MARKER) {
    return true
  }

  return relativePath
    .split('/')
    .some((segment) => IGNORED_SEGMENTS.has(segment))
}

function toRelativeWorkspacePath(rootDir: string, absolutePath: string) {
  return path.relative(rootDir, absolutePath).split(path.sep).join('/')
}

async function pathExists(targetPath: string) {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

function splitLines(contents: string) {
  return contents.split(/\r?\n/)
}

async function collectWorkspaceFiles(rootDir: string, currentDir = rootDir): Promise<WorkspaceFile[]> {
  const entries = await readdir(currentDir, { withFileTypes: true })
  const files: WorkspaceFile[] = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(currentDir, entry.name)
    const relativePath = toRelativeWorkspacePath(rootDir, absolutePath)

    if (isIgnoredRelativePath(relativePath)) {
      continue
    }

    if (entry.isDirectory()) {
      files.push(...(await collectWorkspaceFiles(rootDir, absolutePath)))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    files.push({
      path: relativePath,
      contents: await readFile(absolutePath, 'utf8'),
    })
  }

  return files
}

async function collectWorkspaceEntries(rootDir: string, targetDir: string): Promise<WorkspaceEntry[]> {
  const entries = await readdir(targetDir, { withFileTypes: true })

  return entries
    .map((entry) => {
      const absolutePath = path.join(targetDir, entry.name)
      const relativePath = toRelativeWorkspacePath(rootDir, absolutePath)

      if (isIgnoredRelativePath(relativePath)) {
        return null
      }

      return {
        path: relativePath,
        type: entry.isDirectory() ? 'directory' : 'file',
      } satisfies WorkspaceEntry
    })
    .filter((entry): entry is WorkspaceEntry => entry !== null)
    .sort((left, right) => left.path.localeCompare(right.path))
}

function createLineRange(contents: string, startLine?: number, endLine?: number) {
  if (!startLine && !endLine) {
    return contents
  }

  const lines = splitLines(contents)
  const startIndex = Math.max((startLine ?? 1) - 1, 0)
  const endIndex = Math.min(endLine ?? lines.length, lines.length)
  return lines.slice(startIndex, endIndex).join('\n')
}

async function runPatchCommand(workspaceDir: string, patch: string, stripCount: number) {
  const child = spawn('patch', [`-p${stripCount}`, '--forward', '--reject-file=-'], {
    cwd: workspaceDir,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  child.stdin.write(patch)
  child.stdin.end()

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolve(code ?? 1))
  })

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  }
}

function extractPatchedPaths(patch: string) {
  const changedPaths = new Set<string>()

  for (const line of patch.split(/\r?\n/)) {
    if (!line.startsWith('+++ ')) {
      continue
    }

    const candidate = line.slice(4).trim().split('\t')[0]
    if (!candidate || candidate === '/dev/null') {
      continue
    }

    changedPaths.add(candidate.replace(/^b\//, '').replace(/^a\//, ''))
  }

  return [...changedPaths]
}

export function createLocalWorkspace({
  rootDir = getDefaultWorkspaceRootDir(),
  downloadSnapshotFile = downloadSnapshot,
}: LocalWorkspaceOptions = {}) {
  async function ensureProjectRoot(projectId: string) {
    const projectRoot = path.join(rootDir, normalizeProjectId(projectId))
    await mkdir(projectRoot, { recursive: true })
    return projectRoot
  }

  async function resolveWorkspacePath(projectId: string, relativePath = '.') {
    const projectRoot = await ensureProjectRoot(projectId)
    const normalizedPath = relativePath === '.' ? '.' : path.posix.normalize(relativePath)
    const absolutePath = path.resolve(projectRoot, normalizedPath)

    if (absolutePath !== projectRoot && !absolutePath.startsWith(`${projectRoot}${path.sep}`)) {
      throw new Error('Invalid workspace path')
    }

    return {
      projectRoot,
      absolutePath,
      relativePath: normalizedPath === '.' ? '.' : normalizedPath.split(path.sep).join('/'),
    }
  }

  async function hasBootstrappedWorkspace(projectId: string) {
    const { projectRoot } = await resolveWorkspacePath(projectId)
    const markerPath = path.join(projectRoot, WORKSPACE_MARKER)

    if (await pathExists(markerPath)) {
      return true
    }

    const entries = await readdir(projectRoot)
    return entries.some((entry) => !isIgnoredRelativePath(entry))
  }

  async function bootstrapFromSnapshot(projectId: string, latestSnapshotId?: string | null) {
    const { projectRoot } = await resolveWorkspacePath(projectId)

    if (await hasBootstrappedWorkspace(projectId)) {
      return projectRoot
    }

    await rm(projectRoot, { recursive: true, force: true })
    await mkdir(projectRoot, { recursive: true })

    if (latestSnapshotId) {
      const snapshotBlob = await downloadSnapshotFile(`${projectId}/${latestSnapshotId}.tar.gz`)
      const snapshotFiles = await fromTarGzBlob(snapshotBlob)

      for (const file of snapshotFiles) {
        const destination = await resolveWorkspacePath(projectId, file.path)
        await mkdir(path.dirname(destination.absolutePath), { recursive: true })
        await writeFile(destination.absolutePath, file.contents, 'utf8')
      }
    }

    await writeFile(
      path.join(projectRoot, WORKSPACE_MARKER),
      JSON.stringify({
        projectId,
        restoredAt: new Date().toISOString(),
        latestSnapshotId: latestSnapshotId ?? null,
      }),
      'utf8',
    )

    return projectRoot
  }

  return {
    ensureWorkspace: bootstrapFromSnapshot,
    resolveWorkspacePath,
    async listFiles(projectId: string) {
      const { projectRoot } = await resolveWorkspacePath(projectId)
      return collectWorkspaceFiles(projectRoot)
    },
    async listEntries(projectId: string, relativePath?: string) {
      const { projectRoot, absolutePath } = await resolveWorkspacePath(projectId, relativePath ?? '.')
      return collectWorkspaceEntries(projectRoot, absolutePath)
    },
    async readFile(projectId: string, relativePath: string, startLine?: number, endLine?: number) {
      const { absolutePath, relativePath: normalizedPath } = await resolveWorkspacePath(projectId, relativePath)
      const contents = await readFile(absolutePath, 'utf8')

      return {
        path: normalizedPath,
        content: createLineRange(contents, startLine, endLine),
        fullContent: contents,
      }
    },
    async writeFile(projectId: string, relativePath: string, contents: string) {
      const { absolutePath, relativePath: normalizedPath } = await resolveWorkspacePath(projectId, relativePath)
      await mkdir(path.dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, contents, 'utf8')

      return {
        path: normalizedPath,
        bytes: Buffer.byteLength(contents),
        contents,
      }
    },
    async editFile(
      projectId: string,
      relativePath: string,
      oldString: string,
      newString: string,
      replaceAll = false,
    ) {
      const { absolutePath, relativePath: normalizedPath } = await resolveWorkspacePath(projectId, relativePath)
      const original = await readFile(absolutePath, 'utf8')

      if (!oldString) {
        throw new Error('edit requires oldString to be non-empty')
      }

      const occurrences = original.split(oldString).length - 1

      if (occurrences === 0) {
        throw new Error(`Could not find target text in ${normalizedPath}`)
      }

      if (!replaceAll && occurrences > 1) {
        throw new Error(`Found ${occurrences} matches in ${normalizedPath}; use replaceAll to replace all occurrences`)
      }

      const nextContents = replaceAll
        ? original.split(oldString).join(newString)
        : original.replace(oldString, newString)

      await writeFile(absolutePath, nextContents, 'utf8')

      return {
        path: normalizedPath,
        replacements: replaceAll ? occurrences : 1,
        contents: nextContents,
      }
    },
    async glob(projectId: string, pattern: string, cwd?: string) {
      const { projectRoot, relativePath } = await resolveWorkspacePath(projectId, cwd ?? '.')
      const allFiles = await collectWorkspaceFiles(projectRoot)
      const prefix = relativePath === '.' ? '' : `${relativePath}/`

      return allFiles
        .map((file) => file.path)
        .filter((filePath) => (prefix ? filePath.startsWith(prefix) : true))
        .filter((filePath) => path.matchesGlob(filePath, pattern))
        .sort((left, right) => left.localeCompare(right))
    },
    async grep(projectId: string, pattern: string, include?: string, cwd?: string) {
      const { projectRoot, relativePath } = await resolveWorkspacePath(projectId, cwd ?? '.')
      const allFiles = await collectWorkspaceFiles(projectRoot)
      const prefix = relativePath === '.' ? '' : `${relativePath}/`
      const matcher = (() => {
        try {
          return new RegExp(pattern, 'gm')
        } catch {
          return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gm')
        }
      })()

      return allFiles
        .filter((file) => (prefix ? file.path.startsWith(prefix) : true))
        .filter((file) => (include ? path.matchesGlob(file.path, include) : true))
        .flatMap((file) => {
          const matches = [...file.contents.matchAll(matcher)]

          if (matches.length === 0) {
            return []
          }

          return matches.map((match) => ({
            path: file.path,
            match: match[0],
          }))
        })
    },
    async applyPatch(projectId: string, patch: string) {
      const { projectRoot } = await resolveWorkspacePath(projectId)
      const changedPaths = extractPatchedPaths(patch)

      const zeroStrip = await runPatchCommand(projectRoot, patch, 0)
      const patched =
        zeroStrip.exitCode === 0
          ? zeroStrip
          : await runPatchCommand(projectRoot, patch, 1)

      if (patched.exitCode !== 0) {
        throw new Error(patched.stderr || patched.stdout || 'Failed to apply patch')
      }

      const updatedFiles: WorkspaceFile[] = []
      for (const changedPath of changedPaths) {
        const { absolutePath, relativePath } = await resolveWorkspacePath(projectId, changedPath)
        if (!(await pathExists(absolutePath))) {
          continue
        }
        updatedFiles.push({
          path: relativePath,
          contents: await readFile(absolutePath, 'utf8'),
        })
      }

      return {
        changedPaths,
        updatedFiles,
        logs: [patched.stdout, patched.stderr].filter((entry) => entry.length > 0),
      }
    },
  }
}

export const localWorkspace = createLocalWorkspace()
