import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { endpoints } from '../../lib/endpoints'
import { openProblem } from '../../lib/nav'
import type { Difficulty } from '../../types'

const field =
  'w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent'
const label = 'mb-1 block text-xs font-medium text-muted'

export function NewProblemModal({
  openInNewTab,
  onClose,
  onCreated,
}: {
  openInNewTab: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [num, setNum] = useState('')
  const [title, setTitle] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [elo, setElo] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [status, setStatus] = useState<{ msg: string; color: string } | null>(null)
  const [fetching, setFetching] = useState(false)

  async function fetchFromLeetCode() {
    if (!num) return
    setFetching(true)
    setStatus({ msg: 'Fetching from LeetCode…', color: 'text-muted' })
    try {
      const data = await endpoints.leetcodeFetch(Number(num))
      setTitle(data.title || '')
      setDifficulty((data.difficulty as Difficulty) || 'medium')
      setSourceUrl(data.source_url || '')
      setDescription(data.description || '')
      setTags(data.tags || [])
      setStatus({ msg: 'Fetched successfully!', color: 'text-easy' })
    } catch {
      setStatus({ msg: 'Problem not found or LeetCode unavailable', color: 'text-hard' })
    } finally {
      setFetching(false)
    }
  }

  function onTagKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const v = tagInput.trim().replace(/,/g, '')
      if (v && !tags.includes(v)) setTags([...tags, v])
      setTagInput('')
    } else if (e.key === 'Backspace' && !tagInput && tags.length) {
      setTags(tags.slice(0, -1))
    }
  }

  async function create() {
    if (!title.trim()) {
      setStatus({ msg: 'Title is required', color: 'text-hard' })
      return
    }
    const { id } = await endpoints.createProblem({
      leetcode_number: num ? Number(num) : null,
      title: title.trim(),
      difficulty,
      elo_rating: elo ? Number(elo) : null,
      source_url: sourceUrl.trim() || null,
      tags,
      description,
    })
    onCreated()
    openProblem(id, openInNewTab)
    onClose()
  }

  return (
    <Modal title="New Problem" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className={label}>LeetCode # (optional)</label>
            <input
              className={field}
              type="number"
              value={num}
              onChange={(e) => setNum(e.target.value)}
              placeholder="e.g. 1"
            />
          </div>
          <button
            onClick={fetchFromLeetCode}
            disabled={fetching}
            className="rounded-md border-2 border-ink bg-card px-3 py-1.5 text-sm hover:bg-card-hover disabled:opacity-50"
          >
            Fetch
          </button>
        </div>

        <div>
          <label className={label}>Title *</label>
          <input
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Two Sum"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Difficulty</label>
            <select
              className={field}
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div>
            <label className={label}>Elo Rating</label>
            <input
              className={field}
              type="number"
              value={elo}
              onChange={(e) => setElo(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <div>
          <label className={label}>Source URL</label>
          <input
            className={field}
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://leetcode.com/problems/..."
          />
        </div>

        <div>
          <label className={label}>Tags (press Enter to add)</label>
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-bg px-2 py-1.5">
            {tags.map((t, i) => (
              <span
                key={t}
                className="flex items-center gap-1 rounded bg-card px-1.5 py-0.5 text-xs"
              >
                {t}
                <button
                  onClick={() => setTags(tags.filter((_, idx) => idx !== i))}
                  className="text-muted hover:text-fg"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              className="min-w-24 flex-1 bg-transparent text-sm outline-none"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKey}
              placeholder="e.g. Array, DP..."
            />
          </div>
        </div>

        <div>
          <label className={label}>Description</label>
          <textarea
            className={`${field} resize-y`}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Problem description (HTML or plain text)"
          />
        </div>

        {status && <div className={`text-xs ${status.color}`}>{status.msg}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-md border-2 border-ink bg-card px-3 py-1.5 text-sm hover:bg-card-hover"
          >
            Cancel
          </button>
          <button
            onClick={create}
            className="rounded-md border-2 border-accent bg-accent/15 px-3 py-1.5 text-sm font-medium text-fg hover:bg-accent/25"
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  )
}
