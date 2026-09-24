import { useEffect, useState } from 'react'
import { endpoints } from '../../lib/endpoints'
import type { Problem } from '../../types'

type TrashItem = Problem & { daysLeft: number | '?' }

export function TrashList({ onChanged }: { onChanged: () => void }) {
  const [deleted, setDeleted] = useState<TrashItem[]>([])

  // Compute days-left at load time (not during render, which must stay pure).
  const refresh = async () => {
    const list = await endpoints.deletedProblems()
    const now = Date.now()
    setDeleted(
      list.map((p) => ({
        ...p,
        daysLeft: p.deleted_at
          ? Math.max(0, 7 - Math.floor((now - new Date(p.deleted_at).getTime()) / 86400000))
          : '?',
      })),
    )
  }
  useEffect(() => {
    refresh()
  }, [])

  async function restore(id: number) {
    await endpoints.restoreProblem(id)
    await refresh()
    onChanged()
  }

  async function permDelete(id: number) {
    if (!confirm('Permanently delete this problem? This cannot be undone.')) return
    await endpoints.permanentDelete(id)
    await refresh()
  }

  if (deleted.length === 0) {
    return <div className="py-1 text-xs text-muted">No deleted problems</div>
  }

  return (
    <div className="mt-1.5 space-y-1">
      {deleted.map((p) => {
        return (
          <div
            key={p.id}
            className="flex items-center gap-2 rounded border border-border bg-card px-2 py-1"
          >
            <span className="flex-1 truncate text-xs">
              {p.leetcode_number ? `#${p.leetcode_number} ` : ''}
              {p.title}
            </span>
            <span className="text-[10px] text-muted">{p.daysLeft}d left</span>
            <button
              onClick={() => restore(p.id)}
              title="Restore"
              className="text-easy hover:opacity-80"
            >
              ↩
            </button>
            <button
              onClick={() => permDelete(p.id)}
              title="Permanently delete"
              className="text-hard hover:opacity-80"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
