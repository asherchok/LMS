import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Header } from '../components/Header'
import { ProblemDescription } from '../components/problem/ProblemDescription'
import { EditorPane } from '../components/problem/EditorPane'
import { RevisedModal } from '../components/problem/modals/RevisedModal'
import { RevisionHistoryModal } from '../components/problem/modals/RevisionHistoryModal'
import { ImageModal, VideoModal } from '../components/problem/modals/MediaModals'
import { useProblemEditor } from '../hooks/useProblemEditor'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { endpoints } from '../lib/endpoints'
import { ApiError } from '../lib/api'
import type { Block, Problem as ProblemT, Revision } from '../types'

const LC_LANG_MAP: Record<string, string> = {
  python: 'python',
  python3: 'python',
  pythondata: 'python',
  golang: 'go',
  bash: 'shell',
  mysql: 'sql',
  mssql: 'sql',
  oraclesql: 'sql',
}
const KNOWN_LANGS = new Set([
  'python',
  'cpp',
  'javascript',
  'typescript',
  'java',
  'c',
  'csharp',
  'go',
  'rust',
  'ruby',
  'swift',
  'kotlin',
  'scala',
  'sql',
  'shell',
])
function mapLcLang(lc: string, fallback: string): string {
  if (!lc) return fallback
  return LC_LANG_MAP[lc] || (KNOWN_LANGS.has(lc) ? lc : 'plaintext')
}

type ModalKind = 'revised' | 'history' | 'image' | 'video' | null

export default function Problem() {
  const { id } = useParams()
  const pid = Number(id)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [problem, setProblem] = useState<ProblemT | null>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [defaultLang, setDefaultLang] = useState('python')
  const [modal, setModal] = useState<ModalKind>(null)
  const [importStatus, setImportStatus] = useState<{ msg: string; color: string } | null>(null)
  const [leftPct, setLeftPct] = useState(45)
  const containerRef = useRef<HTMLDivElement>(null)

  const canEdit = !!problem && !problem.deleted_at
  const editor = useProblemEditor(pid, canEdit)

  const loadProblem = useCallback(() => endpoints.problem(pid, true).then(setProblem), [pid])
  const loadRevisions = useCallback(() => endpoints.revisions(pid).then(setRevisions), [pid])

  useEffect(() => {
    endpoints.settings().then((s) => setDefaultLang(s.default_language || 'python'))
    loadProblem()
    loadRevisions()
  }, [loadProblem, loadRevisions])

  // Paste an image anywhere (outside inputs) → upload + add image block.
  useEffect(() => {
    if (!canEdit) return
    const onPaste = async (e: ClipboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return
      for (const item of e.clipboardData?.items ?? []) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            const { url } = await endpoints.uploadFile(file)
            if (url) editor.addBlock({ type: 'image', src: url, caption: '' })
          }
          return
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [canEdit, editor])

  function startResize(e: React.MouseEvent) {
    e.preventDefault()
    const move = (ev: MouseEvent) => {
      const r = containerRef.current?.getBoundingClientRect()
      if (!r) return
      setLeftPct(Math.min(75, Math.max(25, ((ev.clientX - r.left) / r.width) * 100)))
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  function insertBlock(block: Block) {
    editor.addBlock(block)
    setModal(null)
  }

  async function importLeetCode() {
    if (!problem?.title_slug) {
      setImportStatus({ msg: 'No LeetCode slug — set the LeetCode # first.', color: 'var(--hard)' })
      return
    }
    setImportStatus({ msg: 'Fetching your submissions from LeetCode…', color: 'var(--muted)' })
    try {
      const { submissions } = await endpoints.leetcodeSubmissions(problem.title_slug)
      const accepted = submissions.find((s) => s.statusDisplay === 'Accepted') || submissions[0]
      if (!accepted) {
        setImportStatus({ msg: 'No submissions found for this problem.', color: 'var(--hard)' })
        return
      }
      const detail = await endpoints.leetcodeSubmissionCode(accepted.id)
      if (!detail.code) {
        setImportStatus({ msg: 'Could not retrieve the submission code.', color: 'var(--hard)' })
        return
      }
      const lang = detail.lang?.name || accepted.lang
      editor.addBlock({
        type: 'code',
        language: mapLcLang(lang, defaultLang),
        content: detail.code,
      })
      if (accepted.timestamp) {
        endpoints.updateProblem(pid, {
          created_at: new Date(accepted.timestamp * 1000).toISOString(),
          imported: 0,
        })
      }
      setImportStatus({ msg: 'Imported code block into current tab.', color: 'var(--easy)' })
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 401
          ? 'Log in to LeetCode from the home page Settings first.'
          : 'Failed to reach LeetCode.'
      setImportStatus({ msg, color: 'var(--hard)' })
    }
  }

  if (!problem) {
    return (
      <div className="min-h-screen">
        <Header actions={<BackLink />} />
        <p className="p-6 text-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <Header actions={<BackLink />} />
      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className="overflow-y-auto p-4 lg:p-6"
          style={isDesktop ? { width: `${leftPct}%`, flexShrink: 0 } : undefined}
        >
          <ProblemDescription
            problem={problem}
            revisions={revisions}
            onReload={() => {
              loadProblem()
              loadRevisions()
            }}
            onShowRevised={() => setModal('revised')}
            onShowHistory={() => setModal('history')}
          />
        </div>

        <div
          onMouseDown={startResize}
          className="hidden w-1.5 cursor-col-resize bg-border hover:bg-accent lg:block"
        />

        <div className="flex min-h-0 flex-1 flex-col border-t border-border lg:border-l lg:border-t-0">
          <EditorPane
            editor={editor}
            defaultLanguage={defaultLang}
            canEdit={canEdit}
            importStatus={importStatus}
            onOpenImage={() => setModal('image')}
            onOpenVideo={() => setModal('video')}
            onImport={importLeetCode}
          />
        </div>
      </div>

      {modal === 'revised' && (
        <RevisedModal
          title={problem.title}
          revisionCount={problem.revision_count}
          revisions={revisions}
          onClose={() => setModal(null)}
          onConfirm={async (days) => {
            await endpoints.revise(pid, days)
            loadProblem()
            loadRevisions()
          }}
        />
      )}
      {modal === 'history' && (
        <RevisionHistoryModal
          title={problem.title}
          revisions={revisions}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'image' && <ImageModal onClose={() => setModal(null)} onInsert={insertBlock} />}
      {modal === 'video' && <VideoModal onClose={() => setModal(null)} onInsert={insertBlock} />}
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/"
      className="rounded-md border-2 border-ink bg-card px-3 py-1.5 text-sm text-fg transition-colors hover:bg-card-hover"
    >
      ← Back
    </Link>
  )
}
