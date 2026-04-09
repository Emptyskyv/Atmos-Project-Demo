type ToolLogAccordionProps = {
  summary: string
  logs?: string[]
}

export default function ToolLogAccordion({ summary, logs = [] }: ToolLogAccordionProps) {
  return (
    <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-[var(--foreground)]">{summary}</summary>
      <pre className="mt-2 whitespace-pre-wrap text-[0.8rem] text-[var(--muted)]">
        {logs.length > 0 ? logs.join('\n') : 'No detailed logs yet.'}
      </pre>
    </details>
  )
}
