import { useState } from 'react'
import { Modal } from '../../ui/Modal'
import { NumberLine } from '../NumberLine'
import type { Revision } from '../../../types'

const PRESETS = [3, 5, 7, 14, 30]

export function RevisedModal({
  title,
  revisionCount,
  revisions,
  onClose,
  onConfirm,
}: {
  title: string
  revisionCount: number
  revisions: Revision[]
  onClose: () => void
  onConfirm: (days: number) => void
}) {
  const [selected, setSelected] = useState<number | null>(7)
  const [custom, setCustom] = useState('')
  const [done, setDone] = useState<string | null>(null)

  function confirm(days: number) {
    onConfirm(days)
    setDone(
      days > 0
        ? `You will be reminded to solve this in ${days} days again`
        : 'Revised! No reminder set.',
    )
    setTimeout(onClose, 1500)
  }

  const optBtn = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm ${
      active ? 'border-accent bg-accent/15 text-fg' : 'border-border text-muted hover:bg-card'
    }`

  return (
    <Modal title="Mark as Revised for Today?" onClose={onClose} className="max-w-md">
      <p className="text-sm text-muted">
        You have revised <strong className="text-fg">{title}</strong>{' '}
        <strong className="text-fg">{revisionCount}</strong> time{revisionCount !== 1 ? 's' : ''}.
      </p>
      <div className="my-2">
        <NumberLine revisions={revisions} />
      </div>
      <p className="mb-2 mt-3 text-sm text-muted">Remind me to revisit this problem in…</p>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((d) => (
          <button
            key={d}
            className={optBtn(selected === d && !custom)}
            onClick={() => {
              setSelected(d)
              setCustom('')
            }}
          >
            {d} days
          </button>
        ))}
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            value={custom}
            placeholder="N"
            onFocus={() => setSelected(null)}
            onChange={(e) => setCustom(e.target.value)}
            className="w-14 rounded-md border border-border bg-bg px-2 py-1 text-center text-sm"
          />
          <span className="text-sm text-muted">days</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-2">
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="rounded-md border-2 border-ink bg-card px-3 py-1.5 text-sm hover:bg-card-hover"
          >
            Cancel
          </button>
          <button
            onClick={() => confirm(Number(custom) > 0 ? Number(custom) : (selected ?? 0))}
            className="rounded-md border-2 border-easy bg-easy/15 px-3 py-1.5 text-sm font-medium text-easy hover:bg-easy/25"
          >
            Yes, Mark Revised
          </button>
        </div>
        <button onClick={() => confirm(0)} className="text-xs text-muted hover:text-fg">
          Do not remind me
        </button>
      </div>
      {done && <div className="mt-3 text-center text-sm text-easy">{done}</div>}
    </Modal>
  )
}
