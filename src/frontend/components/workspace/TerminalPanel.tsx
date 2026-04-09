type TerminalPanelProps = {
  terminalLines: string[]
}

export default function TerminalPanel({ terminalLines }: TerminalPanelProps) {
  const visibleLines = terminalLines.slice(-8)

  return (
    <section className="rounded-2xl border border-[#22201c] bg-[#191714] p-4 text-[#f8f4ec] shadow-[0_8px_26px_rgb(25_23_20/30%)]">
      <h2 className="workspace-kicker text-[#cfbe9f]">Terminal</h2>
      {visibleLines.length > 0 ? (
        <pre className="mt-2 whitespace-pre-wrap text-sm text-[#bcae96]">{visibleLines.join('\n')}</pre>
      ) : (
        <p className="mt-2 text-sm text-[#bcae96]">$ Waiting for runtime logs...</p>
      )}
    </section>
  )
}
