import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from '@/app/dashboard/page'
import HomePage from '@/app/page'
import ProjectPage from '@/app/projects/[id]/page'

const redirectMock = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`)
})
const getCurrentUserMock = vi.fn()
const listProjectsMock = vi.fn()
const getProjectByIdMock = vi.fn()
const pushMock = vi.fn()

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a data-next-link="true" href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
  useRouter: () => ({
    push: pushMock,
    refresh: vi.fn(),
  }),
}))

vi.mock('@/src/backend/auth/current-user', () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}))

vi.mock('@/src/backend/data/prisma', () => ({
  createPrismaRepository: () => ({
    listProjects: (...args: unknown[]) => listProjectsMock(...args),
    getProjectById: (...args: unknown[]) => getProjectByIdMock(...args),
  }),
}))

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses document navigation links for the homepage CTAs', () => {
    render(<HomePage />)

    expect(screen.getByRole('heading', { name: /atoms/i })).toBeInTheDocument()
    expect(screen.getByText(/openai gpt-5\.2/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start building/i })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: /start building/i })).not.toHaveAttribute(
      'data-next-link',
    )
    expect(screen.getByRole('link', { name: /go to dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard',
    )
    expect(screen.getByRole('link', { name: /go to dashboard/i })).not.toHaveAttribute(
      'data-next-link',
    )
  })
})

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render a demo workspace shortcut in dashboard', async () => {
    getCurrentUserMock.mockResolvedValue({
      id: 'user_1',
      email: 'atoms@example.com',
    })
    listProjectsMock.mockResolvedValue([])

    const ui = await DashboardPage()
    render(ui)

    expect(screen.queryByRole('link', { name: /open demo workspace/i })).not.toBeInTheDocument()
  })
})

describe('ProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to dashboard when project is missing, including demo-like ids', async () => {
    getCurrentUserMock.mockResolvedValue({
      id: 'user_1',
      email: 'atoms@example.com',
    })
    getProjectByIdMock.mockResolvedValue(null)

    await expect(ProjectPage({ params: Promise.resolve({ id: 'demo' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard',
    )
  })
})
