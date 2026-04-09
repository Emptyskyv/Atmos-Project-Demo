import { serverEnv } from '@/src/backend/platform/env'
import { ApiHttpError } from '@/src/backend/api/errors'

export function assertPublishLimit(countForToday: number) {
  if (countForToday >= serverEnv.PUBLISH_DAILY_LIMIT_PER_USER) {
    throw new ApiHttpError(429, 'RATE_LIMIT', 'Daily publish limit reached')
  }
}
