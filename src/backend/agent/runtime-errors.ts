type ErrorLike = {
  status?: unknown
  code?: unknown
  message?: unknown
  error?: {
    code?: unknown
    message?: unknown
  }
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function formatAgentRuntimeError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error !== 'object' || error === null) {
    return 'Unexpected agent runtime error'
  }

  const errorLike = error as ErrorLike
  const status =
    typeof errorLike.status === 'number' && Number.isFinite(errorLike.status)
      ? errorLike.status
      : undefined
  const code = asString(errorLike.code) ?? asString(errorLike.error?.code)
  const message = asString(errorLike.message) ?? asString(errorLike.error?.message)

  if (!status && !code && !message) {
    return 'Unexpected agent runtime error'
  }

  if (!status && !code) {
    return message ?? 'Unexpected agent runtime error'
  }

  const parts = [status, code].filter((value) => value !== undefined)
  const prefix = `OpenAI upstream error (${parts.join(' ')})`

  return message ? `${prefix}: ${message}` : prefix
}
