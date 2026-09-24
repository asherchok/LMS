interface BlockShellProps {
  label: string
  onRemove: () => void
  extra?: React.ReactNode
  children: React.ReactNode
  /** Grabbing the toolbar arms/disarms the block for drag-reorder (matches the
   *  classic client — you drag a block by its header, not a separate handle). */
  onGripDown?: () => void
  onGripUp?: () => void
}

export function BlockShell({
  label,
  onRemove,
  extra,
  children,
  onGripDown,
  onGripUp,
}: BlockShellProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div
        onMouseDown={onGripDown}
        onMouseUp={onGripUp}
        className="flex cursor-grab items-center justify-between border-b border-border px-2 py-1 active:cursor-grabbing"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>
        <div className="flex items-center gap-2">
          {extra}
          <button
            onClick={onRemove}
            onMouseDown={(e) => e.stopPropagation()}
            title="Delete block"
            className="px-1 text-muted hover:text-hard"
          >
            ×
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}
