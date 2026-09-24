import { Modal } from '../../ui/Modal'
import { NumberLine } from '../NumberLine'
import type { Revision } from '../../../types'

function ago(d: Date): string {
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diff <= 0) return 'today'
  if (diff === 1) return '1 day ago'
  return `${diff} days ago`
}

export function RevisionHistoryModal({
  title,
  revisions,
  onClose,
}: {
  title: string
  revisions: Revision[]
  onClose: () => void
}) {
  return (
    <Modal title="Revision History" onClose={onClose} className="max-w-md">
      <p className="text-sm text-muted">
        You have revised <strong className="text-fg">{title}</strong>{' '}
        <strong className="text-fg">{revisions.length}</strong> time
        {revisions.length !== 1 ? 's' : ''}.
      </p>
      <div className="my-2">
        <NumberLine revisions={revisions} />
      </div>
      <div className="mt-3 max-h-72 overflow-y-auto">
        {revisions.length === 0 ? (
          <div className="py-2 text-sm text-muted">No revisions yet</div>
        ) : (
          revisions.map((r, i) => {
            const d = new Date(r.revised_at)
            return (
              <div
                key={r.id}
                className="flex items-center gap-2 border-b border-border py-1.5 text-sm"
              >
                <span className="min-w-8 font-mono text-xs font-semibold text-easy">
                  #{revisions.length - i}
                </span>
                <span>
                  {d.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className="ml-auto text-xs text-muted">{ago(d)}</span>
              </div>
            )
          })
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-md border-2 border-ink bg-card px-3 py-1.5 text-sm hover:bg-card-hover"
        >
          Close
        </button>
      </div>
    </Modal>
  )
}
