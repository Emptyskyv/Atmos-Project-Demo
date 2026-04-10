type PreviewPanelProps = {
  previewUrl: string | null
  publishedUrl?: string | null
}

export default function PreviewPanel({ previewUrl, publishedUrl = null }: PreviewPanelProps) {
  return (
    <section className="workspace-panel rounded-2xl border p-4 shadow-[0_8px_26px_rgb(34_32_28/6%)]">
      <h2 className="workspace-kicker">Preview</h2>
      {publishedUrl ? (
        <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <p className="font-medium">Published live</p>
          <a
            href={publishedUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-sm text-emerald-800 underline underline-offset-2"
          >
            Open published site
          </a>
        </div>
      ) : null}
      {previewUrl ? (
        <div className="mt-2 space-y-2">
          <iframe
            title="Workspace preview"
            src={previewUrl}
            className="h-44 w-full rounded-xl border border-[var(--border)] bg-white"
          />
          {publishedUrl ? (
            <p className="text-xs text-[var(--muted)]">
              If the published site looks blank here, open it in a new tab. Some hosts block embedded previews.
            </p>
          ) : null}
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
