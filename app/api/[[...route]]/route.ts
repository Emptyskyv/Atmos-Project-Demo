import { handle } from 'hono/vercel'
import { buildApiApp } from '@/src/backend/api/app'
import { createPrismaRepository } from '@/src/backend/data/prisma'

const handler = handle(buildApiApp({ repository: createPrismaRepository() }))

export const GET = handler
export const POST = handler
export const PATCH = handler
export const DELETE = handler
