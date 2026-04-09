# Opencode Tool Runtime Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MVP's custom browser-only tool loop with an opencode-style core tool surface executed on the Node backend, while preserving REST + SSE UX and local preview.

**Architecture:** Keep the model-facing tool list small and familiar: `bash`, `read`, `write`, `edit`, `glob`, `grep`, and `applyPatch`. Add a backend workspace executor rooted in `.data/workspaces/<projectId>`, restore it from the latest snapshot on demand, execute tools server-side, stream tool logs over the existing run SSE channel, and only use the frontend for rendering timeline/code/preview state.

**Tech Stack:** Next.js 15, TypeScript, Node `fs/promises`, Node `child_process`, Prisma repository layer, Hono REST + SSE routes, Vitest.

---

## Scope Lock

- In scope: opencode-style core tool definitions, backend workspace storage, server-side tool execution, run loop fail-fast handling, UI consumption updates, regression tests
- Out of scope: full opencode CLI embedding, permission prompts, LSP tooling, browser-side WebContainer as the primary execution engine

## File Map

- Create: `lib/agent/tool-contract.ts`
- Create: `lib/agent/tool-executor.ts`
- Create: `lib/workspace/local.ts`
- Create: `lib/workspace/process-manager.ts`
- Modify: `lib/agent/runtime-shared.ts`
- Modify: `lib/agent/tools/definitions.ts`
- Modify: `lib/agent/agents-runtime.ts`
- Modify: `lib/agent/runtime-openai-compatible.ts`
- Modify: `lib/server/api/routes/runs.ts`
- Modify: `hooks/useRunStream.ts`
- Modify: `hooks/useWorkspaceState.ts`
- Modify: `components/workspace/WorkspaceShell.tsx`
- Modify: `next.config.ts`
- Modify: `tests/lib/agent-runtime.test.ts`
- Modify: `tests/lib/openai-compatible-runtime.test.ts`
- Create: `tests/lib/tool-executor.test.ts`
- Create: `tests/lib/workspace-local.test.ts`
- Modify: `tests/api/runs.test.ts`
- Modify: `tests/hooks/useRunStream.test.tsx`

## Task 1: Define the new model-facing tool contract

**Files:**
- Create: `lib/agent/tool-contract.ts`
- Modify: `lib/agent/runtime-shared.ts`
- Modify: `lib/agent/tools/definitions.ts`
- Modify: `tests/lib/agent-runtime.test.ts`

- [ ] Replace the current `writeFile/runCommand/startDevServer` surface with `bash/read/write/edit/glob/grep/applyPatch`.
- [ ] Keep input schemas intentionally small and provider-friendly.
- [ ] Add compatibility aliases only if existing persisted runs require them.
- [ ] Update runtime tests to assert the new tool surface and schema parsing.

## Task 2: Build a backend workspace executor

**Files:**
- Create: `lib/workspace/local.ts`
- Create: `lib/workspace/process-manager.ts`
- Create: `lib/agent/tool-executor.ts`
- Create: `tests/lib/tool-executor.test.ts`
- Create: `tests/lib/workspace-local.test.ts`

- [ ] Create a per-project local workspace under `.data/workspaces/<projectId>`.
- [ ] Restore files from the latest snapshot into the workspace on first access.
- [ ] Implement server-side `read/write/edit/glob/grep/applyPatch/bash`.
- [ ] Let `bash` detect and retain long-lived preview processes, returning `previewUrl` when a server becomes reachable.

## Task 3: Move the run loop from client-executed tools to server-executed tools

**Files:**
- Modify: `lib/agent/agents-runtime.ts`
- Modify: `lib/agent/runtime-openai-compatible.ts`
- Modify: `lib/server/api/routes/runs.ts`
- Modify: `tests/lib/openai-compatible-runtime.test.ts`
- Modify: `tests/api/runs.test.ts`

- [ ] Keep model/tool interruption handling, but execute tool calls on the server before continuing the loop.
- [ ] Persist each tool call and tool log in the repository.
- [ ] Fail fast on fatal executor errors instead of re-opening the stream into a retry spiral.
- [ ] Keep SSE event shapes stable enough that the existing UI can still render timeline updates.

## Task 4: Update the UI to consume backend-executed tool results

**Files:**
- Modify: `hooks/useRunStream.ts`
- Modify: `hooks/useWorkspaceState.ts`
- Modify: `components/workspace/WorkspaceShell.tsx`
- Modify: `next.config.ts`
- Modify: `tests/hooks/useRunStream.test.tsx`

- [ ] Remove frontend responsibility for executing core tools.
- [ ] Treat tool logs and assistant deltas as display-only stream events from the server.
- [ ] Keep local file/code/terminal/preview panes in sync from tool result payloads.
- [ ] Add COOP/COEP headers only if WebContainer remains needed for passive preview support.

## Task 5: Verify the end-to-end loop and review

**Files:**
- Modify: any touched files above

- [ ] Run targeted tests for runtime, API, workspace, and hook behavior.
- [ ] Run a real local smoke flow: login, create project, ask for a simple HTML app, verify tool logs, verify preview.
- [ ] Perform the scheduled code review after these migration tasks complete.
