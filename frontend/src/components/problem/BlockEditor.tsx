import { useState } from 'react'
import type { EditorBlock, SaveStatus } from '../../hooks/useProblemEditor'
import type { Block } from '../../types'
import { CodeBlock } from './blocks/CodeBlock'
import { MarkdownBlock } from './blocks/MarkdownBlock'
import { ImageBlock, VideoBlock } from './blocks/MediaBlocks'

interface BlockEditorProps {
  blocks: EditorBlock[]
  status: SaveStatus
  canEdit: boolean
  importStatus: { msg: string; color: string } | null
  onAddCode: () => void
  onAddMarkdown: () => void
  onOpenImage: () => void
  onOpenVideo: () => void
  onImport: () => void
  onUpdateBlock: (id: number, patch: Partial<Block>) => void
  onRemoveBlock: (id: number) => void
  onMoveBlock: (fromId: number, toIndex: number) => void
}

const addBtn =
  'rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-card-hover disabled:opacity-40'

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
  const [dragId, setDragId] = useState<number | null>(null)
  const [over, setOver] = useState<{ idx: number; above: boolean } | null>(null)

  function handleDrop() {
    if (dragId == null || !over) return
    const from = blocks.findIndex((b) => b._id === dragId)
    let to = over.above ? over.idx : over.idx + 1
    if (from < to) to--
    onMoveBlock(dragId, to)
    setDragId(null)
    setOver(null)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className={addBtn} onClick={onAddCode} disabled={!canEdit}>
          + Code
        </button>
        <button className={addBtn} onClick={onAddMarkdown} disabled={!canEdit}>
          + Commentary
        </button>
        <button className={addBtn} onClick={onOpenImage} disabled={!canEdit}>
          + Image
        </button>
        <button className={addBtn} onClick={onOpenVideo} disabled={!canEdit}>
          + Video
        </button>
        <button
          className={addBtn}
          onClick={onImport}
          disabled={!canEdit}
          title="Import your accepted submission from LeetCode as a code block"
        >
          ⭳ Import my LeetCode code
        </button>
        {importStatus && (
          <span className="self-center text-[11px]" style={{ color: importStatus.color }}>
            {importStatus.msg}
          </span>
        )}
        <span className="ml-auto self-center text-xs text-muted">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
        </span>
      </div>

      <div className="space-y-3">
        {blocks.map((block, i) => {
          const handleProps = {
            draggable: canEdit,
            onDragStart: () => setDragId(block._id),
            onDragEnd: () => {
              setDragId(null)
              setOver(null)
            },
          }
          const commonWrap = {
            onDragOver: (e: React.DragEvent) => {
              if (dragId == null) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              setOver({ idx: i, above: e.clientY < r.top + r.height / 2 })
            },
            onDrop: handleDrop,
          }
          const indicator =
            over?.idx === i
              ? over.above
                ? 'before:absolute before:inset-x-0 before:-top-1.5 before:h-0.5 before:bg-accent'
                : 'after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:bg-accent'
              : ''
          return (
            <div key={block._id} className={`relative ${indicator}`} {...commonWrap}>
              {block.type === 'code' ? (
                <CodeBlock
                  block={block}
                  handleProps={handleProps}
                  onChange={(patch) => onUpdateBlock(block._id, patch)}
                  onRemove={() => onRemoveBlock(block._id)}
                />
              ) : block.type === 'markdown' ? (
                <MarkdownBlock
                  block={block}
                  handleProps={handleProps}
                  onChange={(patch) => onUpdateBlock(block._id, patch)}
                  onRemove={() => onRemoveBlock(block._id)}
                />
              ) : block.type === 'image' ? (
                <ImageBlock
                  block={block}
                  handleProps={handleProps}
                  onRemove={() => onRemoveBlock(block._id)}
                />
              ) : (
                <VideoBlock
                  block={block}
                  handleProps={handleProps}
                  onRemove={() => onRemoveBlock(block._id)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
