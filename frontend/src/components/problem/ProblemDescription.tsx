import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DOMPurify from 'dompurify'
import renderMathInElement from 'katex/contrib/auto-render'
import 'katex/dist/katex.min.css'
import { Badge } from '../ui/Badge'
import { endpoints } from '../../lib/endpoints'
import type { Difficulty, Problem, Revision } from '../../types'

/** Renders sanitized HTML (LeetCode descriptions) and runs KaTeX over it. */
function RichHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = DOMPurify.sanitize(html)
    try {
      renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ],
        throwOnError: false,
      })
    } catch {
      /* ignore malformed math */
    }
  }, [html])
  return <div ref={ref} className="prose-sm mt-4 max-w-none text-sm leading-relaxed" />
}

const field = 'w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm outline-none'
const flabel = 'mb-1 block text-xs font-medium text-muted'

export function ProblemDescription({
  problem,
  revisions,
  onReload,
  onShowRevised,
  onShowHistory,
}: {
  problem: Problem
  revisions: Revision[]
  onReload: () => void
  onShowRevised: () => void
  onShowHistory: () => void
}) {
  const navigate = useNavigate()
  const isDeleted = !!problem.deleted_at
  const [editing, setEditing] = useState(false)
  const [description, setDescription] = useState(problem.description)
  const [tags, setTags] = useState(problem.tags)

  // Edit-form fields
  const [form, setForm] = useState({
    title: problem.title,
    leetcode_number: problem.leetcode_number?.toString() ?? '',
    difficulty: problem.difficulty as Difficulty,
    elo_rating: problem.elo_rating?.toString() ?? '',
    source_url: problem.source_url ?? '',
    tags: problem.tags.join(', '),
    description: problem.description,
  })

  // Lazy-enrich: imported problems have no description until first opened.
  useEffect(() => {
    if (description.trim() || !problem.title_slug || isDeleted) return
    endpoints.enrich(problem.id).then((res) => {
      if (res.enriched && res.problem) {
        setDescription(res.problem.description || '')
        if (res.problem.tags?.length) setTags(res.problem.tags)
      }
    })
  }, [problem.id, problem.title_slug, description, isDeleted])

  async function save() {
    await endpoints.updateProblem(problem.id, {
      title: form.title.trim(),
      leetcode_number: form.leetcode_number ? Number(form.leetcode_number) : null,
      difficulty: form.difficulty,
      elo_rating: form.elo_rating ? Number(form.elo_rating) : null,
      source_url: form.source_url.trim() || null,
      tags: form.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      description: form.description,
    })
    setEditing(false)
    onReload()
  }

  const revDots = Math.min(revisions.length, 10)
  const lastRevised = revisions[0]

  return (
    <div className="min-w-0">
      {isDeleted && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-hard/40 bg-hard/10 p-2 text-sm">
          <span className="flex-1 text-hard">
            This problem is in the trash. Recover it to edit.
          </span>
          <button
            onClick={async () => {
              await endpoints.restoreProblem(problem.id)
              onReload()
            }}
            className="rounded border border-easy px-2 py-1 text-xs text-easy"
          >
            Recover
          </button>
          <button
            onClick={async () => {
              if (!confirm('Permanently delete this problem? This cannot be undone.')) return
              await endpoints.permanentDelete(problem.id)
              navigate('/')
            }}
            className="rounded border border-hard px-2 py-1 text-xs text-hard"
          >
            Delete Permanently
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        {problem.leetcode_number != null && (
          <span className="font-mono text-sm text-muted">#{problem.leetcode_number}</span>
        )}
        <h1 className="text-xl font-bold">{problem.title}</h1>
        {!isDeleted && (
          <button
            onClick={() => setEditing((v) => !v)}
            title="Edit problem"
            className="ml-1 text-muted hover:text-fg"
          >
            ✎
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Badge difficulty={problem.difficulty} />
        {problem.elo_rating != null && (
          <span className="text-xs text-muted">Elo: {problem.elo_rating}</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: revDots }).map((_, i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-accent" />
          ))}
        </div>
        <span className="text-sm font-semibold tabular-nums">{problem.revision_count}</span>
        <span className="text-xs text-muted">
          revision{problem.revision_count !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onShowHistory}
          className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
        >
          History
        </button>
        {!isDeleted && (
          <button
            onClick={onShowRevised}
            className="rounded border border-easy px-1.5 py-0.5 text-[11px] text-easy hover:bg-easy/10"
          >
            ✓ Revised
          </button>
        )}
        {lastRevised && (
          <span className="text-[11px] text-muted">
            Last: {new Date(lastRevised.revised_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {problem.source_url && (
        <a
          href={problem.source_url}
          target="_blank"
          rel="noopener"
          className="mt-3 inline-block rounded-md border border-border px-3 py-1.5 text-sm text-medium hover:bg-card"
        >
          ↗ Go to Source
        </a>
      )}

      {description.trim() ? (
        <RichHtml html={description} />
      ) : problem.title_slug && !isDeleted ? (
        <div className="mt-4 text-sm text-muted">Loading problem from LeetCode…</div>
      ) : null}

      {editing && (
        <div className="mt-5 space-y-3 rounded-lg border border-border bg-card p-3">
          <div>
            <label className={flabel}>Title</label>
            <input
              className={field}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={flabel}>LeetCode #</label>
              <input
                className={field}
                type="number"
                value={form.leetcode_number}
                onChange={(e) => setForm({ ...form, leetcode_number: e.target.value })}
              />
            </div>
            <div>
              <label className={flabel}>Difficulty</label>
              <select
                className={field}
                value={form.difficulty}
                onChange={(e) => setForm({ ...form, difficulty: e.target.value as Difficulty })}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
          <div>
            <label className={flabel}>Elo Rating</label>
            <input
              className={field}
              type="number"
              value={form.elo_rating}
              onChange={(e) => setForm({ ...form, elo_rating: e.target.value })}
            />
          </div>
          <div>
            <label className={flabel}>Source URL</label>
            <input
              className={field}
              value={form.source_url}
              onChange={(e) => setForm({ ...form, source_url: e.target.value })}
            />
          </div>
          <div>
            <label className={flabel}>Tags (comma-separated)</label>
            <input
              className={field}
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </div>
          <div>
            <label className={flabel}>Description</label>
            <textarea
              className={`${field} resize-y`}
              rows={8}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              className="rounded-md border-2 border-accent bg-accent/15 px-3 py-1.5 text-sm hover:bg-accent/25"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border-2 border-ink bg-card px-3 py-1.5 text-sm hover:bg-card-hover"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (
                  !confirm(
                    'Move this problem to trash? It will be permanently deleted after 7 days.',
                  )
                )
                  return
                await endpoints.deleteProblem(problem.id)
                navigate('/')
              }}
              className="ml-auto rounded-md border-2 border-hard bg-hard/10 px-3 py-1.5 text-sm text-hard hover:bg-hard/20"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
