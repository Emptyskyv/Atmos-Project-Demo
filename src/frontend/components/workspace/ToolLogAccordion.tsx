type ToolLogAccordionProps = {
  summary: string
  logs?: string[]
}

function formatSummary(rawSummary: string): string {
  if (rawSummary.startsWith('write {')) {
    try {
      const payload = JSON.parse(rawSummary.slice(rawSummary.indexOf('{')))
      if (payload.path) {
        return `write ${payload.path}`
      }
    } catch {
      // fallback
    }
  } else if (rawSummary.startsWith('bash {')) {
    try {
      const payload = JSON.parse(rawSummary.slice(rawSummary.indexOf('{')))
      if (payload.command) {
        let cmd = String(payload.command).replace(/\n/g, ' ')
        if (cmd.length > 50) cmd = cmd.slice(0, 47) + '...'
        return `bash: ${cmd}`
      }
    } catch {
      // fallback
    }
  }

  const match = rawSummary.match(/^(\w+) (\{.*\})$/)
  if (match) {
    try {
      const payload = JSON.parse(match[2])
      return `${match[1]} (${Object.keys(payload).join(', ')})`
    } catch {
      // fallback
    }
  }

  return rawSummary
}

export default function ToolLogAccordion({ summary, logs = [] }: ToolLogAccordionProps) {
  let formattedLogs = logs.join('\n')

  try {
    const rawString = logs.join('')
    if (rawString.trim().startsWith('{') || rawString.trim().startsWith('[')) {
      const parsed = JSON.parse(rawString)
      formattedLogs = JSON.stringify(parsed, null, 2)
    }
  } catch {
    // If not pure JSON, leave it as is
  }

  const displaySummary = formatSummary(summary)

  return (
    <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium outline-none text-[var(--foreground)] hover:text-[var(--accent)] transition-colors">{displaySummary}</summary>
      <div className="mt-2 max-h-[300px] overflow-y-auto rounded bg-black/5 p-2 dark:bg-white/5">
        <pre className="whitespace-pre-wrap text-[0.8rem] text-[var(--muted)] font-mono">
          {logs.length > 0 ? formattedLogs : 'No detailed logs yet.'}
        </pre>
      </div>
    </details>
  )
}
