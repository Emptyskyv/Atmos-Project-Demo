export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-8 md:px-12 md:py-12">
      <section className="home-hero mx-auto grid w-full max-w-6xl gap-10 rounded-3xl border border-[var(--border)] p-8 shadow-[0_10px_38px_rgb(34_32_28/8%)] md:grid-cols-[1.2fr_0.8fr] md:p-12">
        <div className="space-y-5">
          <p className="workspace-kicker">Atoms Studio</p>
          <h1 className="max-w-[18ch] text-4xl font-semibold tracking-tight text-[var(--foreground)] md:text-6xl">
            Atoms
          </h1>
          <p className="max-w-[60ch] text-base text-[var(--muted)] md:text-lg">
            Atoms is an AI web app generator powered by OpenAI GPT-5.2. Shape product ideas in a
            calm workspace with clear timelines, code context, and quick routes from concept to
            preview.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a
              href="/login"
              className="rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-semibold text-[var(--surface-strong)] transition-colors hover:bg-black"
            >
              Start building
            </a>
            <a
              href="/dashboard"
              className="rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--accent)] transition-colors hover:border-[var(--accent)]"
            >
              Go to dashboard
            </a>
          </div>
        </div>
        <aside className="grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-6 shadow-[inset_0_1px_0_rgb(255_255_255/60%)]">
          <div>
            <p className="workspace-kicker">Path 1</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">Start a fresh run</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Sign in and prompt Atoms to scaffold, revise, and ship your next idea.
            </p>
          </div>
          <div className="h-px bg-[var(--border)]" />
          <div>
            <p className="workspace-kicker">Path 2</p>
            <h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">
              Continue an existing project
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Reopen active workspaces from dashboard and keep shipping without restarting context.
            </p>
          </div>
        </aside>
      </section>
    </main>
  )
}
