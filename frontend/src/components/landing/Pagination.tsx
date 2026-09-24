import { useState } from 'react'

function pageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')
  const lo = Math.max(2, current - 1)
  const hi = Math.min(total - 1, current + 1)
  for (let i = lo; i <= hi; i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

export function Pagination({
  page,
  totalPages,
  onGo,
}: {
  page: number
  totalPages: number
  onGo: (p: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(page))
  if (totalPages <= 1) return null

  const btn =
    'grid h-7 min-w-7 place-items-center rounded px-1.5 text-xs text-muted hover:bg-card hover:text-fg disabled:opacity-30'

  return (
    <div className="mt-2 flex items-center justify-center gap-1">
      <button className={btn} disabled={page <= 1} onClick={() => onGo(page - 1)}>
        ‹
      </button>
      <div className="flex items-center gap-1">
        {pageNumbers(page, totalPages).map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="px-1 text-xs text-subtle">
              …
            </span>
          ) : p === page && editing ? (
            <input
              key="edit"
              autoFocus
              type="number"
              min={1}
              max={totalPages}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = Number(value)
                  if (v >= 1 && v <= totalPages) onGo(v)
                  setEditing(false)
                } else if (e.key === 'Escape') setEditing(false)
              }}
              className="h-7 w-12 rounded border border-border bg-bg px-1 text-center text-xs"
            />
          ) : (
            <button
              key={p}
              onClick={() => {
                if (p === page) {
                  setValue(String(page))
                  setEditing(true)
                } else onGo(p)
              }}
              className={`${btn} ${p === page ? 'bg-accent/15 text-fg' : ''}`}
            >
              {p}
            </button>
          ),
        )}
      </div>
      <button className={btn} disabled={page >= totalPages} onClick={() => onGo(page + 1)}>
        ›
      </button>
    </div>
  )
}
