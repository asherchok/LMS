import type { LeetCodeProfile } from '../../types'

function Stat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="flex min-w-14 flex-col items-center">
      <span className={`text-xl font-bold tabular-nums ${color ?? 'text-fg'}`}>{value}</span>
      <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">{label}</span>
    </div>
  )
}

export function LeetCodePanel({
  profile,
  onSync,
  syncing,
}: {
  profile: LeetCodeProfile | null
  onSync: () => void
  syncing?: boolean
}) {
  if (!profile?.username) return null
  const s = profile.solved ?? {}
  return (
    <div className="mt-5 rounded-lg border-2 border-ink bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded border border-medium bg-medium/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-medium">
            LeetCode
          </span>
          <a
            href={`https://leetcode.com/u/${profile.username}/`}
            target="_blank"
            rel="noopener"
            className="font-semibold text-fg hover:underline"
          >
            @{profile.username}
          </a>
          {profile.ranking != null && (
            <span className="text-xs text-muted">Rank #{profile.ranking.toLocaleString()}</span>
          )}
        </div>
        <button
          onClick={onSync}
          disabled={syncing}
          className="rounded-md border-2 border-ink bg-card px-2.5 py-1 text-xs text-fg transition-colors hover:bg-card-hover disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : '↻ Sync'}
        </button>
      </div>
      <div className="flex flex-wrap gap-4">
        <Stat value={s.all ?? 0} label="Solved" />
        <Stat value={s.easy ?? 0} label="Easy" color="text-easy" />
        <Stat value={s.medium ?? 0} label="Medium" color="text-medium" />
        <Stat value={s.hard ?? 0} label="Hard" color="text-hard" />
        <Stat value={profile.streak ?? 0} label="Streak" />
        <Stat value={profile.totalActiveDays ?? 0} label="Active days" />
      </div>
    </div>
  )
}
