import { useRef, useState } from 'react'
import type { EditorBlock, SaveStatus } from '../../hooks/useProblemEditor'
import type { Block } from '../../types'
import { CodeBlock } from './blocks/CodeBlock'
import { MarkdownBlock } from './blocks/MarkdownBlock'
import { ImageBlock, VideoBlock } from './blocks/MediaBlocks'

type AddType = 'code' | 'markdown' | 'image' | 'video' | 'lc-import'

interface BlockEditorProps {
  blocks: EditorBlock[]
  status: SaveStatus
  canEdit: boolean
  importStatus: { msg: string; color: string } | null
  onAddCode: (index?: number) => void
  onAddMarkdown: (index?: number) => void
  onOpenImage: (index?: number) => void
  onOpenVideo: (index?: number) => void
  onImport: (index?: number) => void
  onUpdateBlock: (id: number, patch: Partial<Block>) => void
  onRemoveBlock: (id: number) => void
  onMoveBlock: (fromId: number, toIndex: number) => void
}

const TOOLBAR: { type: AddType; label: string }[] = [
  { type: 'code', label: '+ Code' },
  { type: 'markdown', label: '+ Commentary' },
  { type: 'image', label: '+ Image' },
  { type: 'video', label: '+ Video' },
  { type: 'lc-import', label: '⭳ Import my LeetCode code' },
]

const addBtn =
  'select-none rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-card-hover disabled:opacity-40'

export function BlockEditor({
  blocks,
  status,
  canEdit,
  importStatus,
  onAddCode,
  onAddMarkdown,
  onOpenImage,
  onOpenVideo,
  onImport,
  onUpdateBlock,
  onRemoveBlock,
  onMoveBlock,
}: BlockEditorProps) {
  const wrapRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const [dragSrcId, setDragSrcId] = useState<number | null>(null)
  // Insertion index (0..blocks.length) where the drop line shows. Shared by
  // block reorder and toolbar drag-to-insert.
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [ghost, setGhost] = useState<{ label: string; x: number; y: number } | null>(null)

  function dispatchAdd(type: AddType, index?: number) {
    if (type === 'code') onAddCode(index)
    else if (type === 'markdown') onAddMarkdown(index)
    else if (type === 'image') onOpenImage(index)
    else if (type === 'video') onOpenVideo(index)
    else onImport(index)
  }

  /** Insertion index for a pointer Y, from the block midpoints. */
  function indexFromY(clientY: number): number {
    for (let i = 0; i < blocks.length; i++) {
      const el = wrapRefs.current[blocks[i]._id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return i
    }
    return blocks.length
  }

  // ── Block reorder (native drag, grabbed by the toolbar) ──────
  const arm = (id: number) => {
    const el = wrapRefs.current[id]
    if (el && canEdit) el.draggable = true
  }
  const disarm = (id: number) => {
    const el = wrapRefs.current[id]
    if (el) el.draggable = false
  }

  function onListDragOver(e: React.DragEvent) {
    if (dragSrcId == null) return
    e.preventDefault()
    setDropIndex(indexFromY(e.clientY))
  }
  function onListDrop() {
    if (dragSrcId == null || dropIndex == null) return reset()
    const from = blocks.findIndex((b) => b._id === dragSrcId)
    const to = from < dropIndex ? dropIndex - 1 : dropIndex
    if (from !== to) onMoveBlock(dragSrcId, to)
    reset()
  }
  function reset() {
    setDragSrcId(null)
    setDropIndex(null)
  }

  // ── Toolbar drag-to-insert (long-press a button, drag to a slot) ──
  function onButtonMouseDown(e: React.MouseEvent, type: AddType, label: string) {
    if (!canEdit || e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      dragging = true
      setGhost({ label, x: startX, y: startY })
      setDropIndex(indexFromY(startY))
    }, 300)

    const move = (ev: MouseEvent) => {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5) {
          if (timer) clearTimeout(timer)
          timer = null
        }
        return
      }
      setGhost({ label, x: ev.clientX, y: ev.clientY })
      setDropIndex(indexFromY(ev.clientY))
    }
    const up = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      if (timer) clearTimeout(timer)
      if (dragging) {
        const idx = indexFromY(ev.clientY)
        setGhost(null)
        setDropIndex(null)
        dispatchAdd(type, idx)
      } else {
        // Treated as a plain click → append at the end.
        dispatchAdd(type)
      }
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const dropLine = (at: number) =>
    dropIndex === at ? <div className="my-0.5 h-0.5 rounded bg-accent" /> : null

  return (
    <div>
      <div className="sticky -top-4 z-10 -mt-3 mb-3 flex flex-wrap items-center gap-2 bg-bg pt-7">
        {TOOLBAR.map((b) => (
          <button
            key={b.type}
            className={addBtn}
            disabled={!canEdit}
            onMouseDown={(e) => onButtonMouseDown(e, b.type, b.label)}
            title={
              b.type === 'lc-import'
                ? 'Click to add, or long-press and drag to insert at a spot'
                : undefined
            }
          >
            {b.label}
          </button>
        ))}
        {importStatus && (
          <span className="self-center text-[11px]" style={{ color: importStatus.color }}>
            {importStatus.msg}
          </span>
        )}
        <span className="ml-auto self-center text-xs text-muted">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
        </span>
      </div>

      <div onDragOver={onListDragOver} onDrop={onListDrop}>
        {blocks.map((block, i) => (
          <div key={block._id}>
            {dropLine(i)}
            <div
              ref={(el) => {
                wrapRefs.current[block._id] = el
              }}
              onDragStart={() => setDragSrcId(block._id)}
              onDragEnd={() => {
                disarm(block._id)
                reset()
              }}
              className={dragSrcId === block._id ? 'opacity-40' : ''}
            >
              {block.type === 'code' ? (
                <CodeBlock
                  block={block}
                  onGripDown={() => arm(block._id)}
                  onGripUp={() => disarm(block._id)}
                  onChange={(patch) => onUpdateBlock(block._id, patch)}
                  onRemove={() => onRemoveBlock(block._id)}
                />
              ) : block.type === 'markdown' ? (
                <MarkdownBlock
                  block={block}
                  onGripDown={() => arm(block._id)}
                  onGripUp={() => disarm(block._id)}
                  onChange={(patch) => onUpdateBlock(block._id, patch)}
                  onRemove={() => onRemoveBlock(block._id)}
                />
              ) : block.type === 'image' ? (
                <ImageBlock
                  block={block}
                  onGripDown={() => arm(block._id)}
                  onGripUp={() => disarm(block._id)}
                  onRemove={() => onRemoveBlock(block._id)}
                />
              ) : (
                <VideoBlock
                  block={block}
                  onGripDown={() => arm(block._id)}
                  onGripUp={() => disarm(block._id)}
                  onRemove={() => onRemoveBlock(block._id)}
                />
              )}
            </div>
          </div>
        ))}
        {dropLine(blocks.length)}
      </div>

      {ghost && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-accent bg-card px-2 py-1 text-xs opacity-90 shadow-lg"
          style={{ left: ghost.x + 8, top: ghost.y + 8 }}
        >
          {ghost.label}
        </div>
      )}
    </div>
  )
}
