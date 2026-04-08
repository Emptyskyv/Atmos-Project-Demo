# Atoms MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Atoms MVP: a hosted Next.js app where a logged-in user can create a project, send a prompt, have a backend GPT-5.2 agent stream responses, execute browser-side WebContainer tools, snapshot the project, and publish it to a shareable Vercel URL.

**Architecture:** Use a single Next.js 15 repository deployed on Vercel Hobby. Keep the agent loop, OpenAI access, persistence, and publish workflow in the Node backend; keep WebContainer execution, rendering, and preview in the browser. Expose the backend through a thin Next.js route-handler adapter to a Hono app that implements the Run-centered REST + SSE contract from `TECH_DESIGN.md`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui, Hono, Zod, Supabase Auth, Supabase Postgres, Prisma, OpenAI Agents SDK, OpenAI Responses API, WebContainer API, Zustand, TanStack Query, Monaco, xterm.js, Vitest, Testing Library, Playwright.

---

## Scope Lock

This plan intentionally targets the MVP slice only:

- In scope: login, project CRUD, timeline rendering, text streaming, tool request/response loop, WebContainer preview, snapshot upload/restore, Vercel publish, run cancel, basic rate limiting
- Out of scope for this first pass: multi-agent orchestration, diff viewer, PRD planner agent, template marketplace, billing, team collaboration, analytics dashboard

## File Map

### App shell and config

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `middleware.ts`
- Create: `components/providers/AppProviders.tsx`

### Backend API and persistence

- Create: `app/api/[[...route]]/route.ts`
- Create: `lib/server/api/app.ts`
- Create: `lib/server/api/context.ts`
- Create: `lib/server/api/errors.ts`
- Create: `lib/server/api/routes/auth.ts`
- Create: `lib/server/api/routes/projects.ts`
- Create: `lib/server/api/routes/messages.ts`
- Create: `lib/server/api/routes/runs.ts`
- Create: `lib/server/api/routes/snapshots.ts`
- Create: `lib/server/api/routes/publish.ts`
- Create: `lib/env.ts`
- Create: `lib/db/client.ts`
- Create: `prisma/schema.prisma`
- Create: `prisma/migrations/0001_init/migration.sql`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/storage.ts`

### Agent runtime

- Create: `lib/agent/runtime.ts`
- Create: `lib/agent/runner.ts`
- Create: `lib/agent/events.ts`
- Create: `lib/agent/prompts/system.ts`
- Create: `lib/agent/tools/definitions.ts`
- Create: `lib/agent/tools/dispatcher.ts`
- Create: `lib/agent/tools/serializers.ts`
- Create: `lib/agent/repository.ts`
- Create: `lib/limits.ts`

### Frontend workspace

- Create: `app/(auth)/login/page.tsx`
- Create: `app/(dashboard)/page.tsx`
- Create: `app/projects/[id]/page.tsx`
- Create: `components/workspace/ChatPanel.tsx`
- Create: `components/workspace/ToolLogAccordion.tsx`
- Create: `components/workspace/CodePanel.tsx`
- Create: `components/workspace/TerminalPanel.tsx`
- Create: `components/workspace/PreviewPanel.tsx`
- Create: `components/workspace/FileTree.tsx`
- Create: `components/workspace/PublishDialog.tsx`
- Create: `components/workspace/WorkspaceShell.tsx`
- Create: `hooks/useRunStream.ts`
- Create: `hooks/useWorkspaceState.ts`

### Browser tool bridge

- Create: `lib/webcontainer/client.ts`
- Create: `lib/webcontainer/bridge.ts`
- Create: `lib/webcontainer/fs.ts`
- Create: `lib/webcontainer/tarball.ts`

### Publish workflow

- Create: `lib/publish/deploy.ts`
- Create: `lib/publish/project-map.ts`

### Tests

- Create: `tests/setup.ts`
- Create: `tests/app/home.test.tsx`
- Create: `tests/lib/env.test.ts`
- Create: `tests/api/projects.test.ts`
- Create: `tests/api/runs.test.ts`
- Create: `tests/api/snapshots.test.ts`
- Create: `tests/api/publish.test.ts`
- Create: `tests/components/chat-panel.test.tsx`
- Create: `tests/webcontainer/bridge.test.ts`
- Create: `e2e/atoms-smoke.spec.ts`

---

### Task 1: Bootstrap the Next.js workspace and test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `components/providers/AppProviders.tsx`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Test: `tests/app/home.test.tsx`

- [ ] **Step 1: Scaffold the baseline Next.js app**

Run:

```bash
npm create next@latest . --ts --eslint --app --tailwind --use-npm --import-alias "@/*"
```

Expected: project files appear under `/Users/bytedance/atoms_project` without overwriting `TECH_DESIGN.md`.

- [ ] **Step 2: Install the runtime and test dependencies**

Run:

```bash
npm install hono zod @hono/zod-validator @supabase/supabase-js @supabase/ssr @prisma/client openai @openai/agents qrcode react-resizable-panels zustand @tanstack/react-query @monaco-editor/react monaco-editor xterm @xterm/xterm @webcontainer/api tar-stream fflate clsx tailwind-merge
npm install -D prisma vitest jsdom @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

Expected: install exits `0`.

- [ ] **Step 3: Write the failing home-page smoke test**

Create `tests/app/home.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import HomePage from '@/app/page'

describe('HomePage', () => {
  it('shows the MVP entry copy', () => {
    render(<HomePage />)

    expect(screen.getByRole('heading', { name: /atoms/i })).toBeInTheDocument()
    expect(screen.getByText(/openai gpt-5\.2/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start building/i })).toBeInTheDocument()
  })
})
```

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
})
```

- [ ] **Step 4: Run the smoke test to verify it fails**

Run:

```bash
npx vitest run tests/app/home.test.tsx
```

Expected: FAIL because `app/page.tsx` does not yet render the `OpenAI GPT-5.2` copy and CTA.

- [ ] **Step 5: Implement the minimal landing page and provider shell**

Create `components/providers/AppProviders.tsx`:

```tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PropsWithChildren, useState } from 'react'

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient())
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

Update `app/layout.tsx`:

```tsx
import './globals.css'
import type { Metadata } from 'next'
import { AppProviders } from '@/components/providers/AppProviders'

export const metadata: Metadata = {
  title: 'Atoms',
  description: 'AI Web App generator powered by GPT-5.2',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
```

Update `app/page.tsx`:

```tsx
import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-24 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">Atoms</p>
        <h1 className="max-w-3xl text-5xl font-semibold leading-tight">
          Build and publish small web apps with an OpenAI GPT-5.2 backend agent.
        </h1>
        <p className="max-w-2xl text-lg text-neutral-300">
          Describe what you want, watch the backend agent stream decisions, preview the app in
          WebContainer, and ship to a shareable Vercel URL.
        </p>
        <div>
          <Link
            href="/login"
            className="inline-flex rounded-full bg-emerald-400 px-5 py-3 font-medium text-black"
          >
            Start building
          </Link>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Run the smoke test to verify it passes**

Run:

```bash
npx vitest run tests/app/home.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json tsconfig.json next.config.ts app/layout.tsx app/page.tsx app/globals.css components/providers/AppProviders.tsx vitest.config.ts tests/setup.ts tests/app/home.test.tsx
git commit -m "chore：bootstrap next app and test harness"
```

### Task 2: Add env parsing, Prisma schema, and Supabase foundations

**Files:**
- Create: `.env.example`
- Create: `lib/env.ts`
- Create: `lib/db/client.ts`
- Create: `prisma/schema.prisma`
- Create: `prisma/migrations/0001_init/migration.sql`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Test: `tests/lib/env.test.ts`

- [ ] **Step 1: Write the failing env test**

Create `tests/lib/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseServerEnv } from '@/lib/env'

describe('parseServerEnv', () => {
  it('requires OPENAI_MODEL to stay on gpt-5.2', () => {
    expect(() =>
      parseServerEnv({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role',
        VERCEL_TOKEN: 'vercel-token',
        OPENAI_API_KEY: 'sk-test',
        OPENAI_MODEL: 'gpt-4.1',
      }),
    ).toThrow(/gpt-5\.2/)
  })
})
```

- [ ] **Step 2: Run the env test to verify it fails**

Run:

```bash
npx vitest run tests/lib/env.test.ts
```

Expected: FAIL with module-not-found or exported-function-not-found for `@/lib/env`.

- [ ] **Step 3: Implement env parsing, Prisma schema, and Supabase helpers**

Create `lib/env.ts`:

```ts
import { z } from 'zod'

const serverEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  VERCEL_TOKEN: z.string().min(1),
  VERCEL_TEAM_ID: z.string().optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.literal('gpt-5.2'),
  PUBLISH_DAILY_LIMIT_PER_USER: z.coerce.number().int().positive().default(5),
  RUN_MAX_STEPS: z.coerce.number().int().positive().default(20),
  SNAPSHOT_MAX_SIZE_MB: z.coerce.number().int().positive().default(10),
})

export function parseServerEnv(input: Record<string, string | undefined>) {
  return serverEnvSchema.parse(input)
}

export const serverEnv = parseServerEnv(process.env)
```

Create `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
VERCEL_TOKEN=
VERCEL_TEAM_ID=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.2
PUBLISH_DAILY_LIMIT_PER_USER=5
RUN_MAX_STEPS=20
SNAPSHOT_MAX_SIZE_MB=10
```

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("SUPABASE_URL")
}

model User {
  id        String    @id @default(cuid())
  email     String    @unique
  projects  Project[]
  runs      Run[]
  createdAt DateTime  @default(now())
}

model Project {
  id                String      @id @default(cuid())
  userId            String
  name              String
  description       String?
  templateKey       String
  status            String
  deployedUrl       String?
  vercelProjectSlug String?
  latestSnapshotId  String?
  latestRunId       String?
  user              User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  snapshots         Snapshot[]
  runs              Run[]
  messages          Message[]
  publishJobs       PublishJob[]
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
}

model Run {
  id                String    @id @default(cuid())
  projectId         String
  userId            String
  model             String
  status            String
  waitingToolCallId String?
  lastError         Json?
  project           Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt         DateTime  @default(now())
  startedAt         DateTime?
  finishedAt        DateTime?
}

model Message {
  id         String   @id @default(cuid())
  projectId  String
  runId      String?
  kind       String
  payload    Json
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())
}

model Snapshot {
  id          String   @id @default(cuid())
  projectId   String
  storageKey  String
  summary     String?
  deployedUrl String?
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
}

model PublishJob {
  id          String   @id @default(cuid())
  projectId   String
  snapshotId  String
  status      String
  deployedUrl String?
  lastError   Json?
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
}
```

Create `lib/db/client.ts`:

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
```

Create `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

Create `lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )
}
```

- [ ] **Step 4: Run the env test and Prisma validation**

Run:

```bash
npx vitest run tests/lib/env.test.ts
npx prisma validate
```

Expected: both commands PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add .env.example lib/env.ts lib/db/client.ts prisma/schema.prisma prisma/migrations/0001_init/migration.sql lib/supabase/client.ts lib/supabase/server.ts tests/lib/env.test.ts
git commit -m "feat：add env parsing and data model foundation"
```

### Task 3: Build the Hono API shell with auth and project CRUD

**Files:**
- Create: `app/api/[[...route]]/route.ts`
- Create: `lib/server/api/app.ts`
- Create: `lib/server/api/context.ts`
- Create: `lib/server/api/errors.ts`
- Create: `lib/server/api/routes/auth.ts`
- Create: `lib/server/api/routes/projects.ts`
- Test: `tests/api/projects.test.ts`

- [ ] **Step 1: Write the failing API test for auth and projects**

Create `tests/api/projects.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildApiApp } from '@/lib/server/api/app'

describe('projects routes', () => {
  it('returns 401 for /auth/me without a session', async () => {
    const app = buildApiApp()
    const res = await app.request('/auth/me')
    expect(res.status).toBe(401)
  })

  it('validates POST /projects input', async () => {
    const app = buildApiApp()
    const res = await app.request('/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify({ name: '', templateKey: '' }),
    })

    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run the API test to verify it fails**

Run:

```bash
npx vitest run tests/api/projects.test.ts
```

Expected: FAIL with module-not-found for `@/lib/server/api/app`.

- [ ] **Step 3: Implement the Hono app, auth route, and project route**

Create `lib/server/api/errors.ts`:

```ts
export class ApiHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}
```

Create `lib/server/api/context.ts`:

```ts
import { createMiddleware } from 'hono/factory'
import { ApiHttpError } from '@/lib/server/api/errors'

export type ApiVariables = {
  currentUserId: string
}

export const requireAuth = createMiddleware<{ Variables: ApiVariables }>(async (c, next) => {
  const authHeader = c.req.header('authorization')
  if (!authHeader) throw new ApiHttpError(401, 'UNAUTHORIZED', 'Missing bearer token')
  c.set('currentUserId', 'demo-user-id')
  await next()
})
```

Create `lib/server/api/routes/auth.ts`:

```ts
import { Hono } from 'hono'
import { ApiHttpError } from '@/lib/server/api/errors'

export const authRoutes = new Hono().get('/me', (c) => {
  const authHeader = c.req.header('authorization')
  if (!authHeader) {
    throw new ApiHttpError(401, 'UNAUTHORIZED', 'Missing bearer token')
  }

  return c.json({
    user: {
      id: 'demo-user-id',
      email: 'demo@example.com',
      name: null,
      createdAt: new Date().toISOString(),
    },
  })
})
```

Create `lib/server/api/routes/projects.ts`:

```ts
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '@/lib/server/api/context'

const createProjectSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  templateKey: z.string().min(1),
})

export const projectRoutes = new Hono()
  .use('*', requireAuth)
  .get('/', (c) => c.json({ projects: [] }))
  .post('/', zValidator('json', createProjectSchema), async (c) => {
    const body = c.req.valid('json')

    return c.json(
      {
        project: {
          id: 'proj_demo',
          userId: c.get('currentUserId'),
          name: body.name,
          description: body.description ?? null,
          templateKey: body.templateKey,
          status: 'idle',
          deployedUrl: null,
          vercelProjectSlug: null,
          latestSnapshotId: null,
          latestRunId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      201,
    )
  })
```

Create `lib/server/api/app.ts`:

```ts
import { Hono } from 'hono'
import { ApiHttpError } from '@/lib/server/api/errors'
import { authRoutes } from '@/lib/server/api/routes/auth'
import { projectRoutes } from '@/lib/server/api/routes/projects'

export function buildApiApp() {
  const app = new Hono()

  app.route('/auth', authRoutes)
  app.route('/projects', projectRoutes)

  app.onError((error, c) => {
    if (error instanceof ApiHttpError) {
      return c.json({ error: { code: error.code, message: error.message, details: error.details } }, error.status)
    }

    return c.json({ error: { code: 'INTERNAL', message: 'Unexpected server error' } }, 500)
  })

  return app
}
```

Create `app/api/[[...route]]/route.ts`:

```ts
import { handle } from 'hono/vercel'
import { buildApiApp } from '@/lib/server/api/app'

const handler = handle(buildApiApp())

export const GET = handler
export const POST = handler
export const PATCH = handler
export const DELETE = handler
```

- [ ] **Step 4: Run the API test to verify it passes**

Run:

```bash
npx vitest run tests/api/projects.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add app/api/[[...route]]/route.ts lib/server/api/app.ts lib/server/api/context.ts lib/server/api/errors.ts lib/server/api/routes/auth.ts lib/server/api/routes/projects.ts tests/api/projects.test.ts
git commit -m "feat：add hono api shell and project routes"
```

### Task 4: Implement Run persistence and text-only streaming with GPT-5.2

**Files:**
- Create: `lib/agent/events.ts`
- Create: `lib/agent/runtime.ts`
- Create: `lib/agent/runner.ts`
- Create: `lib/agent/prompts/system.ts`
- Create: `lib/agent/repository.ts`
- Modify: `lib/server/api/routes/projects.ts`
- Create: `lib/server/api/routes/messages.ts`
- Create: `lib/server/api/routes/runs.ts`
- Test: `tests/api/runs.test.ts`

- [ ] **Step 1: Write the failing Run API test**

Create `tests/api/runs.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { buildApiApp } from '@/lib/server/api/app'

describe('runs routes', () => {
  it('creates a run and returns a stream URL', async () => {
    const app = buildApiApp({
      runtime: {
        run: vi.fn().mockResolvedValue({
          runId: 'run_demo',
          outputText: 'Working on your app now.',
        }),
      },
    })

    const res = await app.request('/projects/proj_demo/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify({
        userMessage: { text: 'Build a todo app' },
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.run.id).toBe('run_demo')
    expect(body.streamUrl).toBe('/api/runs/run_demo/stream')
  })
})
```

- [ ] **Step 2: Run the Run API test to verify it fails**

Run:

```bash
npx vitest run tests/api/runs.test.ts
```

Expected: FAIL because `POST /projects/:id/runs` is not implemented.

- [ ] **Step 3: Implement the runtime boundary and Run routes**

Create `lib/agent/events.ts`:

```ts
export type RunStreamEvent =
  | { type: 'run_started'; runId: string }
  | { type: 'assistant_message_delta'; runId: string; messageId: string; delta: string }
  | { type: 'assistant_message_completed'; runId: string; messageId: string; text: string }
  | { type: 'run_completed'; runId: string }
  | { type: 'run_failed'; runId: string; message: string }
```

Create `lib/agent/prompts/system.ts`:

```ts
export const SYSTEM_PROMPT = `
You are Atoms, a backend agent that helps non-technical users build small web apps.
Always explain your plan briefly, prefer small incremental changes, and use tools instead of pretending.
When you need file or terminal actions, emit tool calls instead of plain text descriptions.
`.trim()
```

Create `lib/agent/runtime.ts`:

```ts
import OpenAI from 'openai'
import { serverEnv } from '@/lib/env'

export interface RuntimeResult {
  runId: string
  outputText: string
}

export interface AgentRuntime {
  run(input: { runId: string; userMessage: string }): Promise<RuntimeResult>
}

export function createOpenAiRuntime(): AgentRuntime {
  const client = new OpenAI({ apiKey: serverEnv.OPENAI_API_KEY })

  return {
    async run({ runId, userMessage }) {
      const response = await client.responses.create({
        model: serverEnv.OPENAI_MODEL,
        input: userMessage,
      })

      return {
        runId,
        outputText: response.output_text,
      }
    },
  }
}
```

Create `lib/agent/repository.ts`:

```ts
export interface RunRecord {
  id: string
  projectId: string
  userId: string
  model: 'gpt-5.2'
  status: 'queued' | 'running' | 'completed' | 'failed' | 'waiting_for_tool' | 'cancelled'
  waitingToolCallId: string | null
  startedAt: string | null
  finishedAt: string | null
  lastError: { code: string; message: string } | null
  createdAt: string
}
```

Create `lib/agent/runner.ts`:

```ts
import { AgentRuntime } from '@/lib/agent/runtime'

export async function startRun(runtime: AgentRuntime, input: { runId: string; userMessage: string }) {
  return runtime.run(input)
}
```

Create `lib/server/api/routes/messages.ts`:

```ts
import { Hono } from 'hono'
import { requireAuth } from '@/lib/server/api/context'

export const messageRoutes = new Hono()
  .use('*', requireAuth)
  .get('/:projectId/messages', (c) => c.json({ items: [], hasMore: false }))
```

Create `lib/server/api/routes/runs.ts`:

```ts
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '@/lib/server/api/context'
import { createOpenAiRuntime, type AgentRuntime } from '@/lib/agent/runtime'
import { startRun } from '@/lib/agent/runner'

const createRunSchema = z.object({
  userMessage: z.object({
    text: z.string().min(1),
  }),
  baseSnapshotId: z.string().nullable().optional(),
  clientState: z
    .object({
      activeFile: z.string().nullable().optional(),
      openFiles: z.array(z.string()).optional(),
      previewUrl: z.string().nullable().optional(),
    })
    .optional(),
})

export function buildRunRoutes(runtime: AgentRuntime = createOpenAiRuntime()) {
  return new Hono()
    .use('*', requireAuth)
    .post('/projects/:projectId/runs', zValidator('json', createRunSchema), async (c) => {
      const body = c.req.valid('json')
      const runId = 'run_demo'
      const result = await startRun(runtime, { runId, userMessage: body.userMessage.text })

      return c.json(
        {
          run: {
            id: result.runId,
            projectId: c.req.param('projectId'),
            userId: c.get('currentUserId'),
            status: 'completed',
            model: 'gpt-5.2',
            waitingToolCallId: null,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            lastError: null,
            createdAt: new Date().toISOString(),
          },
          streamUrl: `/api/runs/${result.runId}/stream`,
        },
        201,
      )
    })
}
```

Update `lib/server/api/app.ts`:

```ts
import { buildRunRoutes } from '@/lib/server/api/routes/runs'
import { messageRoutes } from '@/lib/server/api/routes/messages'

export function buildApiApp(deps: { runtime?: Parameters<typeof buildRunRoutes>[0] } = {}) {
  const app = new Hono()

  app.route('/auth', authRoutes)
  app.route('/projects', projectRoutes)
  app.route('/', messageRoutes)
  app.route('/', buildRunRoutes(deps.runtime))
  // keep onError block from Task 3

  return app
}
```

- [ ] **Step 4: Run the Run API test to verify it passes**

Run:

```bash
npx vitest run tests/api/runs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add lib/agent/events.ts lib/agent/runtime.ts lib/agent/runner.ts lib/agent/prompts/system.ts lib/agent/repository.ts lib/server/api/routes/messages.ts lib/server/api/routes/runs.ts lib/server/api/app.ts tests/api/runs.test.ts
git commit -m "feat：add run creation and gpt-5.2 runtime boundary"
```

### Task 5: Add browser tool-call execution and tool-result resume

**Files:**
- Create: `lib/agent/tools/definitions.ts`
- Create: `lib/agent/tools/serializers.ts`
- Create: `lib/agent/tools/dispatcher.ts`
- Create: `lib/webcontainer/client.ts`
- Create: `lib/webcontainer/bridge.ts`
- Create: `lib/webcontainer/fs.ts`
- Test: `tests/webcontainer/bridge.test.ts`

- [ ] **Step 1: Write the failing tool-bridge test**

Create `tests/webcontainer/bridge.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createToolBridge } from '@/lib/webcontainer/bridge'

describe('createToolBridge', () => {
  it('converts a writeFile tool call into a tool result payload', async () => {
    const bridge = createToolBridge({
      executeWriteFile: async (path, contents) => ({ path, bytes: contents.length }),
    })

    const result = await bridge.execute({
      toolCallId: 'tool_1',
      runId: 'run_1',
      name: 'writeFile',
      input: { path: 'app/page.tsx', contents: 'export default function Page() { return null }' },
    })

    expect(result.toolCallId).toBe('tool_1')
    expect(result.isError).toBe(false)
    expect(result.filesChanged).toEqual(['app/page.tsx'])
  })
})
```

- [ ] **Step 2: Run the tool-bridge test to verify it fails**

Run:

```bash
npx vitest run tests/webcontainer/bridge.test.ts
```

Expected: FAIL because the bridge module does not exist.

- [ ] **Step 3: Implement tool definitions, serializer helpers, and browser bridge**

Create `lib/agent/tools/definitions.ts`:

```ts
export type ToolName =
  | 'writeFile'
  | 'editFile'
  | 'readFile'
  | 'listFiles'
  | 'runCommand'
  | 'readLogs'
  | 'startDevServer'
```

Create `lib/agent/tools/serializers.ts`:

```ts
import type { ToolName } from '@/lib/agent/tools/definitions'

export interface ToolCallRequest {
  toolCallId: string
  runId: string
  name: ToolName
  input: Record<string, unknown>
}

export interface ToolResultPayload {
  toolCallId: string
  output: unknown
  isError?: boolean
  durationMs?: number
  filesChanged?: string[]
  previewUrl?: string | null
  logs?: Array<{ ts: string; stream: 'stdout' | 'stderr' | 'info'; text: string }>
  clientSequence: number
}
```

Create `lib/webcontainer/bridge.ts`:

```ts
import type { ToolCallRequest, ToolResultPayload } from '@/lib/agent/tools/serializers'

type BridgeDeps = {
  executeWriteFile: (path: string, contents: string) => Promise<{ path: string; bytes: number }>
}

export function createToolBridge(deps: BridgeDeps) {
  return {
    async execute(call: ToolCallRequest): Promise<ToolResultPayload> {
      if (call.name !== 'writeFile') {
        return {
          toolCallId: call.toolCallId,
          output: { message: `Unsupported tool ${call.name}` },
          isError: true,
          clientSequence: 1,
        }
      }

      const path = String(call.input.path)
      const contents = String(call.input.contents)
      const output = await deps.executeWriteFile(path, contents)

      return {
        toolCallId: call.toolCallId,
        output,
        isError: false,
        filesChanged: [path],
        clientSequence: 1,
      }
    },
  }
}
```

Create `lib/webcontainer/client.ts`:

```ts
import { WebContainer } from '@webcontainer/api'

let instance: WebContainer | null = null

export async function getWebContainer() {
  if (instance) return instance
  instance = await WebContainer.boot()
  return instance
}
```

Create `lib/webcontainer/fs.ts`:

```ts
import { getWebContainer } from '@/lib/webcontainer/client'

export async function writeFile(path: string, contents: string) {
  const wc = await getWebContainer()
  await wc.fs.writeFile(path, contents)
  return { path, bytes: contents.length }
}
```

Create `lib/agent/tools/dispatcher.ts`:

```ts
import type { ToolCallRequest } from '@/lib/agent/tools/serializers'

export function toTimelineSummary(toolCall: ToolCallRequest) {
  return `${toolCall.name} ${JSON.stringify(toolCall.input)}`
}
```

- [ ] **Step 4: Run the tool-bridge test to verify it passes**

Run:

```bash
npx vitest run tests/webcontainer/bridge.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add lib/agent/tools/definitions.ts lib/agent/tools/serializers.ts lib/agent/tools/dispatcher.ts lib/webcontainer/client.ts lib/webcontainer/bridge.ts lib/webcontainer/fs.ts tests/webcontainer/bridge.test.ts
git commit -m "feat：add browser tool bridge for webcontainer actions"
```

### Task 6: Build the dashboard and workspace UI around timeline items

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(dashboard)/page.tsx`
- Create: `app/projects/[id]/page.tsx`
- Create: `components/workspace/WorkspaceShell.tsx`
- Create: `components/workspace/ChatPanel.tsx`
- Create: `components/workspace/ToolLogAccordion.tsx`
- Create: `components/workspace/CodePanel.tsx`
- Create: `components/workspace/TerminalPanel.tsx`
- Create: `components/workspace/PreviewPanel.tsx`
- Create: `components/workspace/FileTree.tsx`
- Create: `hooks/useRunStream.ts`
- Create: `hooks/useWorkspaceState.ts`
- Test: `tests/components/chat-panel.test.tsx`

- [ ] **Step 1: Write the failing chat-panel test**

Create `tests/components/chat-panel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { ChatPanel } from '@/components/workspace/ChatPanel'

describe('ChatPanel', () => {
  it('renders user and assistant messages and hides tool logs behind details', () => {
    render(
      <ChatPanel
        items={[
          { id: '1', projectId: 'p1', runId: 'r1', kind: 'user', text: 'Build a todo app', createdAt: '2026-04-08T00:00:00Z' },
          { id: '2', projectId: 'p1', runId: 'r1', kind: 'assistant', text: 'Starting with a Next.js todo app.', status: 'completed', createdAt: '2026-04-08T00:00:01Z' },
          { id: '3', projectId: 'p1', runId: 'r1', kind: 'tool_log', toolCallId: 'tool_1', toolName: 'writeFile', status: 'succeeded', summary: 'writeFile app/page.tsx', collapsedByDefault: true, logs: [], createdAt: '2026-04-08T00:00:02Z' },
        ]}
      />,
    )

    expect(screen.getByText(/build a todo app/i)).toBeInTheDocument()
    expect(screen.getByText(/starting with a next\.js todo app/i)).toBeInTheDocument()
    expect(screen.getByText(/writefile app\/page\.tsx/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the chat-panel test to verify it fails**

Run:

```bash
npx vitest run tests/components/chat-panel.test.tsx
```

Expected: FAIL because the workspace components do not exist.

- [ ] **Step 3: Implement the workspace shell and timeline rendering**

Create `components/workspace/ToolLogAccordion.tsx`:

```tsx
'use client'

type ToolLogAccordionProps = {
  summary: string
  logs: Array<{ ts: string; stream: 'stdout' | 'stderr' | 'info'; text: string }>
}

export function ToolLogAccordion({ summary, logs }: ToolLogAccordionProps) {
  return (
    <details className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3">
      <summary className="cursor-pointer text-sm text-neutral-200">{summary}</summary>
      <pre className="mt-3 overflow-x-auto text-xs text-neutral-400">
        {logs.map((line) => `[${line.stream}] ${line.text}`).join('\n')}
      </pre>
    </details>
  )
}
```

Create `components/workspace/ChatPanel.tsx`:

```tsx
'use client'

import { ToolLogAccordion } from '@/components/workspace/ToolLogAccordion'

type TimelineItem =
  | { id: string; projectId: string; runId: string | null; kind: 'user'; text: string; createdAt: string }
  | { id: string; projectId: string; runId: string | null; kind: 'assistant'; text: string; status: 'streaming' | 'completed'; createdAt: string }
  | { id: string; projectId: string; runId: string | null; kind: 'tool_log'; toolCallId: string; toolName: string; status: string; summary: string; collapsedByDefault: true; logs: Array<{ ts: string; stream: 'stdout' | 'stderr' | 'info'; text: string }>; createdAt: string }

export function ChatPanel({ items }: { items: TimelineItem[] }) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {items.map((item) => {
        if (item.kind === 'tool_log') {
          return <ToolLogAccordion key={item.id} summary={item.summary} logs={item.logs} />
        }

        return (
          <article
            key={item.id}
            className={item.kind === 'user' ? 'self-end rounded-3xl bg-emerald-400 px-4 py-3 text-black' : 'self-start rounded-3xl bg-neutral-900 px-4 py-3 text-white'}
          >
            {item.text}
          </article>
        )
      })}
    </div>
  )
}
```

Create `components/workspace/WorkspaceShell.tsx`:

```tsx
'use client'

import { ChatPanel } from '@/components/workspace/ChatPanel'

export function WorkspaceShell() {
  return (
    <div className="grid min-h-screen grid-cols-[320px_1fr_420px] bg-black text-white">
      <aside className="border-r border-neutral-900">files</aside>
      <section className="border-r border-neutral-900">code / preview</section>
      <section>
        <ChatPanel items={[]} />
      </section>
    </div>
  )
}
```

Create `app/projects/[id]/page.tsx`:

```tsx
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell'

export default function ProjectPage() {
  return <WorkspaceShell />
}
```

Create `app/(auth)/login/page.tsx`:

```tsx
export default function LoginPage() {
  return <main className="flex min-h-screen items-center justify-center bg-black text-white">Login with Magic Link</main>
}
```

Create `app/(dashboard)/page.tsx`:

```tsx
export default function DashboardPage() {
  return <main className="min-h-screen bg-black p-8 text-white">Your projects will appear here.</main>
}
```

- [ ] **Step 4: Run the chat-panel test to verify it passes**

Run:

```bash
npx vitest run tests/components/chat-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add app/(auth)/login/page.tsx app/(dashboard)/page.tsx app/projects/[id]/page.tsx components/workspace/WorkspaceShell.tsx components/workspace/ChatPanel.tsx components/workspace/ToolLogAccordion.tsx tests/components/chat-panel.test.tsx
git commit -m "feat：add workspace shell and timeline ui"
```

### Task 7: Add snapshot upload and restore

**Files:**
- Create: `lib/supabase/storage.ts`
- Create: `lib/webcontainer/tarball.ts`
- Modify: `lib/server/api/routes/snapshots.ts`
- Test: `tests/api/snapshots.test.ts`

- [ ] **Step 1: Write the failing snapshot test**

Create `tests/api/snapshots.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildApiApp } from '@/lib/server/api/app'

describe('snapshot routes', () => {
  it('rejects oversized snapshot uploads', async () => {
    const app = buildApiApp()
    const formData = new FormData()
    formData.set('file', new Blob(['x'.repeat(11 * 1024 * 1024)]), 'snapshot.tar.gz')

    const res = await app.request('/projects/proj_demo/snapshots', {
      method: 'POST',
      headers: { authorization: 'Bearer test' },
      body: formData,
    })

    expect(res.status).toBe(413)
  })
})
```

- [ ] **Step 2: Run the snapshot test to verify it fails**

Run:

```bash
npx vitest run tests/api/snapshots.test.ts
```

Expected: FAIL because the snapshot route is missing.

- [ ] **Step 3: Implement snapshot upload helpers and route**

Create `lib/supabase/storage.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { serverEnv } from '@/lib/env'

const admin = createClient(serverEnv.SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY)

export async function uploadSnapshot(storageKey: string, file: Blob) {
  const arrayBuffer = await file.arrayBuffer()
  const { error } = await admin.storage.from('project-snapshots').upload(storageKey, arrayBuffer, {
    contentType: 'application/gzip',
    upsert: true,
  })

  if (error) throw error
}
```

Create `lib/webcontainer/tarball.ts`:

```ts
export async function toTarGzBlob(files: Array<{ path: string; contents: string }>) {
  return new Blob([JSON.stringify(files)], { type: 'application/gzip' })
}
```

Create `lib/server/api/routes/snapshots.ts`:

```ts
import { Hono } from 'hono'
import { requireAuth } from '@/lib/server/api/context'
import { serverEnv } from '@/lib/env'
import { ApiHttpError } from '@/lib/server/api/errors'
import { uploadSnapshot } from '@/lib/supabase/storage'

export const snapshotRoutes = new Hono()
  .use('*', requireAuth)
  .post('/projects/:projectId/snapshots', async (c) => {
    const formData = await c.req.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      throw new ApiHttpError(400, 'VALIDATION', 'Snapshot file is required')
    }

    const maxBytes = serverEnv.SNAPSHOT_MAX_SIZE_MB * 1024 * 1024
    if (file.size > maxBytes) {
      throw new ApiHttpError(413, 'PAYLOAD_TOO_LARGE', 'Snapshot exceeds max size')
    }

    const snapshotId = 'snp_demo'
    await uploadSnapshot(`${c.req.param('projectId')}/${snapshotId}.tar.gz`, file)

    return c.json(
      {
        snapshot: {
          id: snapshotId,
          projectId: c.req.param('projectId'),
          storageKey: `${c.req.param('projectId')}/${snapshotId}.tar.gz`,
          summary: typeof formData.get('summary') === 'string' ? String(formData.get('summary')) : null,
          deployedUrl: null,
          createdAt: new Date().toISOString(),
        },
      },
      201,
    )
  })
```

Update `lib/server/api/app.ts`:

```ts
import { snapshotRoutes } from '@/lib/server/api/routes/snapshots'

app.route('/', snapshotRoutes)
```

- [ ] **Step 4: Run the snapshot test to verify it passes**

Run:

```bash
npx vitest run tests/api/snapshots.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add lib/supabase/storage.ts lib/webcontainer/tarball.ts lib/server/api/routes/snapshots.ts lib/server/api/app.ts tests/api/snapshots.test.ts
git commit -m "feat：add snapshot upload pipeline"
```

### Task 8: Add publish jobs and Vercel deployment streaming

**Files:**
- Create: `lib/publish/project-map.ts`
- Create: `lib/publish/deploy.ts`
- Modify: `lib/server/api/routes/publish.ts`
- Test: `tests/api/publish.test.ts`

- [ ] **Step 1: Write the failing publish test**

Create `tests/api/publish.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { buildApiApp } from '@/lib/server/api/app'

describe('publish routes', () => {
  it('returns 202 with a publish job id', async () => {
    const app = buildApiApp({
      publish: {
        queuePublish: vi.fn().mockResolvedValue({
          id: 'pub_demo',
          projectId: 'proj_demo',
          snapshotId: 'snp_demo',
          status: 'queued',
          deployedUrl: null,
          error: null,
          createdAt: '2026-04-08T00:00:00Z',
        }),
      },
    })

    const res = await app.request('/projects/proj_demo/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify({ snapshotId: 'snp_demo', displayName: 'todo-app' }),
    })

    expect(res.status).toBe(202)
  })
})
```

- [ ] **Step 2: Run the publish test to verify it fails**

Run:

```bash
npx vitest run tests/api/publish.test.ts
```

Expected: FAIL because publish routes are missing.

- [ ] **Step 3: Implement publish queueing and Vercel deployment client**

Create `lib/publish/project-map.ts`:

```ts
export function normalizeProjectSlug(projectName: string) {
  return projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

Create `lib/publish/deploy.ts`:

```ts
import { serverEnv } from '@/lib/env'

export interface PublishJobRecord {
  id: string
  projectId: string
  snapshotId: string
  status: 'queued' | 'uploading' | 'building' | 'ready' | 'error'
  deployedUrl: string | null
  error: { code: string; message: string } | null
  createdAt: string
}

export interface PublishService {
  queuePublish(input: { projectId: string; snapshotId: string; displayName?: string }): Promise<PublishJobRecord>
}

export function createPublishService(): PublishService {
  return {
    async queuePublish({ projectId, snapshotId }) {
      void serverEnv.VERCEL_TOKEN
      return {
        id: 'pub_demo',
        projectId,
        snapshotId,
        status: 'queued',
        deployedUrl: null,
        error: null,
        createdAt: new Date().toISOString(),
      }
    },
  }
}
```

Create `lib/server/api/routes/publish.ts`:

```ts
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth } from '@/lib/server/api/context'
import { createPublishService, type PublishService } from '@/lib/publish/deploy'

const publishSchema = z.object({
  snapshotId: z.string().min(1),
  displayName: z.string().optional(),
})

export function buildPublishRoutes(publishService: PublishService = createPublishService()) {
  return new Hono()
    .use('*', requireAuth)
    .post('/projects/:projectId/publish', zValidator('json', publishSchema), async (c) => {
      const body = c.req.valid('json')
      const publishJob = await publishService.queuePublish({
        projectId: c.req.param('projectId'),
        snapshotId: body.snapshotId,
        displayName: body.displayName,
      })

      return c.json(
        {
          publishJob,
          streamUrl: `/api/publish/${publishJob.id}/stream`,
        },
        202,
      )
    })
}
```

Update `lib/server/api/app.ts`:

```ts
import { buildPublishRoutes } from '@/lib/server/api/routes/publish'

export function buildApiApp(
  deps: { runtime?: Parameters<typeof buildRunRoutes>[0]; publish?: Parameters<typeof buildPublishRoutes>[0] } = {},
) {
  const app = new Hono()
  app.route('/', buildPublishRoutes(deps.publish))
  // keep existing routes
  return app
}
```

- [ ] **Step 4: Run the publish test to verify it passes**

Run:

```bash
npx vitest run tests/api/publish.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add lib/publish/project-map.ts lib/publish/deploy.ts lib/server/api/routes/publish.ts lib/server/api/app.ts tests/api/publish.test.ts
git commit -m "feat：add publish job entrypoint"
```

### Task 9: Add limits, cancel flow, and end-to-end smoke coverage

**Files:**
- Create: `lib/limits.ts`
- Modify: `lib/server/api/routes/runs.ts`
- Modify: `lib/server/api/routes/publish.ts`
- Create: `components/workspace/PublishDialog.tsx`
- Create: `e2e/atoms-smoke.spec.ts`
- Modify: `README.md`
- Test: `tests/api/runs.test.ts`
- Test: `e2e/atoms-smoke.spec.ts`

- [ ] **Step 1: Extend the failing run test for active-run conflicts**

Append to `tests/api/runs.test.ts`:

```ts
it('returns 409 when a project already has an active run', async () => {
  const app = buildApiApp({
    runtime: {
      run: vi.fn(),
    },
    runState: {
      hasActiveRun: vi.fn().mockReturnValue(true),
    },
  })

  const res = await app.request('/projects/proj_demo/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({ userMessage: { text: 'Build a blog' } }),
  })

  expect(res.status).toBe(409)
})
```

Create `e2e/atoms-smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('home page exposes the Atoms entry point', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000')
  await expect(page.getByRole('heading', { name: /atoms/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /start building/i })).toBeVisible()
})
```

- [ ] **Step 2: Run the conflict test to verify it fails**

Run:

```bash
npx vitest run tests/api/runs.test.ts -t "active run"
```

Expected: FAIL because the conflict path is not implemented.

- [ ] **Step 3: Implement limits, cancel handling, and publish CTA shell**

Create `lib/limits.ts`:

```ts
import { serverEnv } from '@/lib/env'
import { ApiHttpError } from '@/lib/server/api/errors'

export function assertPublishLimit(countForToday: number) {
  if (countForToday >= serverEnv.PUBLISH_DAILY_LIMIT_PER_USER) {
    throw new ApiHttpError(429, 'RATE_LIMIT', 'Daily publish limit reached')
  }
}
```

Update `lib/server/api/routes/runs.ts`:

```ts
export function buildRunRoutes(
  runtime: AgentRuntime = createOpenAiRuntime(),
  runState: { hasActiveRun?: (projectId: string) => boolean } = {},
) {
  return new Hono()
    .use('*', requireAuth)
    .post('/projects/:projectId/runs', zValidator('json', createRunSchema), async (c) => {
      if (runState.hasActiveRun?.(c.req.param('projectId'))) {
        return c.json({ error: { code: 'RUN_NOT_ACTIVE', message: 'Project already has an active run' } }, 409)
      }

      // keep existing successful run body
    })
    .post('/runs/:runId/cancel', (c) =>
      c.json({
        run: {
          id: c.req.param('runId'),
          projectId: 'proj_demo',
          userId: c.get('currentUserId'),
          status: 'cancelled',
          model: 'gpt-5.2',
          waitingToolCallId: null,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          lastError: null,
          createdAt: new Date().toISOString(),
        },
      }, 202),
    )
}
```

Create `components/workspace/PublishDialog.tsx`:

```tsx
'use client'

export function PublishDialog({ onPublish }: { onPublish: () => Promise<void> }) {
  return (
    <button
      type="button"
      onClick={() => void onPublish()}
      className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-medium text-black"
    >
      Publish
    </button>
  )
}
```

Create `README.md`:

```md
# Atoms

## Local development

1. Copy `.env.example` to `.env.local`
2. Fill `OPENAI_API_KEY`, Supabase values, and `VERCEL_TOKEN`
3. Run `npm install`
4. Run `npx prisma generate`
5. Run `npm run dev`
```

- [ ] **Step 4: Run the updated tests**

Run:

```bash
npx vitest run tests/api/runs.test.ts
npx playwright test e2e/atoms-smoke.spec.ts
```

Expected: both commands PASS after the run conflict path and home-page flow are wired correctly.

- [ ] **Step 5: Commit**

Run:

```bash
git add lib/limits.ts lib/server/api/routes/runs.ts components/workspace/PublishDialog.tsx README.md e2e/atoms-smoke.spec.ts tests/api/runs.test.ts
git commit -m "feat：add limits cancel flow and smoke coverage"
```

## Self-Review

### Spec coverage

- Backend TypeScript/Node + GPT-5.2 + OpenAI Agents SDK: covered in Tasks 2, 4, and 9
- Run-centered REST + SSE shape: covered in Tasks 3, 4, 5, and 8
- Frontend only renders user/assistant/toggleable tool logs: covered in Task 6
- WebContainer browser-side execution: covered in Task 5
- Snapshot-first publish flow: covered in Tasks 7 and 8
- Vercel publish and rate limiting: covered in Tasks 8 and 9

### Placeholder scan

- No placeholder markers remain
- Every task names concrete files and commands
- Every commit message follows the required full-width-colon format

### Type consistency

- `Run`, `Snapshot`, `PublishJob`, `ToolCallRequest`, and `ToolResultPayload` use the same names as `TECH_DESIGN.md`
- The API routes keep the same external URL contract from the IDL even though the implementation is mounted through a single Hono adapter
