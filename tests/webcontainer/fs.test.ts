import { describe, expect, it, vi } from 'vitest'

const getWebContainerMock = vi.hoisted(() => vi.fn())

vi.mock('@/src/frontend/workspace/client', () => ({
  getWebContainer: getWebContainerMock,
}))

import { writeFile } from '@/src/frontend/workspace/fs'

describe('webcontainer fs helpers', () => {
  it('creates parent directories before writing nested files', async () => {
    const mkdir = vi.fn(async () => undefined)
    const writeFileImpl = vi.fn(async () => undefined)

    getWebContainerMock.mockResolvedValue({
      fs: {
        mkdir,
        writeFile: writeFileImpl,
      },
    })

    await writeFile('app/page.tsx', 'export default function Page() { return null }')

    expect(mkdir).toHaveBeenCalledWith('app', { recursive: true })
    expect(writeFileImpl).toHaveBeenCalledWith(
      'app/page.tsx',
      'export default function Page() { return null }',
    )
  })
})
