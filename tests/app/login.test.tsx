import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '@/app/(auth)/login/page'

const redirectMock = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`)
})
const getCurrentUserMock = vi.fn()
const replaceMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
  }),
}))

vi.mock('@/src/backend/auth/current-user', () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows product-focused messaging without model or backend implementation details', async () => {
    getCurrentUserMock.mockResolvedValue(null)

    const ui = await LoginPage()
    render(ui)

    expect(
      screen.getByRole('heading', { name: /sign in to pick up where you left off in atoms studio/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /access your saved workspaces, revisit recent runs, and track deployment history so every project is ready when you are\./i,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/gpt-5\.2/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/backend agent loop/i)).not.toBeInTheDocument()
  })
})
