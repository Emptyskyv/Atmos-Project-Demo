import { redirect } from 'next/navigation'
import WorkspaceShell from '@/src/frontend/components/workspace/WorkspaceShell'
import { createPrismaRepository } from '@/src/backend/data/prisma'
import { getCurrentUser } from '@/src/backend/auth/current-user'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const project = await createPrismaRepository().getProjectById(user.id, id)

  if (!project) {
    redirect('/dashboard')
  }

  return <WorkspaceShell projectId={id} />
}
