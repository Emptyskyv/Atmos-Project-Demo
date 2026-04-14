type CodePanelProps = {
  activeFilePath: string | null
  activeFileContents: string
}

export default function CodePanel({ activeFilePath, activeFileContents }: CodePanelProps) {
  return (
    <section className="workspace-panel flex flex-col min-h-0 rounded-2xl border p-4 shadow-[0_8px_26px_rgb(34_32_28/6%)]">
      <h2 className="workspace-kicker shrink-0">Code</h2>
      {activeFilePath ? (
        <div className="mt-2 flex flex-col min-h-0 flex-1 space-y-2">
          <p className="shrink-0 text-sm font-medium text-[var(--foreground)]">{activeFilePath}</p>
          <pre className="min-h-0 flex-1 overflow-auto rounded-xl bg-[var(--surface)] p-3 text-xs text-[var(--muted)]">
            <code>{activeFileContents || '// File is empty.'}</code>
          </pre>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--muted)]">Waiting for runtime edits…</p>
      )}
    </section>
  )
}
