import { randomUUID } from 'node:crypto'
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

function now() {
  return new Date().toISOString()
}

export function createMemoryRepository(): AppRepository {
  const users = new Map<string, UserRecord>()
  const usersByEmail = new Map<string, string>()
  const sessions = new Map<string, SessionRecord>()
  const projects = new Map<string, ProjectRecord>()
  const messages = new Map<string, MessageRecord>()
  const runs = new Map<string, RunRecord>()
  const snapshots = new Map<string, SnapshotRecord>()
  const publishJobs = new Map<string, PublishJobRecord>()
  const toolCalls = new Map<string, ToolCallRecord>()

  return {
    async createUser({ email, passwordHash }) {
      const id = `usr_${randomUUID()}`
      const timestamp = now()
      const user: UserRecord = { id, email, passwordHash, createdAt: timestamp, updatedAt: timestamp }
      users.set(id, user)
      usersByEmail.set(email, id)
      return user
    },
    async findUserByEmail(email) {
      const id = usersByEmail.get(email)
      return id ? users.get(id) ?? null : null
    },
    async findUserById(id) {
      return users.get(id) ?? null
    },
    async createSession({ userId, tokenHash, expiresAt }) {
      const session: SessionRecord = {
        id: `ses_${randomUUID()}`,
        userId,
        tokenHash,
        expiresAt,
        createdAt: now(),
      }
      sessions.set(tokenHash, session)
      return session
    },
    async findSessionByTokenHash(tokenHash) {
      const session = sessions.get(tokenHash)
      if (!session) {
        return null
      }
      const user = users.get(session.userId)
      if (!user) {
        return null
      }
      return { session, user }
    },
    async deleteSessionByTokenHash(tokenHash) {
      sessions.delete(tokenHash)
    },
    async listProjects(userId) {
      return [...projects.values()].filter((project) => project.userId === userId)
    },
    async createProject({ userId, name, description, templateKey, status }) {
      const timestamp = now()
      const project: ProjectRecord = {
        id: `proj_${randomUUID()}`,
        userId,
        name,
        description: description ?? null,
        templateKey,
        status,
        deployedUrl: null,
        vercelProjectSlug: null,
        latestSnapshotId: null,
        latestRunId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      projects.set(project.id, project)
      return project
    },
    async getProjectById(userId, projectId) {
      const project = projects.get(projectId)
      if (!project || project.userId !== userId) {
        return null
      }
      return project
    },
    async updateProject(projectId, patch) {
      const existing = projects.get(projectId)
      if (!existing) {
        throw new Error(`Project ${projectId} not found`)
      }
      const updated = {
        ...existing,
        ...patch,
        updatedAt: patch.updatedAt ?? now(),
      }
      projects.set(projectId, updated)
      return updated
    },
    async listMessages(projectId, limit, beforeId) {
      const ordered = [...messages.values()]
        .filter((message) => message.projectId === projectId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      const filtered = beforeId ? ordered.filter((message) => message.id < beforeId) : ordered
      return filtered.slice(-limit)
    },
    async createMessage({ projectId, runId, kind, payload }) {
      const message: MessageRecord = {
        id: `msg_${randomUUID()}`,
        projectId,
        runId: runId ?? null,
        kind,
        payload,
        createdAt: now(),
      }
      messages.set(message.id, message)
      return message
    },
    async getActiveRun(projectId) {
      return (
        [...runs.values()].find(
          (run) =>
            run.projectId === projectId &&
            ['queued', 'running', 'waiting_for_tool'].includes(run.status),
        ) ?? null
      )
    },
    async createRun(input) {
      const timestamp = now()
      const run: RunRecord = {
        id: `run_${randomUUID()}`,
        projectId: input.projectId,
        userId: input.userId,
        model: input.model,
        status: input.status,
        waitingToolCallId: input.waitingToolCallId ?? null,
        lastError: input.lastError ?? null,
        serializedState: input.serializedState ?? null,
        createdAt: timestamp,
        startedAt: input.startedAt ?? null,
        finishedAt: input.finishedAt ?? null,
      }
      runs.set(run.id, run)
      return run
    },
    async getRunById(runId) {
      return runs.get(runId) ?? null
    },
    async listRuns(projectId, limit) {
      return [...runs.values()]
        .filter((run) => run.projectId === projectId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, limit)
    },
    async updateRun(runId, patch) {
      const existing = runs.get(runId)
      if (!existing) {
        throw new Error(`Run ${runId} not found`)
      }
      const updated = { ...existing, ...patch }
      runs.set(runId, updated)
      return updated
    },
    async createSnapshot({ id, projectId, storageKey, summary }) {
      const snapshot: SnapshotRecord = {
        id,
        projectId,
        storageKey,
        summary: summary ?? null,
        deployedUrl: null,
        createdAt: now(),
      }
      snapshots.set(snapshot.id, snapshot)
      return snapshot
    },
    async getSnapshotById(id) {
      return snapshots.get(id) ?? null
    },
    async listSnapshots(projectId) {
      return [...snapshots.values()].filter((snapshot) => snapshot.projectId === projectId)
    },
    async createPublishJob({ id, projectId, snapshotId, status, deployedUrl, lastError }) {
      const publishJob: PublishJobRecord = {
        id,
        projectId,
        snapshotId,
        status,
        deployedUrl: deployedUrl ?? null,
        lastError: lastError ?? null,
        createdAt: now(),
      }
      publishJobs.set(id, publishJob)
      return publishJob
    },
    async countPublishJobsForUserSince(userId, sinceIso) {
      const projectIds = new Set(
        [...projects.values()].filter((project) => project.userId === userId).map((project) => project.id),
      )
      return [...publishJobs.values()].filter(
        (publishJob) =>
          projectIds.has(publishJob.projectId) && publishJob.createdAt >= sinceIso,
      ).length
    },
    async getPublishJobById(id) {
      return publishJobs.get(id) ?? null
    },
    async updatePublishJob(id, patch) {
      const existing = publishJobs.get(id)
      if (!existing) {
        throw new Error(`Publish job ${id} not found`)
      }
      const updated = { ...existing, ...patch }
      publishJobs.set(id, updated)
      return updated
    },
    async createToolCall({ runId, projectId, userId, toolCallId, name, input, status }) {
      const timestamp = now()
      const toolCall: ToolCallRecord = {
        id: `tool_${randomUUID()}`,
        runId,
        projectId,
        userId,
        toolCallId,
        name,
        input,
        status,
        output: null,
        isError: false,
        clientSequence: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      toolCalls.set(toolCallId, toolCall)
      return toolCall
    },
    async getToolCallByCallId(toolCallId) {
      return toolCalls.get(toolCallId) ?? null
    },
    async listToolCallsForRun(runId) {
      return [...toolCalls.values()].filter((toolCall) => toolCall.runId === runId)
    },
    async updateToolCall(toolCallId, patch) {
      const existing = toolCalls.get(toolCallId)
      if (!existing) {
        throw new Error(`Tool call ${toolCallId} not found`)
      }
      const updated = { ...existing, ...patch, updatedAt: now() }
      toolCalls.set(toolCallId, updated)
      return updated
    },
  }
}
