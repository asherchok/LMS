import { useMemo, useState } from 'react'
import type { FreezeState, Problem, Reminder } from '../../types'
import { Badge } from '../ui/Badge'
import { Pagination } from './Pagination'
import { daysOverdue, daysUntil } from '../../lib/date'
import { openProblem } from '../../lib/nav'

const PAGE_SIZE = 10

interface SidebarProps {
  reminders: Reminder[]
  upcoming: Reminder[]
  problems: Problem[]
  activeFilters: string[]
  openInNewTab: boolean
  freeze: FreezeState
  onRemoveFilter: (tag: string) => void
  onClearFilters: () => void
  onReschedule: (id: number, date: string) => void
}

function DueStatus({ remindDate }: { remindDate: string }) {
  const d = daysOverdue(remindDate)
  if (d === 0) return <span className="text-medium">Due Today</span>
  if (d > 0) return <span className="text-hard">Past Due: {d}d</span>
  return <span className="text-muted">In {-d}d</span>
}

function ReminderCard({
  r,
  openInNewTab,
  status,
  frozen,
  draggable,
  onDragStart,
}: {
  r: Reminder
  openInNewTab: boolean
  status: React.ReactNode
  frozen?: boolean
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
}) {
  const frozenCls = frozen
    ? 'border-accent/35 bg-accent/10 hover:bg-accent/15'
    : 'border-border bg-card hover:bg-card-hover'
  return (
    <div className="flex items-stretch gap-1">
      {draggable && (
        <div
          draggable
          onDragStart={onDragStart}
          className="flex cursor-grab items-center px-1 text-subtle active:cursor-grabbing"
          title="Drag to reschedule"
        >
          ⋮⋮
        </div>
      )}
      <button
        onClick={() => openProblem(r.id, openInNewTab)}
        className={`flex-1 rounded-md border p-2 text-left transition-colors ${frozenCls}`}
      >
        <div className="truncate text-sm font-medium">
          {r.leetcode_number ? `#${r.leetcode_number} ` : ''}
          {r.title}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs">
          <Badge difficulty={r.difficulty} />
          {status}
        </div>
      </button>
    </div>
  )
}

export function Sidebar({
  reminders,
  upcoming,
  problems,
  activeFilters,
  openInNewTab,
  freeze,
  onRemoveFilter,
  onClearFilters,
  onReschedule,
}: SidebarProps) {
  const [tab, setTab] = useState<'dfr' | 'upcoming'>('dfr')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [dragPid, setDragPid] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: number; pos: 'above' | 'below' } | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return problems.filter((p) => {
      if (activeFilters.length && !activeFilters.every((t) => p.tags.includes(t))) return false
      if (!q) return true
      return (
        p.title.toLowerCase().includes(q) ||
        (p.leetcode_number != null && String(p.leetcode_number).includes(q)) ||
        p.tags.some((t) => t.toLowerCase().includes(q)) ||
        p.description.toLowerCase().includes(q)
      )
    })
  }, [problems, activeFilters, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE)

  return (
    <aside className="flex min-h-0 flex-col gap-3">
      {/* Reminder tabs */}
      <div>
        <div className="flex gap-1 border-b border-border">
          {(['dfr', 'upcoming'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm font-medium ${
                tab === t ? 'border-b-2 border-accent text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {t === 'dfr' ? 'Due for Review' : 'Coming Up'}
            </button>
          ))}
        </div>
        <div
          className="mt-2 max-h-[30vh] space-y-1.5 overflow-y-auto pr-1"
          onDragEnd={() => {
            setDragPid(null)
            setDropTarget(null)
          }}
        >
          {tab === 'dfr' ? (
            reminders.length === 0 ? (
              <p className="py-2 text-sm text-muted">No problems due for review</p>
            ) : (
              reminders.map((r) => (
                <ReminderCard
                  key={r.id}
                  r={r}
                  openInNewTab={openInNewTab}
                  status={<DueStatus remindDate={r.remind_date} />}
                />
              ))
            )
          ) : upcoming.length === 0 ? (
            <p className="py-2 text-sm text-muted">Nothing coming up in the next 7 days</p>
          ) : (
            upcoming.map((r, idx) => (
              <div
                key={r.id}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!dragPid || dragPid === r.id) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const pos = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
                  setDropTarget({ id: r.id, pos })
                }}
                onDragLeave={() => setDropTarget((d) => (d?.id === r.id ? null : d))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropTarget(null)
                  const pid = e.dataTransfer.getData('text/plain')
                  if (!pid || Number(pid) === r.id) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  const above = e.clientY < rect.top + rect.height / 2
                  const insertIdx = above ? idx : idx + 1
                  const targetDate = upcoming[insertIdx]
                    ? upcoming[insertIdx].remind_date
                    : r.remind_date
                  onReschedule(Number(pid), targetDate)
                }}
                className={[
                  dropTarget?.id === r.id && dropTarget.pos === 'above'
                    ? 'border-t-[3px] border-t-accent'
                    : '',
                  dropTarget?.id === r.id && dropTarget.pos === 'below'
                    ? 'border-b-[3px] border-b-accent'
                    : '',
                ].join(' ')}
              >
                <ReminderCard
                  r={r}
                  openInNewTab={openInNewTab}
                  frozen={freeze.frozen}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', String(r.id))
                    setDragPid(r.id)
                  }}
                  status={<span className="text-muted">In {daysUntil(r.remind_date)}d</span>}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
        placeholder="Search problems..."
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent"
      />

      {/* Active filters */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded-full border border-accent bg-accent/15 px-2 py-0.5 text-xs"
            >
              {t}
              <button onClick={() => onRemoveFilter(t)} className="text-muted hover:text-fg">
                ×
              </button>
            </span>
          ))}
          <button onClick={onClearFilters} className="text-xs text-muted hover:text-fg">
            Clear all
          </button>
        </div>
      )}

      {/* Problem list */}
      <div className="flex min-h-0 flex-1 flex-col">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          All Problems
        </h3>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {pageItems.length === 0 ? (
            <p className="py-2 text-sm text-muted">No problems found</p>
          ) : (
            pageItems.map((p) => (
              <button
                key={p.id}
                onClick={() => openProblem(p.id, openInNewTab)}
                className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-card"
              >
                <span className="w-12 shrink-0 text-xs tabular-nums text-muted">
                  {p.leetcode_number ? `#${p.leetcode_number}` : '—'}
                </span>
                <span className="flex-1 truncate text-sm">{p.title}</span>
                <Badge difficulty={p.difficulty} short />
              </button>
            ))
          )}
        </div>
        <Pagination page={clampedPage} totalPages={totalPages} onGo={setPage} />
      </div>
    </aside>
  )
}
