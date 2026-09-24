interface BlockShellProps {
  label: string
  onRemove: () => void
  extra?: React.ReactNode
  children: React.ReactNode
  handleProps?: React.HTMLAttributes<HTMLSpanElement> & { draggable?: boolean }
}

/** Common frame for every editor block: a toolbar (drag handle, type label,
 *  optional controls, delete) over the block body. */
export function BlockShell({ label, onRemove, extra, children, handleProps }: BlockShellProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <div className="flex items-center gap-2">
          <span
            {...handleProps}
            className="cursor-grab select-none text-subtle active:cursor-grabbing"
            title="Drag to reorder"
          >
            ⋮⋮
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {label}
          </span>
          {extra}
        </div>
        <button onClick={onRemove} title="Delete block" className="px-1 text-muted hover:text-hard">
          ×
        </button>
      </div>
      {children}
    </div>
  )
}
