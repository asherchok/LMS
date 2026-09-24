import { useCallback, useEffect, useRef, useState } from 'react'
import { endpoints } from '../lib/endpoints'
import type { Block, Tab } from '../types'

export type EditorBlock = Block & { _id: number }
export type SaveStatus = 'idle' | 'saving' | 'saved'

let _uid = 1
const withIds = (blocks: Block[]): EditorBlock[] =>
  (blocks || []).map((b) => ({ ...b, _id: _uid++ }))
const stripIds = (blocks: EditorBlock[]): Block[] => blocks.map(({ _id, ...rest }) => rest as Block)

/** Owns the tab list and the active tab's working blocks, with debounced
 *  autosave. Blocks carry a client-only `_id` for stable React keys across
 *  reordering; it's stripped before saving. */
export function useProblemEditor(problemId: number, canEdit: boolean) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [blocks, setBlocks] = useState<EditorBlock[]>([])
  const [status, setStatus] = useState<SaveStatus>('idle')

  // Mirror the latest blocks/active id into refs so debounced callbacks read
  // fresh values without stale closures. Updated in effects (not during render).
  const blocksRef = useRef<EditorBlock[]>([])
  const activeRef = useRef<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])
  useEffect(() => {
    activeRef.current = activeId
  }, [activeId])

  // Initial load — select the last tab (matches the original).
  useEffect(() => {
    endpoints.tabs(problemId).then((t) => {
      setTabs(t)
      if (t.length) {
        const last = t[t.length - 1]
        setActiveId(last.id)
        setBlocks(withIds(last.content))
      }
    })
  }, [problemId])

  const flush = useCallback(async () => {
    const id = activeRef.current
    if (id == null || !canEdit) return
    setStatus('saving')
    const content = stripIds(blocksRef.current)
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, content } : t)))
    await endpoints.saveTab(id, content)
    setStatus('saved')
  }, [canEdit])

  const scheduleSave = useCallback(() => {
    if (!canEdit) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 1000)
  }, [flush, canEdit])

  const commit = useCallback(
    (next: EditorBlock[]) => {
      setBlocks(next)
      scheduleSave()
    },
    [scheduleSave],
  )

  const switchTab = useCallback(
    async (id: number) => {
      if (id === activeRef.current) return
      await flush() // persist current before leaving
      const t = await endpoints.tabs(problemId).then((all) => all.find((x) => x.id === id))
      setActiveId(id)
      setBlocks(withIds(t?.content ?? []))
    },
    [flush, problemId],
  )

  const reload = useCallback(async () => {
    const t = await endpoints.tabs(problemId)
    setTabs(t)
    return t
  }, [problemId])

  const createTab = useCallback(async () => {
    await flush()
    const { id } = await endpoints.createTab(problemId, `Approach ${tabs.length + 1}`)
    const all = await reload()
    const created = all.find((x) => x.id === id)
    setActiveId(id)
    setBlocks(withIds(created?.content ?? []))
  }, [flush, problemId, tabs.length, reload])

  const deleteTab = useCallback(async () => {
    if (tabs.length <= 1 || activeId == null) return
    await endpoints.deleteTab(activeId)
    const all = await reload()
    if (all.length) {
      const last = all[all.length - 1]
      setActiveId(last.id)
      setBlocks(withIds(last.content))
    }
  }, [tabs.length, activeId, reload])

  const renameTab = useCallback(
    async (title: string) => {
      if (activeId == null || !title.trim()) return
      await endpoints.renameTab(activeId, title.trim())
      setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, title: title.trim() } : t)))
    },
    [activeId],
  )

  const reorderTabs = useCallback(
    async (next: Tab[]) => {
      setTabs(next)
      await endpoints.reorderTabs(
        problemId,
        next.map((t) => t.id),
      )
    },
    [problemId],
  )

  // Block ops --------------------------------------------------------------
  const addBlock = useCallback(
    (block: Block, atIndex?: number) => {
      const b: EditorBlock = { ...block, _id: _uid++ }
      const next = [...blocksRef.current]
      if (atIndex != null && atIndex >= 0 && atIndex <= next.length) next.splice(atIndex, 0, b)
      else next.push(b)
      commit(next)
    },
    [commit],
  )

  const updateBlock = useCallback(
    (id: number, patch: Partial<Block>) => {
      commit(blocksRef.current.map((b) => (b._id === id ? ({ ...b, ...patch } as EditorBlock) : b)))
    },
    [commit],
  )

  const removeBlock = useCallback(
    (id: number) => commit(blocksRef.current.filter((b) => b._id !== id)),
    [commit],
  )

  const moveBlock = useCallback(
    (fromId: number, toIndex: number) => {
      const arr = [...blocksRef.current]
      const from = arr.findIndex((b) => b._id === fromId)
      if (from < 0) return
      const [moved] = arr.splice(from, 1)
      arr.splice(Math.max(0, Math.min(arr.length, toIndex)), 0, moved)
      commit(arr)
    },
    [commit],
  )

  return {
    tabs,
    activeId,
    blocks,
    status,
    switchTab,
    createTab,
    deleteTab,
    renameTab,
    reorderTabs,
    addBlock,
    updateBlock,
    removeBlock,
    moveBlock,
  }
}
