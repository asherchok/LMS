interface TopicsProps {
  tagCounts: Record<string, number>
  activeFilters: string[]
  onToggle: (tag: string) => void
  onReset: () => void
}

export function Topics({ tagCounts, activeFilters, onToggle, onReset }: TopicsProps) {
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Topics</h3>
        {activeFilters.length > 0 && (
          <button
            onClick={onReset}
            className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
          >
            Reset
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <span className="text-sm text-muted">No topics yet</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {sorted.map(([tag, count]) => {
            const active = activeFilters.includes(tag)
            return (
              <button
                key={tag}
                onClick={() => onToggle(tag)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? 'border-accent bg-accent/15 text-fg'
                    : 'border-border bg-card text-muted hover:bg-card-hover hover:text-fg'
                }`}
              >
                {tag} <span className="ml-0.5 text-subtle">{count}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
