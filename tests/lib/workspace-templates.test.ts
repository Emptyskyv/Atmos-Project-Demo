// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { getTemplateFiles } from '@/src/backend/workspace/templates'

describe('workspace templates', () => {
  it('configures the generated Next.js template to respect the preview base path env', () => {
    const nextConfig = getTemplateFiles('next-app').find((file) => file.path === 'next.config.ts')

    expect(nextConfig?.contents).toContain('ATOMS_PREVIEW_BASE_PATH')
    expect(nextConfig?.contents).toContain('basePath')
  })
})
