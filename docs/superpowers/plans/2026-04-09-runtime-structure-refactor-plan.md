# Runtime Structure Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the runnable Atoms runtime from the active worktree into the formal workspace and reorganize it into `src/frontend`, `src/backend`, and `src/shared` boundaries while keeping the single Next.js deployment model unchanged.

**Architecture:** Keep `app/` as a thin Next.js routing layer and move actual runtime code into `src/frontend` and `src/backend`. Extract any cross-boundary payloads and types into `src/shared`, then update aliases and imports so the app still runs through the same Next.js plus Hono integration.

**Tech Stack:** Next.js 15, React 19, TypeScript, Hono, Prisma, Supabase, OpenAI Agents SDK, Vitest, Playwright.

---

### Task 1: Import the runnable code into the formal workspace

**Files:**
- Create or replace: formal workspace runtime files copied from `/Users/bytedance/atoms_project/.worktrees/codex-backend-runtime`
- Exclude: `.next`, `node_modules`, `.playwright-cli`, `output`, `.env.local`, `tsconfig.tsbuildinfo`
- Test: existing workspace test commands after import

- [ ] **Step 1: Copy the tracked runtime source into the formal workspace**

Run a filtered sync from the active worktree into `/Users/bytedance/atoms_project`, excluding transient artifacts and nested `.git` metadata.

- [ ] **Step 2: Verify the formal workspace now contains the runnable app files**

Run file listing and git status checks to confirm app source, tests, Prisma files, and config files are present.

### Task 2: Create the target architecture directories

**Files:**
- Create: `src/frontend/app`
- Create: `src/frontend/components`
- Create: `src/frontend/hooks`
- Create: `src/frontend/workspace`
- Create: `src/backend/api`
- Create: `src/backend/auth`
- Create: `src/backend/data`
- Create: `src/backend/agent`
- Create: `src/backend/publish`
- Create: `src/backend/storage`
- Create: `src/backend/platform`
- Create: `src/shared`

- [ ] **Step 1: Create the new directory skeleton**

Add the new `src/` hierarchy before moving files so imports can be rewritten in place.

### Task 3: Move frontend implementation behind thin route entrypoints

**Files:**
- Move: page implementations, providers, UI components, hooks, browser workspace helpers
- Modify: `app/**/*.tsx`

- [ ] **Step 1: Move page implementations into `src/frontend/app`**

Page files keep the same runtime behavior, while route entrypoints become thin wrappers.

- [ ] **Step 2: Move UI components and providers into `src/frontend/components`**

Workspace panels, auth form, provider shell, and related UI modules move together.

- [ ] **Step 3: Move client hooks into `src/frontend/hooks`**

Streaming and workspace state hooks move without changing behavior.

- [ ] **Step 4: Move browser runtime helpers into `src/frontend/workspace`**

WebContainer bridge, browser FS sync, and tarball helpers move under the frontend runtime boundary.

### Task 4: Move server implementation into backend boundaries

**Files:**
- Move: Hono app, auth, data repositories, agent runtime, publish services, storage, infra helpers
- Modify: server-side imports across runtime code

- [ ] **Step 1: Move API composition and route handlers into `src/backend/api`**

Keep `app/api/[[...route]]/route.ts` as a thin adapter.

- [ ] **Step 2: Move auth, data, publish, storage, and platform helpers into backend folders**

Group server modules by responsibility rather than by generic `lib` placement.

- [ ] **Step 3: Move agent runtime modules into `src/backend/agent`**

Keep backend orchestration together and separate from browser-side tool execution helpers.

### Task 5: Extract shared modules and update imports

**Files:**
- Move or create: shared DTOs, event payloads, tool serialization contracts
- Modify: `tsconfig.json`, runtime imports, tests

- [ ] **Step 1: Extract cross-boundary contracts into `src/shared`**

Any modules referenced by both browser and server move out of backend-specific folders.

- [ ] **Step 2: Update path aliases and imports**

Update imports to target `@/src/frontend/...`, `@/src/backend/...`, and `@/src/shared/...`.

### Task 6: Verify and commit the migration

**Files:**
- Modify: `README.md` if structure notes are needed
- Verify: tests and lint

- [ ] **Step 1: Run focused verification**

Run at least lint plus a targeted test subset covering home page, API routes, and workspace hooks/components.

- [ ] **Step 2: Review diff for accidental artifact import**

Confirm no build output, local env files, or worktree-only artifacts were copied.

- [ ] **Step 3: Commit the migration**

Use a single commit with the required repository message format.
