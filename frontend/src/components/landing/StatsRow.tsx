import type { Stats } from '../../types'

function Card({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="flex-1 rounded-lg border-2 border-ink bg-card px-4 py-3 text-center">
      <div className={`text-2xl font-bold tabular-nums sm:text-3xl ${color ?? 'text-fg'}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
    </div>
  )
}

export function StatsRow({ stats }: { stats: Stats | null }) {
  const dc = stats?.difficulty_counts ?? {}
  const easy = dc.easy ?? 0
  const medium = dc.medium ?? 0
  const hard = dc.hard ?? 0
  return (
    <div className="mt-5 flex flex-wrap gap-2.5">
      <Card value={easy + medium + hard} label="Total" />
      <Card value={easy} label="Easy" color="text-easy" />
      <Card value={medium} label="Medium" color="text-medium" />
      <Card value={hard} label="Hard" color="text-hard" />
    </div>
  )
}
