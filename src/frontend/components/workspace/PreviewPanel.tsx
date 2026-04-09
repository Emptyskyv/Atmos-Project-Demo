type PreviewPanelProps = {
  previewUrl: string | null
}

export default function PreviewPanel({ previewUrl }: PreviewPanelProps) {
  return (
    <section className="workspace-panel rounded-2xl border p-4 shadow-[0_8px_26px_rgb(34_32_28/6%)]">
      <h2 className="workspace-kicker">Preview</h2>
      {previewUrl ? (
        <div className="mt-2 space-y-2">
          <iframe
            title="Workspace preview"
            src={previewUrl}
            className="h-44 w-full rounded-xl border border-[var(--border)] bg-white"
          />
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-sm text-[var(--accent)] underline decoration-[var(--accent)] underline-offset-2"
          >
            Open in new tab
          </a>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--muted)]">Preview URL will appear after runtime starts.</p>
      )}
    </section>
  )
}
