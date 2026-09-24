import { Modal } from '../ui/Modal'
import type { FreezeState } from '../../types'

export function FreezeModal({
  freeze,
  onClose,
  onConfirm,
}: {
  freeze: FreezeState
  onClose: () => void
  onConfirm: () => void
}) {
  let title = 'Need a break?'
  let body =
    'This will pause all revision reminders. No new reviews will pile up while frozen. Your current due reviews will stay, but upcoming ones won’t become overdue.'
  let action = 'Freeze'

  if (freeze.frozen && freeze.freeze_start) {
    const start = new Date(freeze.freeze_start)
    const diffH = Math.floor((Date.now() - start.getTime()) / 3600000)
    const days = Math.floor(diffH / 24)
    const hrs = diffH % 24
    const dur = days > 0 ? `${days}d ${hrs}h` : `${hrs}h`
    const pushDays = Math.max(days, 1)
    title = 'Resume revisions?'
    body = `You've been frozen for ${dur}. All upcoming reminders will be pushed forward by ${pushDays} day${
      pushDays !== 1 ? 's' : ''
    }.`
    action = 'Resume'
  }

  return (
    <Modal title={title} onClose={onClose} className="max-w-md">
      <p className="mb-4 text-sm text-muted">{body}</p>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md border-2 border-ink bg-card px-3 py-1.5 text-sm hover:bg-card-hover"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="rounded-md border-2 border-accent bg-accent/15 px-3 py-1.5 text-sm font-medium text-fg hover:bg-accent/25"
        >
          {action}
        </button>
      </div>
    </Modal>
  )
}
