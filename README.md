# Atoms

## Structure

- `app/`: thin Next.js route entrypoints only
- `src/frontend/`: page implementations, UI components, client hooks, browser workspace runtime
- `src/backend/`: Hono API, auth, data access, agent runtime, publish and storage services
- `src/shared/`: contracts shared by frontend and backend

## Local development

1. Copy `.env.example` to `.env.local`.
2. Use a local PostgreSQL `DATABASE_URL`, for example `postgresql://postgres:postgres@127.0.0.1:5432/atoms?schema=public`.
3. Fill in `OPENAI_API_KEY` and `VERCEL_TOKEN`.
4. Set `OPENAI_BASE_URL` to the gateway's OpenAI-compatible `/v1` root, for example `https://www.openclaudecode.cn/v1`.
5. `OPENAI_RESPONSES_URL` is optional. If you only have a full `/responses` endpoint URL, the server can derive the base API root from it.
6. `OPENAI_RUNTIME` defaults to `auto`. Force it to `agents` when your provider requires the OpenAI Responses API, such as OpenClaw's Codex provider.
7. `OPENAI_REQUEST_HEADERS` is optional. Set it to a JSON object when your gateway requires provider-specific headers, for example `{"Authorization":"Bearer sk-xxx","User-Agent":"codex_cli_rs/0.77.0 (Windows 10.0.26100; x86_64) WindowsTerminal"}`.
8. `OPENAI_MODEL` can be any non-empty model id supported by your gateway, for example `glm-5`, `gpt-5.2`, or `gpt-5.3-codex`.
9. Run `npm install`.
10. Run `npx prisma generate`.
11. Run `npx prisma migrate deploy`.
12. Run `npm run dev`.

Project snapshots are now stored on the local filesystem under `.data/snapshots/`.
`VERCEL_TEAM_ID` is optional and only needed when deploying into a Vercel team scope.
