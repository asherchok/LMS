import { useRef, useState } from 'react'
import { BlockShell } from './BlockShell'
import { MarkdownView } from '../MarkdownView'
import type { MarkdownBlock as MarkdownBlockT } from '../../../types'

const COLORS = ['#ff4f64', '#00c9a7', '#4dabf7', '#ffb800', '#cc5de8', '#f0a030']

export function MarkdownBlock({
  block,
  onChange,
  onRemove,
  handleProps,
}: {
  block: MarkdownBlockT
  onChange: (patch: Partial<MarkdownBlockT>) => void
  onRemove: () => void
  handleProps?: React.HTMLAttributes<HTMLSpanElement> & { draggable?: boolean }
}) {
  const [editing, setEditing] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)
  const value = block.content

  function wrap(before: string, after: string) {
    const el = ta.current
    if (!el) return
    const s = el.selectionStart
    const e = el.selectionEnd
    const sel = value.substring(s, e) || 'text'
    onChange({ content: value.slice(0, s) + before + sel + after + value.slice(e) })
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = s + before.length
      el.selectionEnd = s + before.length + sel.length
    })
  }

  function insertDiagram() {
    const el = ta.current
    if (!el) return
    const pos = el.selectionStart
    const snippet = '\n```mermaid\ngraph TD\n    A[Start] --> B[End]\n```\n'
    onChange({ content: value.slice(0, pos) + snippet + value.slice(pos) })
  }

  const tbBtn = 'rounded px-1.5 py-0.5 text-xs hover:bg-card-hover'

  return (
    <BlockShell label="Commentary" onRemove={onRemove} handleProps={handleProps}>
      {editing ? (
        <div>
          <div
            className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1"
            onMouseDown={(e) => e.preventDefault()}
          >
            <button className={tbBtn} onClick={() => wrap('**', '**')}>
              <b>B</b>
            </button>
            <button className={tbBtn} onClick={() => wrap('*', '*')}>
              <i>I</i>
            </button>
            <button className={tbBtn} onClick={() => wrap('<u>', '</u>')}>
              <u>U</u>
            </button>
            <span className="mx-1 h-4 w-px bg-border" />
            <button className={tbBtn} onClick={() => wrap('# ', '')}>
              H1
            </button>
            <button className={tbBtn} onClick={() => wrap('## ', '')}>
              H2
            </button>
            <button className={tbBtn} onClick={() => wrap('### ', '')}>
              H3
            </button>
            <span className="mx-1 h-4 w-px bg-border" />
            {COLORS.map((c) => (
              <button
                key={c}
                title="Text color"
                onClick={() => wrap(`<span style="color:${c}">`, '</span>')}
                className="h-3.5 w-3.5 rounded-full"
                style={{ background: c }}
              />
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            {COLORS.map((c) => (
              <button
                key={c}
                title="Highlight"
                onClick={() => wrap(`<mark style="background:${c}40">`, '</mark>')}
                className="h-3.5 w-3.5 rounded"
                style={{ background: `${c}40`, border: `1px solid ${c}` }}
              />
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            <button className={tbBtn} onClick={() => wrap('$', '$')} title="Inline math">
              ∑
            </button>
            <button className={tbBtn} onClick={() => wrap('\n$$\n', '\n$$\n')} title="Block math">
              ∑∑
            </button>
            <button className={tbBtn} onClick={insertDiagram} title="Diagram">
              ◈
            </button>
          </div>
          <textarea
            ref={ta}
            autoFocus
            value={value}
            onChange={(e) => onChange({ content: e.target.value })}
            onBlur={() => setEditing(false)}
            className="min-h-28 w-full resize-y bg-transparent p-3 font-mono text-sm outline-none"
          />
        </div>
      ) : (
        <div onClick={() => setEditing(true)} className="cursor-text p-3">
          {value.trim() ? (
            <MarkdownView source={value} className="prose-sm max-w-none" />
          ) : (
            <span className="text-sm text-subtle">Click to write commentary…</span>
          )}
        </div>
      )}
    </BlockShell>
  )
}
