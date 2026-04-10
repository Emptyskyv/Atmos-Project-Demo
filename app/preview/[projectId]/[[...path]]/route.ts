import { processManager } from '@/src/backend/workspace/process-manager'
import {
  buildPreviewProxyBasePath,
  resolvePreviewTargetOrigin,
} from '@/src/backend/workspace/preview-path'

type PreviewRouteContext = {
  params: Promise<{
    projectId: string
    path?: string[]
  }>
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function buildUpstreamUrl(origin: string, pathSegments: string[] | undefined, search: string) {
  const pathname = pathSegments && pathSegments.length > 0
    ? `/${pathSegments.map((segment) => encodeURIComponent(segment)).join('/')}`
    : '/'

  return new URL(`${pathname}${search}`, origin)
}

function buildProxyHeaders(request: Request, targetOrigin: string) {
  const headers = new Headers(request.headers)
  headers.set('host', new URL(targetOrigin).host)
  headers.delete('content-length')
  return headers
}

function rewriteRedirectLocation(
  responseHeaders: Headers,
  targetOrigin: string,
  projectId: string,
) {
  const location = responseHeaders.get('location')

  if (!location) {
    return
  }

  const resolvedLocation = new URL(location, targetOrigin)

  if (resolvedLocation.origin !== targetOrigin) {
    return
  }

  const basePath = buildPreviewProxyBasePath(projectId)
  responseHeaders.set(
    'location',
    `${basePath}${resolvedLocation.pathname}${resolvedLocation.search}`,
  )
}

async function proxyPreviewRequest(request: Request, context: PreviewRouteContext) {
  const { projectId, path } = await context.params
  const targetOrigin = resolvePreviewTargetOrigin(processManager.getPreviewUrl(projectId))

  if (!targetOrigin) {
    return Response.json(
      {
        error: {
          code: 'PREVIEW_NOT_FOUND',
          message: 'Preview server is not running for this project.',
        },
      },
      {
        status: 404,
      },
    )
  }

  const incomingUrl = new URL(request.url)
  const upstreamUrl = buildUpstreamUrl(targetOrigin, path, incomingUrl.search)
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer()

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers: buildProxyHeaders(request, targetOrigin),
      body,
      redirect: 'manual',
    })

    const responseHeaders = new Headers(upstreamResponse.headers)
    rewriteRedirectLocation(responseHeaders, targetOrigin, projectId)

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'PREVIEW_PROXY_FAILED',
          message: error instanceof Error ? error.message : 'Failed to proxy preview request.',
        },
      },
      {
        status: 502,
      },
    )
  }
}

export const GET = proxyPreviewRequest
export const HEAD = proxyPreviewRequest
export const POST = proxyPreviewRequest
export const PUT = proxyPreviewRequest
export const PATCH = proxyPreviewRequest
export const DELETE = proxyPreviewRequest
export const OPTIONS = proxyPreviewRequest
