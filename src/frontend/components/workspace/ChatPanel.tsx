import ToolLogAccordion from '@/src/frontend/components/workspace/ToolLogAccordion'
import type { TimelineItem } from '@/src/frontend/hooks/useWorkspaceState'

type ChatPanelProps = {
  items: TimelineItem[]
}

export default function ChatPanel({ items }: ChatPanelProps) {
  return (
    <section className="workspace-panel flex h-full flex-col gap-3 overflow-y-auto rounded-xl border p-4 shadow-[inset_0_1px_0_rgb(255_255_255/65%)]">
      <h2 className="workspace-kicker">Timeline</h2>
      {items.map((item) => {
        if (item.role === 'tool_log') {
          return <ToolLogAccordion key={item.id} summary={item.summary} logs={item.logs} />
        }

        const isUser = item.role === 'user'
        return (
          <div key={item.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                isUser
                  ? 'bg-[var(--foreground)] text-[var(--surface-strong)]'
                  : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]'
              }`}
            >
              {item.content}
            </div>
          </div>
        )
      })}
    </section>
  )
}
