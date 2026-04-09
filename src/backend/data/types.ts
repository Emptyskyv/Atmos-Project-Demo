export type UserRecord = {
  id: string
  email: string
  passwordHash: string
  createdAt: string
  updatedAt: string
}

export type SessionRecord = {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  createdAt: string
}

export type ProjectRecord = {
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
  createdAt: string
  updatedAt: string
}

export type RunRecord = {
  id: string
  projectId: string
  userId: string
  model: string
  status: string
  waitingToolCallId: string | null
  lastError: unknown
  serializedState: unknown
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export type MessageRecord = {
  id: string
  projectId: string
  runId: string | null
  kind: string
  payload: Record<string, unknown>
  createdAt: string
}

export type SnapshotRecord = {
  id: string
  projectId: string
  storageKey: string
  summary: string | null
  deployedUrl: string | null
  createdAt: string
}

export type PublishJobRecord = {
  id: string
  projectId: string
  snapshotId: string
  status: string
  deployedUrl: string | null
  lastError: unknown
  createdAt: string
}

export type ToolCallRecord = {
  id: string
  runId: string
  projectId: string
  userId: string
  toolCallId: string
  name: string
  input: Record<string, unknown>
  status: string
  output: unknown
  isError: boolean
  clientSequence: number | null
  createdAt: string
  updatedAt: string
}

export interface AppRepository {
  createUser(input: { email: string; passwordHash: string }): Promise<UserRecord>
  findUserByEmail(email: string): Promise<UserRecord | null>
  findUserById(id: string): Promise<UserRecord | null>
  createSession(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<SessionRecord>
  findSessionByTokenHash(tokenHash: string): Promise<{ session: SessionRecord; user: UserRecord } | null>
  deleteSessionByTokenHash(tokenHash: string): Promise<void>

  listProjects(userId: string): Promise<ProjectRecord[]>
  createProject(input: {
    userId: string
    name: string
    description?: string | null
    templateKey: string
    status: string
  }): Promise<ProjectRecord>
  getProjectById(userId: string, projectId: string): Promise<ProjectRecord | null>
  updateProject(projectId: string, patch: Partial<ProjectRecord>): Promise<ProjectRecord>

  listMessages(projectId: string, limit: number, beforeId?: string): Promise<MessageRecord[]>
  createMessage(input: {
    projectId: string
    runId?: string | null
    kind: string
    payload: Record<string, unknown>
  }): Promise<MessageRecord>

  getActiveRun(projectId: string): Promise<RunRecord | null>
  createRun(input: {
    projectId: string
    userId: string
    model: string
    status: string
    waitingToolCallId?: string | null
    lastError?: unknown
    serializedState?: unknown
    startedAt?: string | null
    finishedAt?: string | null
  }): Promise<RunRecord>
  getRunById(runId: string): Promise<RunRecord | null>
  listRuns(projectId: string, limit: number): Promise<RunRecord[]>
  updateRun(runId: string, patch: Partial<RunRecord>): Promise<RunRecord>

  createSnapshot(input: {
    id: string
    projectId: string
    storageKey: string
    summary?: string | null
  }): Promise<SnapshotRecord>
  getSnapshotById(id: string): Promise<SnapshotRecord | null>
  listSnapshots(projectId: string): Promise<SnapshotRecord[]>

  createPublishJob(input: {
    id: string
    projectId: string
    snapshotId: string
    status: string
    deployedUrl?: string | null
    lastError?: unknown
  }): Promise<PublishJobRecord>
  countPublishJobsForUserSince(userId: string, sinceIso: string): Promise<number>
  getPublishJobById(id: string): Promise<PublishJobRecord | null>
  updatePublishJob(id: string, patch: Partial<PublishJobRecord>): Promise<PublishJobRecord>

  createToolCall(input: {
    runId: string
    projectId: string
    userId: string
    toolCallId: string
    name: string
    input: Record<string, unknown>
    status: string
  }): Promise<ToolCallRecord>
  getToolCallByCallId(toolCallId: string): Promise<ToolCallRecord | null>
  listToolCallsForRun(runId: string): Promise<ToolCallRecord[]>
  updateToolCall(toolCallId: string, patch: Partial<ToolCallRecord>): Promise<ToolCallRecord>
}
