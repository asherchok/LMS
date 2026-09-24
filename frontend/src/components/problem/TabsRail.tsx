import { useState } from 'react'
import type { Tab } from '../../types'

export function TabsRail({
  tabs,
  activeId,
  canEdit,
  onSwitch,
  onCreate,
  onReorder,
}: {
  tabs: Tab[]
  activeId: number | null
  canEdit: boolean
  onSwitch: (id: number) => void
  onCreate: () => void
  onReorder: (next: Tab[]) => void
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  function drop(toIdx: number) {
    if (dragIdx == null || dragIdx === toIdx) return
    const next = [...tabs]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(dragIdx < toIdx ? toIdx - 1 : toIdx, 0, moved)
    onReorder(next)
    setDragIdx(null)
  }

  return (
    <div className="flex shrink-0 flex-col gap-1 border-r border-border p-2">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          draggable={canEdit}
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => drop(i)}
          onClick={() => onSwitch(t.id)}
          title={t.title}
          className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
            t.id === activeId ? 'bg-accent/15 text-fg' : 'text-muted hover:bg-card hover:text-fg'
          }`}
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-card text-xs tabular-nums">
            {i + 1}
          </span>
          <span className="max-w-32 truncate">{t.title}</span>
        </button>
      ))}
      {canEdit && (
        <button
          onClick={onCreate}
          title="New approach"
          className="rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-card hover:text-fg"
        >
          + New
        </button>
      )}
    </div>
  )
}
