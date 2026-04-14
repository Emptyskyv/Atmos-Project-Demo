import { localWorkspace, type WorkspaceFile } from '@/src/backend/workspace/local'
import { processManager } from '@/src/backend/workspace/process-manager'
import { toPublicPreviewUrl } from '@/src/backend/workspace/preview-path'
import type { ToolCallRequest, ToolResultPayload } from '@/src/shared/agent/tools/serializers'
import type { AppRepository, RunRecord } from '@/src/backend/data/types'

type ExecuteToolCallArgs = {
  repository: AppRepository
  run: RunRecord
  toolCall: ToolCallRequest
}

type ExecutedToolResult = Omit<ToolResultPayload, 'toolCallId' | 'clientSequence'> & {
  fatal?: boolean
}

function toLogLines(lines: Array<{ stream: 'stdout' | 'stderr' | 'info'; text: string }>) {
  return lines.map((line) => ({
    ts: new Date().toISOString(),
    stream: line.stream,
    text: line.text,
  }))
}

function toWorkspaceIndex(files: WorkspaceFile[]) {
  return new Map(files.map((file) => [file.path, file.contents]))
}

function diffWorkspaceFiles(before: WorkspaceFile[], after: WorkspaceFile[]) {
  const beforeIndex = toWorkspaceIndex(before)
  const afterIndex = toWorkspaceIndex(after)
  const changedPaths = new Set<string>()

  for (const [path, contents] of afterIndex.entries()) {
    if (beforeIndex.get(path) !== contents) {
      changedPaths.add(path)
    }
  }

  for (const path of beforeIndex.keys()) {
    if (!afterIndex.has(path)) {
      changedPaths.add(path)
    }
  }

  return {
    filesChanged: [...changedPaths].sort((left, right) => left.localeCompare(right)),
    updatedFiles: after.filter((file) => changedPaths.has(file.path)),
  }
}

export function createToolExecutor() {
  return {
    async execute({ repository, run, toolCall }: ExecuteToolCallArgs): Promise<ExecutedToolResult> {
      const project = await repository.getProjectById(run.userId, run.projectId)

      if (!project) {
        return {
          output: { message: 'Project not found for tool execution' },
          isError: true,
          fatal: true,
          logs: toLogLines([
            {
              stream: 'stderr',
              text: 'Project not found for tool execution',
            },
          ]),
        }
      }

      const workspaceDir = await localWorkspace.ensureWorkspace(project.id, project.latestSnapshotId)
      const currentPreviewUrl = toPublicPreviewUrl(project.id, processManager.getPreviewUrl(project.id))

      try {
        switch (toolCall.name) {
          case 'read': {
            const input = toolCall.input as { path: string; startLine?: number; endLine?: number }
            const output = await localWorkspace.readFile(project.id, input.path, input.startLine, input.endLine)

            return {
              output,
              isError: false,
              logs: toLogLines([
                {
                  stream: 'info',
                  text: `Read ${output.path}`,
                },
              ]),
              previewUrl: currentPreviewUrl,
            }
          }
          case 'list': {
            const input = toolCall.input as { path?: string }
            const entries = await localWorkspace.listEntries(project.id, input.path)

            return {
              output: {
                path: input.path ?? '.',
                entries,
              },
              isError: false,
              logs: toLogLines([
                {
                  stream: 'info',
                  text: `Listed ${input.path ?? '.'}`,
                },
              ]),
              previewUrl: currentPreviewUrl,
            }
          }
          case 'glob': {
            const input = toolCall.input as { pattern: string; cwd?: string }
            const matches = await localWorkspace.glob(project.id, input.pattern, input.cwd)

            return {
              output: {
                pattern: input.pattern,
                matches,
              },
              isError: false,
              logs: toLogLines([
                {
                  stream: 'info',
                  text: `Globbed ${matches.length} path(s) for ${input.pattern}`,
                },
              ]),
              previewUrl: currentPreviewUrl,
            }
          }
          case 'grep': {
            const input = toolCall.input as { pattern: string; include?: string; cwd?: string }
            const matches = await localWorkspace.grep(project.id, input.pattern, input.include, input.cwd)

            return {
              output: {
                pattern: input.pattern,
                matches,
              },
              isError: false,
              logs: toLogLines([
                {
                  stream: 'info',
                  text: `Grep found ${matches.length} match(es) for ${input.pattern}`,
                },
              ]),
              previewUrl: currentPreviewUrl,
            }
          }
          case 'write': {
            const input = toolCall.input as { path: string; content: string }
            const output = await localWorkspace.writeFile(project.id, input.path, input.content)

            return {
              output: {
                path: output.path,
                bytes: output.bytes,
              },
              isError: false,
              filesChanged: [output.path],
              updatedFiles: [{ path: output.path, contents: output.contents }],
              logs: toLogLines([
                {
                  stream: 'info',
                  text: `Wrote ${output.path} (${output.bytes} bytes)`,
                },
              ]),
              previewUrl: currentPreviewUrl,
            }
          }
          case 'edit': {
            const input = toolCall.input as {
              path: string
              oldString: string
              newString: string
              replaceAll?: boolean
            }
            const output = await localWorkspace.editFile(
              project.id,
              input.path,
              input.oldString,
              input.newString,
              input.replaceAll ?? false,
            )

            return {
              output: {
                path: output.path,
                replacements: output.replacements,
              },
              isError: false,
              filesChanged: [output.path],
              updatedFiles: [{ path: output.path, contents: output.contents }],
              logs: toLogLines([
                {
                  stream: 'info',
                  text: `Edited ${output.path} (${output.replacements} replacement${output.replacements === 1 ? '' : 's'})`,
                },
              ]),
              previewUrl: currentPreviewUrl,
            }
          }
          case 'applyPatch': {
            const input = toolCall.input as { patch: string }
            const output = await localWorkspace.applyPatch(project.id, input.patch)

            return {
              output: {
                changedPaths: output.changedPaths,
              },
              isError: false,
              filesChanged: output.changedPaths,
              updatedFiles: output.updatedFiles,
              logs: toLogLines(
                output.logs.map((line) => ({
                  stream: 'info' as const,
                  text: line,
                })),
              ),
              previewUrl: currentPreviewUrl,
            }
          }
          case 'bash': {
            const input = toolCall.input as { command: string; cwd?: string }
            const beforeFiles = await localWorkspace.listFiles(project.id)
            const targetPath = input.cwd && input.cwd !== '.'
              ? await localWorkspace.resolveWorkspacePath(project.id, input.cwd)
              : null
            const output = await processManager.run(project.id, input.command, {
              workspaceDir,
              cwd: targetPath?.absolutePath,
            })
            const afterFiles = await localWorkspace.listFiles(project.id)
            const fileDelta = diffWorkspaceFiles(beforeFiles, afterFiles)

            return {
              output: {
                command: input.command,
                cwd: output.cwd,
                exitCode: output.exitCode,
                output: output.output,
              },
              isError: output.exitCode !== 0,
              durationMs: output.durationMs,
              filesChanged: fileDelta.filesChanged,
              updatedFiles: fileDelta.updatedFiles,
              logs: toLogLines(output.logs),
              previewUrl: toPublicPreviewUrl(project.id, output.previewUrl) ?? currentPreviewUrl,
            }
          }
          default:
            return {
              output: { message: `Unsupported tool ${toolCall.name}` },
              isError: true,
              fatal: true,
              logs: toLogLines([
                {
                  stream: 'stderr',
                  text: `Unsupported tool ${toolCall.name}`,
                },
              ]),
              previewUrl: currentPreviewUrl,
            }
        }
      } catch (error) {
        return {
          output: {
            message: error instanceof Error ? error.message : 'Unexpected tool execution failure',
          },
          isError: true,
          logs: toLogLines([
            {
              stream: 'stderr',
              text: error instanceof Error ? error.message : 'Unexpected tool execution failure',
            },
          ]),
          previewUrl: currentPreviewUrl,
        }
      }
    },
  }
}

export type ToolExecutor = ReturnType<typeof createToolExecutor>

export const toolExecutor = createToolExecutor()
