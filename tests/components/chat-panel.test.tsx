import { render, screen } from '@testing-library/react'
import ChatPanel from '@/src/frontend/components/workspace/ChatPanel'

describe('ChatPanel', () => {
  it('renders user, assistant, and collapsed tool log summary items', () => {
    render(
      <ChatPanel
        items={[
          { id: 'u1', role: 'user', content: 'Build a small app shell.' },
          { id: 'a1', role: 'assistant', content: 'I will scaffold the shell now.' },
          {
            id: 't1',
            role: 'tool_log',
            summary: 'writeFile app/page.tsx',
            logs: ['[info] created app/page.tsx'],
          },
        ]}
      />,
    )

    expect(screen.getByText('Build a small app shell.')).toBeVisible()
    expect(screen.getByText('I will scaffold the shell now.')).toBeVisible()
    expect(screen.getByText('writeFile app/page.tsx')).toBeVisible()
    expect(screen.getByText('[info] created app/page.tsx')).not.toBeVisible()
  })
})
