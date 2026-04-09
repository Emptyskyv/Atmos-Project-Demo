# Atoms Runtime Structure Refactor Design

## Goal

Move the runnable Atoms codebase from the active worktree into the formal repository workspace and reorganize it into clear `frontend`, `backend`, and `shared` boundaries without changing deployment architecture.

## Current Problem

The active runtime code works, but responsibilities are mixed:

- Next.js route files contain page logic directly.
- UI components, client hooks, browser runtime helpers, API composition, agent runtime, persistence, and deployment code live side by side.
- The `lib/` directory acts as a catch-all instead of expressing architectural boundaries.
- The formal workspace currently holds only design docs, while the actual implementation remains in a worktree branch.

## Constraints

- Keep a single Next.js application.
- Keep the existing URL structure and `app/api` entrypoint.
- Keep Hono mounted through Next.js route handlers.
- Keep current environment variable names and deployment flow.
- Prefer moving files over rewriting behavior.

## Target Structure

### Top-level role of `app/`

`app/` remains the Next.js routing layer only:

- `app/page.tsx`
- `app/dashboard/page.tsx`
- `app/projects/[id]/page.tsx`
- `app/(auth)/login/page.tsx`
- `app/api/[[...route]]/route.ts`

Each file should become a thin entrypoint that imports real implementations from `src/`.

### `src/frontend`

Frontend-only code:

- `src/frontend/app/`
  Page implementations used by the thin `app/` entrypoints.
- `src/frontend/components/`
  React UI components and providers.
- `src/frontend/hooks/`
  Client hooks such as streaming, workspace state, and UI state helpers.
- `src/frontend/workspace/`
  Browser-facing workspace runtime helpers such as WebContainer bridge, browser file sync, tarball helpers, and preview integration.

### `src/backend`

Server-only code:

- `src/backend/api/`
  Hono app composition, API context, route files, and API error handling.
- `src/backend/auth/`
  Auth and session helpers.
- `src/backend/data/`
  Repositories and persistence abstractions.
- `src/backend/agent/`
  Agent runtime, prompts, tool definitions, tool dispatch, and run orchestration.
- `src/backend/publish/`
  Publish and deployment services.
- `src/backend/storage/`
  Snapshot persistence and storage-facing helpers.
- `src/backend/platform/`
  Infra-bound modules such as env parsing, database clients, Supabase server/storage adapters, and runtime limits.

### `src/shared`

Cross-boundary modules only:

- Serializable payload types used by both browser and server.
- Shared schemas and DTOs.
- Shared event payload types.
- Shared constants or utilities that do not require browser-only or server-only APIs.

## Migration Rules

1. Move the runnable code from the worktree into the formal workspace first.
2. Exclude transient artifacts such as `.next`, `node_modules`, logs, and local env files.
3. Restructure with behavior-preserving moves before introducing functional changes.
4. Convert existing root imports to `@/src/...` targets as files move.
5. Keep `lib/` from growing further; migrate active modules into `src/`.
6. If a frontend file needs only types from a backend module, extract those types into `src/shared`.

## Expected End State

- Formal workspace contains the runnable app.
- Route entrypoints stay small and easy to scan.
- Frontend, backend, and shared code can be navigated by responsibility.
- Existing commands continue to work with the same deployment model.
- The repository has a clean architectural base for future iteration.
