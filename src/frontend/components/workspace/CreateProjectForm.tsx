'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function CreateProjectForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName || isSubmitting) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || undefined,
          templateKey: 'next-app',
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create project')
      }

      const body = (await response.json()) as {
        project?: {
          id?: string
        }
      }

      if (!body.project?.id) {
        throw new Error('Project id missing in response')
      }

      router.push(`/projects/${body.project.id}`)
      router.refresh()
    } catch {
      setError('Unable to create project right now. Please retry.')
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
      <label htmlFor="project-name" className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        Project Name
      </label>
      <input
        id="project-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Landing page builder"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)]"
      />
      <label htmlFor="project-description" className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        Description (optional)
      </label>
      <input
        id="project-description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="A small app generated from chat prompts"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)]"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--surface-strong)] transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Creating…' : 'Create project'}
        </button>
        {error ? <p className="text-xs text-[color:rgb(184_78_56)]">{error}</p> : null}
      </div>
    </form>
  )
}
