'use client'

import { useRouter } from 'next/navigation'
import { FormEvent, useState, useTransition } from 'react'

type AuthMode = 'login' | 'register'

type AuthFormProps = {
  initialMode?: AuthMode
}

export default function AuthForm({ initialMode = 'login' }: AuthFormProps) {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const password = String(formData.get('password') ?? '')

    const response = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null
      setError(body?.error?.message ?? 'Authentication failed')
      return
    }

    startTransition(() => {
      router.replace('/dashboard')
      router.refresh()
    })
  }

  return (
    <div className="grid gap-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_14px_34px_rgb(34_32_28/10%)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="workspace-kicker">Account</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--foreground)]">
            {mode === 'login' ? 'Sign in to Atoms' : 'Create your Atoms account'}
          </h1>
        </div>
        <div className="inline-flex shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-strong)] p-1">
          {(['login', 'register'] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => {
                setMode(candidate)
                setError(null)
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                mode === candidate
                  ? 'bg-[var(--foreground)] text-[var(--surface-strong)]'
                  : 'text-[var(--muted)]'
              }`}
            >
              {candidate === 'login' ? 'Login' : 'Register'}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-[var(--muted)]">
        Use your email and password. The password is stored as a one-way hash on the server.
      </p>

      <form className="grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm text-[var(--foreground)]">
          Email
          <input
            required
            type="email"
            name="email"
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]"
            placeholder="you@example.com"
          />
        </label>
        <label className="grid gap-2 text-sm text-[var(--foreground)]">
          Password
          <input
            required
            minLength={8}
            type="password"
            name="password"
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]"
            placeholder="At least 8 characters"
          />
        </label>

        {error ? (
          <p className="rounded-2xl border border-[#c6735d] bg-[#f8e8df] px-4 py-3 text-sm text-[#8c3f2b]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-[var(--foreground)] px-5 py-3 text-sm font-semibold text-[var(--surface-strong)] transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Working…' : mode === 'login' ? 'Login' : 'Create account'}
        </button>
      </form>
    </div>
  )
}
