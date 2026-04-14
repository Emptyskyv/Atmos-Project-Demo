import ToolLogAccordion from '@/src/frontend/components/workspace/ToolLogAccordion'
import type { TimelineItem } from '@/src/frontend/hooks/useWorkspaceState'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed overflow-x-auto ${
                isUser
                  ? 'bg-[var(--foreground)] text-[var(--surface-strong)]'
                  : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]'
              }`}
            >
              <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:bg-black/5 [&_pre]:p-2 [&_pre]:rounded-lg dark:[&_pre]:bg-white/5">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        )
      })}
    </section>
  )
}
