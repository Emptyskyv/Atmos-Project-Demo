import type { WorkspaceFile } from '@/src/frontend/hooks/useWorkspaceState'

type FileTreeProps = {
  projectName: string
  files: WorkspaceFile[]
  activeFilePath: string | null
  selectFile: (path: string) => void
}

export default function FileTree({
  projectName,
  files,
  activeFilePath,
  selectFile,
}: FileTreeProps) {
  return (
    <aside className="workspace-panel h-full rounded-2xl border p-4 shadow-[0_10px_30px_rgb(34_32_28/6%)]">
      <h2 className="workspace-kicker">Project files</h2>
      <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">{projectName}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-[var(--muted)]">
        {files.length > 0 ? (
          files.map((file) => {
            const isActive = file.path === activeFilePath

            return (
              <li key={file.path}>
                <button
                  type="button"
                  onClick={() => selectFile(file.path)}
                  className={`w-full rounded-md px-2 py-1 text-left transition-colors ${
                    isActive
                      ? 'bg-[var(--foreground)] text-[var(--surface-strong)]'
                      : 'bg-[var(--surface)]'
                  }`}
                >
                  {file.path}
                </button>
              </li>
            )
          })
        ) : (
          <li className="rounded-md bg-[var(--surface)] px-2 py-1">No runtime file changes yet.</li>
        )}
      </ul>
    </aside>
  )
}
