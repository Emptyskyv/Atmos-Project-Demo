import { describe, expect, it } from 'vitest'
import { SYSTEM_PROMPT } from '@/src/backend/agent/prompts/system'

describe('agent system prompt', () => {
  it('requires generated apps to be delivered with an interactive running preview', () => {
    expect(SYSTEM_PROMPT).toContain('interactive preview')
    expect(SYSTEM_PROMPT).toContain('npm run dev')
    expect(SYSTEM_PROMPT).toContain('clickable')
  })
})
