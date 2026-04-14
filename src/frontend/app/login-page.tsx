import { redirect } from 'next/navigation'
import AuthForm from '@/src/frontend/components/auth/AuthForm'
import { getCurrentUser } from '@/src/backend/auth/current-user'

export default async function LoginPage() {
  const user = await getCurrentUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center gap-10 px-6 py-12">
      <section className="grid max-w-2xl gap-5">
        <p className="workspace-kicker">Atoms Studio</p>
        <h1 className="text-5xl font-semibold tracking-tight text-[var(--foreground)]">
          Sign in to pick up where you left off in Atoms Studio
        </h1>
        <p className="max-w-[58ch] text-base text-[var(--muted)]">
          Access your saved workspaces, revisit recent runs, and track deployment history so
          every project is ready when you are.
        </p>
      </section>
      <section className="w-full max-w-xl">
        <AuthForm />
      </section>
    </main>
  )
}
