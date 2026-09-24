import type { Revision } from '../../types'

/** Horizontal timeline of recent revisions (oldest → newest), with day gaps. */
export function NumberLine({ revisions }: { revisions: Revision[] }) {
  const count = revisions.length
  if (count === 0) return null
  const maxShow = Math.min(count, 20)
  const shown = revisions.slice(-maxShow).reverse() // API is newest-first; show oldest-first

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {count > maxShow && (
        <>
          <span className="rounded bg-card px-1 text-[10px] text-muted">+{count - maxShow}</span>
          <span className="h-px w-4 bg-border" />
        </>
      )}
      {shown.map((r, i) => {
        const d = new Date(r.revised_at)
        const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        const next = shown[i + 1] ? new Date(shown[i + 1].revised_at) : null
        const gap = next ? Math.max(1, Math.round((next.getTime() - d.getTime()) / 86400000)) : null
        return (
          <div key={r.id} className="flex items-center gap-1" title={r.revised_at}>
            <div className="flex flex-col items-center">
              <div className="h-2 w-2 rounded-full bg-accent" />
              <div className="mt-0.5 whitespace-nowrap text-[9px] text-muted">{label}</div>
            </div>
            {gap != null && (
              <div className="flex items-center">
                <span className="h-px w-5 bg-border" />
                <span className="px-0.5 text-[9px] text-subtle">{gap}d</span>
                <span className="h-px w-5 bg-border" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
