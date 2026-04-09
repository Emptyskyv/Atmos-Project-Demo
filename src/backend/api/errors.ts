import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class ApiHttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}
