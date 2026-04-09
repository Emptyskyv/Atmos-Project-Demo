'use client'

type PublishDialogProps = {
  onPublish: () => Promise<void>
  isPublishing: boolean
}

export default function PublishDialog({ onPublish, isPublishing }: PublishDialogProps) {
  return (
    <button
      type="button"
      onClick={() => {
        void onPublish()
      }}
      disabled={isPublishing}
      className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-2 text-sm font-medium text-[var(--accent)] transition-colors hover:border-[var(--accent)] disabled:cursor-wait disabled:opacity-60"
    >
      {isPublishing ? 'Publishing…' : 'Publish'}
    </button>
  )
}
