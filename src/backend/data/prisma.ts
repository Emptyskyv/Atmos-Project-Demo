import type { Prisma, PrismaClient } from '@prisma/client'
import type {
  AppRepository,
  MessageRecord,
  ProjectRecord,
  PublishJobRecord,
  RunRecord,
  SessionRecord,
  SnapshotRecord,
  ToolCallRecord,
  UserRecord,
} from '@/src/backend/data/types'

function toUserRecord(user: {
  id: string
  email: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
}): UserRecord {
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

async function getDb(): Promise<PrismaClient> {
  const { db } = await import('@/src/backend/platform/db/client')
  return db
}

function toSessionRecord(session: {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  createdAt: Date
}): SessionRecord {
  return {
    ...session,
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
  }
}

function toProjectRecord(project: {
  id: string
  userId: string
  name: string
  description: string | null
  templateKey: string
  status: string
  deployedUrl: string | null
  vercelProjectSlug: string | null
  latestSnapshotId: string | null
  latestRunId: string | null
  createdAt: Date
  updatedAt: Date
}): ProjectRecord {
  return {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }
}

function toRunRecord(run: {
  id: string
  projectId: string
  userId: string
  model: string
  status: string
  waitingToolCallId: string | null
  lastError: Prisma.JsonValue | null
  serializedState: Prisma.JsonValue | null
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}): RunRecord {
  return {
    ...run,
    lastError: run.lastError,
    serializedState: run.serializedState,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
  }
}

function toMessageRecord(message: {
  id: string
  projectId: string
  runId: string | null
  kind: string
  payload: Prisma.JsonValue
  createdAt: Date
}): MessageRecord {
  return {
    ...message,
    payload: (message.payload ?? {}) as Record<string, unknown>,
    createdAt: message.createdAt.toISOString(),
  }
}

function toSnapshotRecord(snapshot: {
  id: string
  projectId: string
  storageKey: string
  summary: string | null
  deployedUrl: string | null
  createdAt: Date
}): SnapshotRecord {
  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
  }
}

function toPublishJobRecord(publishJob: {
  id: string
  projectId: string
  snapshotId: string
  status: string
  deployedUrl: string | null
  lastError: Prisma.JsonValue | null
  createdAt: Date
}): PublishJobRecord {
  return {
    ...publishJob,
    lastError: publishJob.lastError,
    createdAt: publishJob.createdAt.toISOString(),
  }
}

function toToolCallRecord(toolCall: {
  id: string
  runId: string
  projectId: string
  userId: string
  toolCallId: string
  name: string
  input: Prisma.JsonValue
  status: string
  output: Prisma.JsonValue | null
  isError: boolean
  clientSequence: number | null
  createdAt: Date
  updatedAt: Date
}): ToolCallRecord {
  return {
    ...toolCall,
    input: (toolCall.input ?? {}) as Record<string, unknown>,
    output: toolCall.output,
    createdAt: toolCall.createdAt.toISOString(),
    updatedAt: toolCall.updatedAt.toISOString(),
  }
}

function toRequiredInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

export function createPrismaRepository(): AppRepository {
  return {
    async createUser({ email, passwordHash }) {
      const db = await getDb()
      const user = await db.user.create({
        data: { email, passwordHash },
      })

      return toUserRecord(user)
    },
    async findUserByEmail(email) {
      const db = await getDb()
      const user = await db.user.findUnique({ where: { email } })
      return user ? toUserRecord(user) : null
    },
    async findUserById(id) {
      const db = await getDb()
      const user = await db.user.findUnique({ where: { id } })
      return user ? toUserRecord(user) : null
    },
    async createSession({ userId, tokenHash, expiresAt }) {
      const db = await getDb()
      const session = await db.session.create({
        data: {
          userId,
          tokenHash,
          expiresAt: new Date(expiresAt),
        },
      })

      return toSessionRecord(session)
    },
    async findSessionByTokenHash(tokenHash) {
      const db = await getDb()
      const session = await db.session.findUnique({
        where: { tokenHash },
        include: { user: true },
      })

      return session
        ? {
            session: toSessionRecord(session),
            user: toUserRecord(session.user),
          }
        : null
    },
    async deleteSessionByTokenHash(tokenHash) {
      const db = await getDb()
      await db.session.deleteMany({ where: { tokenHash } })
    },
    async listProjects(userId) {
      const db = await getDb()
      const projects = await db.project.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      })
      return projects.map(toProjectRecord)
    },
    async createProject({ userId, name, description, templateKey, status }) {
      const db = await getDb()
      const project = await db.project.create({
        data: {
          userId,
          name,
          description: description ?? null,
          templateKey,
          status,
        },
      })
      return toProjectRecord(project)
    },
    async getProjectById(userId, projectId) {
      const db = await getDb()
      const project = await db.project.findFirst({
        where: { id: projectId, userId },
      })
      return project ? toProjectRecord(project) : null
    },
    async updateProject(projectId, patch) {
      const db = await getDb()
      const project = await db.project.update({
        where: { id: projectId },
        data: {
          name: patch.name,
          description: patch.description,
          templateKey: patch.templateKey,
          status: patch.status,
          deployedUrl: patch.deployedUrl,
          vercelProjectSlug: patch.vercelProjectSlug,
          latestSnapshotId: patch.latestSnapshotId,
          latestRunId: patch.latestRunId,
        },
      })
      return toProjectRecord(project)
    },
    async listMessages(projectId, limit, beforeId) {
      const db = await getDb()
      const before = beforeId ? await db.message.findUnique({ where: { id: beforeId } }) : null
      const messages = await db.message.findMany({
        where: {
          projectId,
          ...(before ? { createdAt: { lt: before.createdAt } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      return messages.reverse().map(toMessageRecord)
    },
    async createMessage({ projectId, runId, kind, payload }) {
      const db = await getDb()
      const message = await db.message.create({
        data: {
          projectId,
          runId: runId ?? null,
          kind,
          payload: toRequiredInputJsonValue(payload),
        },
      })
      return toMessageRecord(message)
    },
    async getActiveRun(projectId) {
      const db = await getDb()
      const run = await db.run.findFirst({
        where: {
          projectId,
          status: { in: ['queued', 'running', 'waiting_for_tool'] },
        },
        orderBy: { createdAt: 'desc' },
      })
      return run ? toRunRecord(run) : null
    },
    async createRun(input) {
      const db = await getDb()
      const run = await db.run.create({
        data: {
          projectId: input.projectId,
          userId: input.userId,
          model: input.model,
          status: input.status,
          waitingToolCallId: input.waitingToolCallId ?? null,
          lastError: input.lastError as Prisma.InputJsonValue | undefined,
          serializedState: input.serializedState as Prisma.InputJsonValue | undefined,
          startedAt: input.startedAt ? new Date(input.startedAt) : null,
          finishedAt: input.finishedAt ? new Date(input.finishedAt) : null,
        },
      })
      return toRunRecord(run)
    },
    async getRunById(runId) {
      const db = await getDb()
      const run = await db.run.findUnique({ where: { id: runId } })
      return run ? toRunRecord(run) : null
    },
    async listRuns(projectId, limit) {
      const db = await getDb()
      const runs = await db.run.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      return runs.map(toRunRecord)
    },
    async updateRun(runId, patch) {
      const db = await getDb()
      const run = await db.run.update({
        where: { id: runId },
        data: {
          model: patch.model,
          status: patch.status,
          waitingToolCallId: patch.waitingToolCallId,
          lastError: patch.lastError as Prisma.InputJsonValue | undefined,
          serializedState: patch.serializedState as Prisma.InputJsonValue | undefined,
          startedAt: patch.startedAt ? new Date(patch.startedAt) : patch.startedAt === null ? null : undefined,
          finishedAt: patch.finishedAt ? new Date(patch.finishedAt) : patch.finishedAt === null ? null : undefined,
        },
      })
      return toRunRecord(run)
    },
    async createSnapshot({ id, projectId, storageKey, summary }) {
      const db = await getDb()
      const snapshot = await db.snapshot.create({
        data: {
          id,
          projectId,
          storageKey,
          summary: summary ?? null,
        },
      })
      return toSnapshotRecord(snapshot)
    },
    async getSnapshotById(id) {
      const db = await getDb()
      const snapshot = await db.snapshot.findUnique({ where: { id } })
      return snapshot ? toSnapshotRecord(snapshot) : null
    },
    async listSnapshots(projectId) {
      const db = await getDb()
      const snapshots = await db.snapshot.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      })
      return snapshots.map(toSnapshotRecord)
    },
    async createPublishJob({ id, projectId, snapshotId, status, deployedUrl, lastError }) {
      const db = await getDb()
      const publishJob = await db.publishJob.create({
        data: {
          id,
          projectId,
          snapshotId,
          status,
          deployedUrl: deployedUrl ?? null,
          lastError: lastError as Prisma.InputJsonValue | undefined,
        },
      })
      return toPublishJobRecord(publishJob)
    },
    async countPublishJobsForUserSince(userId, sinceIso) {
      const db = await getDb()
      return db.publishJob.count({
        where: {
          createdAt: { gte: new Date(sinceIso) },
          project: { userId },
        },
      })
    },
    async getPublishJobById(id) {
      const db = await getDb()
      const publishJob = await db.publishJob.findUnique({ where: { id } })
      return publishJob ? toPublishJobRecord(publishJob) : null
    },
    async updatePublishJob(id, patch) {
      const db = await getDb()
      const publishJob = await db.publishJob.update({
        where: { id },
        data: {
          status: patch.status,
          deployedUrl: patch.deployedUrl,
          lastError: patch.lastError as Prisma.InputJsonValue | undefined,
        },
      })
      return toPublishJobRecord(publishJob)
    },
    async createToolCall({ runId, projectId, userId, toolCallId, name, input, status }) {
      const db = await getDb()
      const toolCall = await db.toolCall.create({
        data: {
          runId,
          projectId,
          userId,
          toolCallId,
          name,
          input: toRequiredInputJsonValue(input),
          status,
        },
      })
      return toToolCallRecord(toolCall)
    },
    async getToolCallByCallId(toolCallId) {
      const db = await getDb()
      const toolCall = await db.toolCall.findUnique({ where: { toolCallId } })
      return toolCall ? toToolCallRecord(toolCall) : null
    },
    async listToolCallsForRun(runId) {
      const db = await getDb()
      const toolCalls = await db.toolCall.findMany({
        where: { runId },
        orderBy: { createdAt: 'asc' },
      })
      return toolCalls.map(toToolCallRecord)
    },
    async updateToolCall(toolCallId, patch) {
      const db = await getDb()
      const toolCall = await db.toolCall.update({
        where: { toolCallId },
        data: {
          status: patch.status,
          output: patch.output as Prisma.InputJsonValue | undefined,
          isError: patch.isError,
          clientSequence: patch.clientSequence,
        },
      })
      return toToolCallRecord(toolCall)
    },
  }
}
