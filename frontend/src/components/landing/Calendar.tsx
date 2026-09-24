import { useMemo, useState } from 'react'
import type { CalendarData, CalendarEntry, Problem, FreezeState } from '../../types'
import { MONTHS, localDateKey, todayKey } from '../../lib/date'
import { openProblem } from '../../lib/nav'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Difficulty tint for a badge.
const DIFF_CLASS: Record<string, string> = {
  easy: 'bg-easy/15 text-easy border-easy/40',
  medium: 'bg-medium/15 text-medium border-medium/40',
  hard: 'bg-hard/15 text-hard border-hard/40',
}

interface CalendarProps {
  year: number
  month: number // 1-based
  data: CalendarData
  problems: Problem[]
  activeFilters: string[]
  freeze: FreezeState
  openInNewTab: boolean
  onChangeMonth: (delta: number) => void
  onReschedule: (id: number, date: string) => void
}

interface Tip {
  entry: CalendarEntry
  x: number
  y: number
}

export function Calendar({
  year,
  month,
  data,
  problems,
  activeFilters,
  freeze,
  openInNewTab,
  onChangeMonth,
  onReschedule,
}: CalendarProps) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [dropDate, setDropDate] = useState<string | null>(null)

  const allowedIds = useMemo(() => {
    if (activeFilters.length === 0) return null
    return new Set(
      problems.filter((p) => activeFilters.every((t) => p.tags.includes(t))).map((p) => p.id),
    )
  }, [activeFilters, problems])

  const today = todayKey()
  const freezeStart = freeze.frozen && freeze.freeze_start ? freeze.freeze_start.slice(0, 10) : null

  // Build the day cells with a leading blank offset (Mon-first weeks).
  const firstDow = (() => {
    const d = new Date(year, month - 1, 1).getDay()
    return d === 0 ? 6 : d - 1
  })()
  const daysInMonth = new Date(year, month, 0).getDate()

  function entriesFor(dateStr: string): CalendarEntry[] {
    let list = data[dateStr] || []
    if (allowedIds) list = list.filter((e) => allowedIds.has(e.id))
    return list
  }

  function onDrop(dateStr: string, e: React.DragEvent) {
    e.preventDefault()
    setDropDate(null)
    const pid = e.dataTransfer.getData('text/plain')
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    if (!pid || new Date(dateStr + 'T00:00:00') < t) return
    onReschedule(Number(pid), dateStr)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-center gap-4">
        <button
          onClick={() => onChangeMonth(-1)}
          className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted hover:bg-card hover:text-fg"
        >
          ‹
        </button>
        <span className="min-w-44 text-center text-lg font-semibold">
          {MONTHS[month - 1]} {year}
        </span>
        <button
          onClick={() => onChangeMonth(1)}
          className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted hover:bg-card hover:text-fg"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="pb-1 text-center text-[11px] font-medium text-muted">
            {d}
          </div>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = localDateKey(new Date(year, month - 1, day))
          const isToday = dateStr === today
          const isFuture = dateStr > today
          const entries = entriesFor(dateStr)
          const revisedCount = entries.filter((e) => e.type === 'revised').length

          return (
            <div
              key={dateStr}
              onDragOver={(e) => {
                e.preventDefault()
                setDropDate(dateStr)
              }}
              onDragLeave={() => setDropDate((d) => (d === dateStr ? null : d))}
              onDrop={(e) => onDrop(dateStr, e)}
              className={[
                'relative min-h-16 rounded-md border p-1 transition-colors',
                isToday ? 'border-accent bg-accent/5' : 'border-border bg-card/40',
                freezeStart ? 'opacity-90' : '',
                dropDate === dateStr ? 'ring-2 ring-accent' : '',
              ].join(' ')}
            >
              <div className="text-[11px] font-medium text-muted">{day}</div>
              {freezeStart === dateStr && (
                <div className="absolute right-1 top-1 rounded bg-accent/20 px-1 text-[9px] text-accent">
                  frozen
                </div>
              )}
              <div className="mt-0.5 flex flex-wrap gap-0.5">
                {entries.map((e, idx) => {
                  const label = e.leetcode_number ? `#${e.leetcode_number}` : e.title.slice(0, 6)
                  const upcoming = e.type === 'upcoming'
                  const cls = e.first_revision
                    ? 'border-accent/50 bg-accent/15 text-accent'
                    : DIFF_CLASS[e.difficulty] || DIFF_CLASS.medium
                  return (
                    <span
                      key={`${e.id}-${idx}`}
                      draggable={upcoming}
                      onDragStart={(ev) => ev.dataTransfer.setData('text/plain', String(e.id))}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        openProblem(e.id, openInNewTab)
                      }}
                      onMouseEnter={(ev) => {
                        const r = (ev.target as HTMLElement).getBoundingClientRect()
                        setTip({ entry: e, x: r.right + 8, y: r.top })
                      }}
                      onMouseLeave={() => setTip(null)}
                      className={[
                        'cursor-pointer rounded border px-1 text-[10px] leading-tight',
                        cls,
                        upcoming ? 'border-dashed' : '',
                        isFuture && !upcoming ? 'opacity-50' : '',
                      ].join(' ')}
                    >
                      {label}
                    </span>
                  )
                })}
              </div>
              {revisedCount > 0 && (
                <div className="absolute bottom-0.5 right-1 text-[9px] font-semibold text-easy">
                  {revisedCount}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {tip && (
        <div
          className="pointer-events-none fixed z-40 max-w-60 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: Math.min(tip.x, window.innerWidth - 250),
            top: Math.min(tip.y, window.innerHeight - 80),
          }}
        >
          <div className="font-semibold text-fg">
            {tip.entry.leetcode_number ? `#${tip.entry.leetcode_number} ` : ''}
            {tip.entry.title}
          </div>
          <div className="text-muted">
            Last visited:{' '}
            {tip.entry.last_visited_at
              ? new Date(tip.entry.last_visited_at).toLocaleString()
              : 'Never'}
          </div>
          <div className="text-muted">
            {tip.entry.type === 'upcoming'
              ? 'Upcoming reminder'
              : tip.entry.type === 'revised'
                ? 'Revised'
                : 'Created'}{' '}
            this day
          </div>
        </div>
      )}
    </div>
  )
}
