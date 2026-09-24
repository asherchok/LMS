import { useMemo } from 'react'
import type { Contributions } from '../../types'
import { MONTHS_SHORT } from '../../lib/date'

const LEVEL_CLASS = ['bg-border', 'bg-easy/30', 'bg-easy/50', 'bg-easy/75', 'bg-easy']

function level(count: number): number {
  if (count >= 4) return 4
  if (count >= 3) return 3
  if (count >= 2) return 2
  if (count >= 1) return 1
  return 0
}

interface Cell {
  key: string
  count: number
}

export function ContributionGraph({ data }: { data: Contributions }) {
  const { columns, monthLabels } = useMemo(() => {
    const today = new Date()
    const dow = today.getDay()
    const startOffset = dow === 0 ? 6 : dow - 1
    const totalDays = 52 * 7 + startOffset + 1
    const start = new Date(today)
    start.setDate(start.getDate() - totalDays + 1)

    const cols: Cell[][] = []
    const labels: (string | null)[] = []
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      const col = Math.floor(i / 7)
      if (!cols[col]) {
        cols[col] = []
        labels[col] = null
      }
      cols[col].push({ key, count: data[key] || 0 })
      if (d.getDate() <= 7 && labels[col] === null) labels[col] = MONTHS_SHORT[d.getMonth()]
    }

    let last = ''
    const monthLabels = labels.map((m) => {
      if (m && m !== last) {
        last = m
        return m
      }
      return ''
    })
    return { columns: cols, monthLabels }
  }, [data])

  return (
    <section className="mt-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Activity</h3>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          <div className="flex">
            {columns.map((_, c) => (
              <div key={c} className="w-[13px] text-[9px] text-subtle">
                {monthLabels[c]}
              </div>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
            {columns.map((col, c) =>
              col.map((cell) => (
                <div
                  key={cell.key + c}
                  title={`${cell.key}: ${cell.count} problem${cell.count !== 1 ? 's' : ''}`}
                  className={`h-2.5 w-2.5 rounded-[2px] ${LEVEL_CLASS[level(cell.count)]}`}
                />
              )),
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted">
        Less
        {LEVEL_CLASS.map((cls, i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-[2px] ${cls}`} />
        ))}
        More
      </div>
    </section>
  )
}
