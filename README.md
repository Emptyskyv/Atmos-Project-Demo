# Atoms

Atoms is an AI app-building workspace. Users can sign in, create a project, describe what they want in chat, inspect the generated workspace, preview the app, and publish a shareable deployment.

The current platform deployment runs on Railway. User project publishing is still delegated to Vercel through the backend publish flow.

## Current status

Atoms is past the pure prototype stage and already has a usable product skeleton:

- account registration, login, session handling, and sign-out
- dashboard with persisted project list
- project workspace with chat timeline, file tree, code view, terminal output, and preview panel
- backend-driven agent runtime with REST + SSE run orchestration
- server-side tool execution for file edits and shell commands
- snapshot creation and publish flow
- Railway deployment for the platform itself

The main remaining gap is reliability hardening: multi-step run success rate, clearer failure handling, stronger observability, and more production-grade guardrails.

## Product flow

1. A user signs in and creates a project from the dashboard.
2. The project opens in the workspace UI.
3. The frontend starts a run, while the backend owns the agent loop and streams status updates back over SSE.
4. Tool calls are executed on the server workspace and reflected back into the UI timeline, file tree, terminal, and preview state.
5. When the user publishes, the current workspace is snapshotted and the backend sends that snapshot to Vercel for a public deployment.

## Architecture

### App structure

- `app/`: thin Next.js route entrypoints
- `src/frontend/`: pages, UI components, client hooks, browser workspace helpers
- `src/backend/`: API routes, auth, persistence, agent runtime, publish and workspace services
- `src/shared/`: contracts shared between frontend and backend

### Runtime split

- Frontend:
  - renders the product UI
  - consumes streamed run events
  - shows workspace state, preview, timeline, and publish progress
- Backend:
  - authenticates users
  - persists project/run/message/snapshot state
  - owns the agent runtime
  - executes tools against the server workspace
  - manages publish jobs

### Deployment split

- Railway:
  - hosts the Atoms platform
  - runs migrations before deploy
  - stores runtime workspaces and snapshots on a persistent volume
- Vercel:
  - receives published user projects through the deploy API

## Core capabilities

- Auth:
  - email + password registration and login
  - session-backed protected dashboard and workspace routes
- Workspace:
  - chat timeline
  - tool logs
  - file tree and code panel
  - terminal output panel
  - preview panel with first-party preview proxy path
- Agent runtime:
  - backend-managed run state
  - OpenAI Agents SDK / OpenAI-compatible runtime selection
  - tool execution covering `read`, `list`, `glob`, `grep`, `write`, `edit`, `applyPatch`, and `bash`
- Persistence:
  - PostgreSQL via Prisma for structured data
  - filesystem-backed snapshot storage under `.data/` locally or Railway volume storage in production
- Publishing:
  - create snapshot from workspace
  - start publish job
  - poll deployment status
  - surface public deployment URL back into the workspace

## Local development

1. Copy `.env.example` to `.env.local`.
2. Configure the database:
   - `DIRECT_URL` for Prisma CLI and migrations
   - `DATABASE_URL` for the running app
3. Configure Supabase:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Configure model/runtime access:
   - `OPENAI_API_KEY`
   - `OPENAI_BASE_URL`
   - `OPENAI_RESPONSES_URL` when needed
   - `OPENAI_RUNTIME`
   - `OPENAI_REQUEST_HEADERS` when needed
   - `OPENAI_MODEL`
5. Configure publishing:
   - `VERCEL_TOKEN`
   - `VERCEL_TEAM_ID` when deploying into a team scope
6. Install dependencies:
   - `npm install`
7. Generate Prisma client:
   - `npx prisma generate`
8. Apply migrations:
   - `npx prisma migrate deploy`
9. Start the app:
   - `npm run dev`

## Environment notes

Important runtime variables:

- `DATABASE_URL`: required for the app runtime
- `DIRECT_URL`: recommended for Prisma CLI and migrations
- `OPENAI_API_KEY`: required for model access
- `OPENAI_MODEL`: model identifier used for new runs
- `VERCEL_TOKEN`: required for the publish flow
- `PUBLISH_DAILY_LIMIT_PER_USER`: daily publish cap per user
- `RUN_MAX_STEPS`: max steps allowed per run
- `SNAPSHOT_MAX_SIZE_MB`: snapshot upload size cap

Project snapshots are stored locally under `.data/snapshots/`.
Workspaces and restored files are stored under `.data/workspaces/` unless `ATOMS_DATA_ROOT` or Railway volume storage overrides the location.

## Railway deployment

This repository includes [`railway.json`](/Users/bytedance/atoms_project/railway.json), which defines:

- Railpack-based builds
- `npx prisma migrate deploy` as a pre-deploy step
- health checks on `GET /health`
- service startup through `npm run start -- --hostname 0.0.0.0 --port $PORT`

Recommended Railway setup:

1. Create a Railway service from this repository.
2. Attach a persistent volume.
3. Provide the same runtime environment variables used locally.
4. Deploy the service.

The current Railway service domain is:

- [web-production-77ec0.up.railway.app](https://web-production-77ec0.up.railway.app)

## Testing

Useful commands:

- `npm test`
- `npm test -- tests/app/login.test.tsx tests/components/auth-form.test.tsx`
- `npm run build`

Note that `npm run build` requires the database environment to be present because Prisma config resolves its datasource URL during build setup.

## Repository state note

This workspace may contain local-only changes that are not yet committed or pushed. Check git status before publishing or sharing repository state as final.
