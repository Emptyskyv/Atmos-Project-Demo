// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { getTemplateFiles } from '@/src/backend/workspace/templates'

describe('workspace templates', () => {
  it('configures the generated Next.js template to respect the preview base path env', () => {
    const nextConfig = getTemplateFiles('next-app').find((file) => file.path === 'next.config.ts')

    expect(nextConfig?.contents).toContain('ATOMS_PREVIEW_BASE_PATH')
    expect(nextConfig?.contents).toContain('basePath')
  })

  it('uses runtime host and port env vars for the Next.js dev server', () => {
    const packageJson = getTemplateFiles('next-app').find((file) => file.path === 'package.json')
    const scripts = JSON.parse(packageJson?.contents ?? '{}').scripts as Record<string, string>

    expect(scripts.dev).toContain('${PORT')
    expect(scripts.dev).toContain('${HOST')
    expect(scripts.dev).not.toContain('--port 3000')
  })
})
