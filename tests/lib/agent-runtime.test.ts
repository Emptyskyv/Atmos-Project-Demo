import { describe, expect, it } from 'vitest'
import { APPROVAL_TOOL_NAMES, TOOL_INPUT_SCHEMAS, resolveOpenAiRuntimeMode } from '@/src/backend/agent/runtime'

describe('agent runtime tool surface', () => {
  it('exposes the opencode-style approval tools required by the runtime loop', () => {
    expect(APPROVAL_TOOL_NAMES).toEqual([
      'bash',
      'read',
      'write',
      'edit',
      'list',
      'glob',
      'grep',
      'applyPatch',
    ])
  })

  it('validates bash, write, and applyPatch inputs', () => {
    expect(
      TOOL_INPUT_SCHEMAS.bash.safeParse({
        command: 'npm install',
        cwd: '/workspace',
      }).success,
    ).toBe(true)

    expect(
      TOOL_INPUT_SCHEMAS.write.safeParse({
        path: 'app/page.tsx',
        content: 'export default function Page() { return null }',
      }).success,
    ).toBe(true)

    expect(
      TOOL_INPUT_SCHEMAS.applyPatch.safeParse({
        patch: '*** Begin Patch\n*** End Patch\n',
      }).success,
    ).toBe(true)
  })

  it('defaults to compat runtime in auto mode when a gateway base URL is configured', () => {
    expect(
      resolveOpenAiRuntimeMode({
        OPENAI_RUNTIME: 'auto',
        OPENAI_BASE_URL: 'https://gateway.example.com/v1',
        OPENAI_RESPONSES_URL: undefined,
      }),
    ).toBe('compat')
  })

  it('keeps agents runtime in auto mode without gateway overrides', () => {
    expect(
      resolveOpenAiRuntimeMode({
        OPENAI_RUNTIME: 'auto',
        OPENAI_BASE_URL: undefined,
        OPENAI_RESPONSES_URL: undefined,
      }),
    ).toBe('agents')
  })
})
