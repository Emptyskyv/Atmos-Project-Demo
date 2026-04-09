import { z } from 'zod'

export const CORE_TOOL_INPUT_SCHEMAS = {
  bash: z.object({
    command: z.string().min(1),
    cwd: z.string().min(1).optional(),
  }),
  read: z.object({
    path: z.string().min(1),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
  }),
  write: z.object({
    path: z.string().min(1),
    content: z.string(),
  }),
  edit: z.object({
    path: z.string().min(1),
    oldString: z.string(),
    newString: z.string(),
    replaceAll: z.boolean().optional(),
  }),
  list: z.object({
    path: z.string().min(1).optional(),
  }),
  glob: z.object({
    pattern: z.string().min(1),
    cwd: z.string().min(1).optional(),
  }),
  grep: z.object({
    pattern: z.string().min(1),
    include: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
  }),
  applyPatch: z.object({
    patch: z.string().min(1),
  }),
} as const

export const CORE_TOOL_NAMES = [
  'bash',
  'read',
  'write',
  'edit',
  'list',
  'glob',
  'grep',
  'applyPatch',
] as const

export type CoreToolName = (typeof CORE_TOOL_NAMES)[number]

export const CORE_TOOL_DESCRIPTIONS: Record<CoreToolName, string> = {
  bash:
    'Execute a shell command inside the project workspace. Use it for installs, builds, tests, and starting local preview servers.',
  read:
    'Read a file from the project workspace. Optionally limit the response to a line range.',
  write:
    'Create or replace a file in the project workspace with the provided content.',
  edit:
    'Edit a file by replacing an exact string match with a new string. Prefer this for small surgical updates.',
  list:
    'List files and directories under a workspace path.',
  glob:
    'Find workspace paths that match a glob pattern.',
  grep:
    'Search workspace files for a text or regular-expression pattern.',
  applyPatch:
    'Apply a unified diff patch to files in the project workspace.',
}
