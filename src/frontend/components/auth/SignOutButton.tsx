'use client'

import { useRouter } from 'next/navigation'

export default function SignOutButton() {
  const router = useRouter()

  const handleSignOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-sm underline hover:no-underline text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
    >
      Sign out
    </button>
  )
}
