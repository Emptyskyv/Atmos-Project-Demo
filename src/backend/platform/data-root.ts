import path from 'node:path'

function normalizeEnvPath(value: string | undefined) {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}

export function resolveAppDataRootDir(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
) {
  const explicitRoot = normalizeEnvPath(env.ATOMS_DATA_ROOT)

  if (explicitRoot) {
    return path.resolve(cwd, explicitRoot)
  }

  const railwayVolumeRoot = normalizeEnvPath(env.RAILWAY_VOLUME_MOUNT_PATH)

  if (railwayVolumeRoot) {
    return path.join(railwayVolumeRoot, 'atoms')
  }

  return path.join(cwd, '.data')
}

export function resolveAppDataPath(...segments: string[]) {
  return path.join(resolveAppDataRootDir(), ...segments)
}
