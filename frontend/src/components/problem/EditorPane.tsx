import { useEffect, useState } from 'react'
import { TabsRail } from './TabsRail'
import { BlockEditor } from './BlockEditor'
import type { useProblemEditor } from '../../hooks/useProblemEditor'

type Editor = ReturnType<typeof useProblemEditor>

export function EditorPane({
  editor,
  defaultLanguage,
  canEdit,
  importStatus,
  onOpenImage,
  onOpenVideo,
  onImport,
}: {
  editor: Editor
  defaultLanguage: string
  canEdit: boolean
  importStatus: { msg: string; color: string } | null
  onOpenImage: (index?: number) => void
  onOpenVideo: (index?: number) => void
  onImport: (index?: number) => void
}) {
  const activeTab = editor.tabs.find((t) => t.id === editor.activeId)
  const [title, setTitle] = useState(activeTab?.title ?? '')
  useEffect(() => setTitle(activeTab?.title ?? ''), [activeTab?.id, activeTab?.title])

  return (
    <div className="flex min-h-0 flex-1">
      <TabsRail
        tabs={editor.tabs}
        activeId={editor.activeId}
        canEdit={canEdit}
        onSwitch={editor.switchTab}
        onCreate={editor.createTab}
        onReorder={editor.reorderTabs}
      />
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center gap-2">
          <input
            value={title}
            disabled={!canEdit}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => editor.renameTab(title)}
            className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold hover:border-border focus:border-accent focus:outline-none"
          />
          {canEdit && editor.tabs.length > 1 && (
            <button
              onClick={() => {
                if (confirm('Delete this approach tab?')) editor.deleteTab()
              }}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-hard"
            >
              Delete Tab
            </button>
          )}
        </div>

        <BlockEditor
          blocks={editor.blocks}
          status={editor.status}
          canEdit={canEdit}
          importStatus={importStatus}
          onAddCode={(index) =>
            editor.addBlock({ type: 'code', language: defaultLanguage, content: '' }, index)
          }
          onAddMarkdown={(index) => editor.addBlock({ type: 'markdown', content: '' }, index)}
          onOpenImage={onOpenImage}
          onOpenVideo={onOpenVideo}
          onImport={onImport}
          onUpdateBlock={editor.updateBlock}
          onRemoveBlock={editor.removeBlock}
          onMoveBlock={editor.moveBlock}
        />
      </div>
    </div>
  )
}
