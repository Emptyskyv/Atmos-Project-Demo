type TerminalPanelProps = {
  terminalLines: string[]
}

export default function TerminalPanel({ terminalLines }: TerminalPanelProps) {
  return (
    <section className="flex flex-col min-h-0 rounded-2xl border border-[#22201c] bg-[#191714] p-4 text-[#f8f4ec] shadow-[0_8px_26px_rgb(25_23_20/30%)]">
      <h2 className="workspace-kicker shrink-0 text-[#cfbe9f]">Terminal</h2>
      {terminalLines.length > 0 ? (
        <pre className="mt-2 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-sm text-[#bcae96]">{terminalLines.join('\n')}</pre>
      ) : (
        <p className="mt-2 text-sm text-[#bcae96]">$ Waiting for shell activity...</p>
      )}
    </section>
  )
}
