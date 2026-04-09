import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreateProjectForm from '@/src/frontend/components/workspace/CreateProjectForm'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: vi.fn(),
  }),
}))

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

describe('CreateProjectForm', () => {
  beforeEach(() => {
    pushMock.mockReset()
    vi.restoreAllMocks()
  })

  it('creates a project from dashboard and navigates to workspace', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          project: {
            id: 'proj_1',
            name: 'Landing demo',
          },
        },
        true,
        201,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<CreateProjectForm />)
    await userEvent.type(screen.getByLabelText(/project name/i), 'Landing demo')
    await userEvent.click(screen.getByRole('button', { name: /create project/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/projects', expect.anything())
      expect(pushMock).toHaveBeenCalledWith('/projects/proj_1')
    })
  })
})
