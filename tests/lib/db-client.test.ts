import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaClientMock = vi.fn()
const prismaPgMock = vi.fn()

vi.mock('@prisma/client', () => ({
  PrismaClient: prismaClientMock,
}))

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: prismaPgMock,
}))

describe('db client', () => {
  beforeEach(() => {
    vi.resetModules()
    prismaClientMock.mockReset()
    prismaPgMock.mockReset()
    delete (globalThis as typeof globalThis & { prisma?: unknown }).prisma
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/atoms?schema=public'
  })

  it('constructs PrismaClient with the PostgreSQL driver adapter', async () => {
    const adapterInstance = { adapterName: 'PrismaPg' }
    prismaPgMock.mockImplementation(function MockPrismaPg() {
      return adapterInstance
    })
    prismaClientMock.mockImplementation(function MockPrismaClient() {
      return { $disconnect: vi.fn() }
    })

    await import('@/src/backend/platform/db/client')

    expect(prismaPgMock).toHaveBeenCalledWith(
      'postgresql://postgres:postgres@127.0.0.1:5432/atoms?schema=public',
      {
        schema: 'public',
      },
    )
    expect(prismaClientMock).toHaveBeenCalledWith({
      adapter: adapterInstance,
    })
  })
})
