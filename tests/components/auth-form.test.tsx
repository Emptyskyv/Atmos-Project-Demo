import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthForm from '@/src/frontend/components/auth/AuthForm'

const replaceMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock,
  }),
}))

describe('AuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses a stable header layout when switching to register mode', async () => {
    const { container } = render(<AuthForm />)

    const root = container.firstElementChild
    const headerRow = root?.firstElementChild
    const toggleGroup = screen.getByRole('button', { name: /^register$/i }).parentElement

    expect(headerRow).toHaveClass('flex-wrap')
    expect(headerRow).toHaveClass('items-start')
    expect(toggleGroup).toHaveClass('inline-flex')
    expect(toggleGroup).toHaveClass('shrink-0')

    await userEvent.click(screen.getByRole('button', { name: /register/i }))

    expect(screen.getByRole('heading', { name: /create your atoms account/i })).toBeInTheDocument()
  })
})
