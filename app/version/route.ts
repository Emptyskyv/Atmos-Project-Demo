import packageJson from '@/package.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function readEnv(name: string) {
  const value = process.env[name]
  return value && value.length > 0 ? value : null
}

export async function GET() {
  return Response.json({
    app: packageJson.name,
    version: packageJson.version,
    deploymentId: readEnv('RAILWAY_DEPLOYMENT_ID'),
    commitSha: readEnv('RAILWAY_GIT_COMMIT_SHA') ?? readEnv('VERCEL_GIT_COMMIT_SHA'),
    environment: readEnv('RAILWAY_ENVIRONMENT_NAME'),
    service: readEnv('RAILWAY_SERVICE_NAME'),
  })
}
