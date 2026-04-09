import Link from 'next/link'
import { redirect } from 'next/navigation'
import CreateProjectForm from '@/src/frontend/components/workspace/CreateProjectForm'
import { createPrismaRepository } from '@/src/backend/data/prisma'
import { getCurrentUser } from '@/src/backend/auth/current-user'

export default async function DashboardPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const repository = createPrismaRepository()
  const projects = await repository.listProjects(user.id)

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="workspace-kicker">Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">Welcome back</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{user.email}</p>
        </div>
      </div>

      <section className="mt-8 grid gap-4">
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_14px_34px_rgb(34_32_28/8%)]">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Projects</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Persisted projects are loaded from the database.
          </p>
          <CreateProjectForm />

          {projects.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-strong)] px-4 py-5 text-sm text-[var(--muted)]">
              No saved projects yet. Create your first project to open a live workspace.
            </p>
          ) : (
            <div className="mt-6 grid gap-3">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-4 transition-colors hover:border-[var(--accent)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-[var(--foreground)]">{project.name}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {project.description ?? 'No description yet'}
                      </p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                      {project.status}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
