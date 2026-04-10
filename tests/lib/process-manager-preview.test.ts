// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { resolvePreviewTargetOrigin, toPublicPreviewUrl } from '@/src/backend/workspace/preview-path'

describe('preview path helpers', () => {
  it('maps local preview origins onto a first-party proxy path', () => {
    expect(toPublicPreviewUrl('proj-preview', 'http://127.0.0.1:4123')).toBe('/preview/proj-preview')
  })

  it('leaves already-public preview URLs untouched', () => {
    expect(toPublicPreviewUrl('proj-preview', 'https://preview.example.com')).toBe(
      'https://preview.example.com',
    )
  })

  it('extracts the proxy target origin from local preview URLs only', () => {
    expect(resolvePreviewTargetOrigin('http://127.0.0.1:4123/path')).toBe('http://127.0.0.1:4123')
    expect(resolvePreviewTargetOrigin('https://preview.example.com')).toBeNull()
  })
})
