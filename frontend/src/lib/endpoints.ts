import { api, type AppConfig } from './api'
import type {
  AuthState,
  Block,
  CalendarData,
  Contributions,
  DiskUsage,
  FreezeState,
  LeetCodeProfile,
  Problem,
  Reminder,
  Revision,
  Settings,
  Stats,
  Tab,
} from '../types'

export interface Submission {
  id: number
  statusDisplay: string
  lang: string
  timestamp: number
  runtime?: string
  memory?: string
}
export interface SubmissionDetail {
  code: string
  lang?: { name: string }
}

export interface NewProblemInput {
  leetcode_number: number | null
  title: string
  difficulty: string
  elo_rating: number | null
  source_url: string | null
  tags: string[]
  description: string
}

export interface FetchedProblem {
  title: string
  difficulty: string
  source_url: string
  description: string
  tags: string[]
}

export interface SyncResult {
  username: string
  new_count: number
  rep_count: number
  profile: LeetCodeProfile
}

export interface BackfillResult {
  created: number
  skipped: number
  solved_total: number
}

export const endpoints = {
  // config + settings
  config: () => api.get<AppConfig>('/api/config'),
  saveConfig: (data: Partial<AppConfig>) => api.put<{ ok: boolean }>('/api/config', data),
  settings: () => api.get<Settings>('/api/settings'),
  saveSetting: (key: string, value: string) =>
    api.put<{ ok: boolean }>('/api/settings', { [key]: value }),

  // problems
  problems: () => api.get<Problem[]>('/api/problems'),
  deletedProblems: () => api.get<Problem[]>('/api/problems/deleted'),
  problem: (id: number, includeDeleted = false) =>
    api.get<Problem>(`/api/problems/${id}${includeDeleted ? '?include_deleted=1' : ''}`),
  createProblem: (input: NewProblemInput) => api.post<{ id: number }>('/api/problems', input),
  updateProblem: (id: number, patch: Partial<Problem> & { imported?: number }) =>
    api.put<{ ok: boolean }>(`/api/problems/${id}`, patch),
  deleteProblem: (id: number) => api.del<{ ok: boolean }>(`/api/problems/${id}`),
  restoreProblem: (id: number) => api.post<{ ok: boolean }>(`/api/problems/${id}/restore`),
  permanentDelete: (id: number) => api.del<{ ok: boolean }>(`/api/problems/${id}?permanent=1`),
  enrich: (id: number) =>
    api.post<{ enriched: boolean; problem?: Problem }>(`/api/problems/${id}/enrich`),

  // tabs
  tabs: (pid: number) => api.get<Tab[]>(`/api/problems/${pid}/tabs`),
  createTab: (pid: number, title: string) =>
    api.post<{ id: number }>(`/api/problems/${pid}/tabs`, { title }),
  renameTab: (tid: number, title: string) =>
    api.put<{ ok: boolean }>(`/api/tabs/${tid}`, { title }),
  saveTab: (tid: number, content: Block[]) =>
    api.put<{ ok: boolean }>(`/api/tabs/${tid}`, { content }),
  deleteTab: (tid: number) => api.del<{ ok: boolean }>(`/api/tabs/${tid}`),
  reorderTabs: (pid: number, tabIds: number[]) =>
    api.post<{ ok: boolean }>(`/api/problems/${pid}/tabs/reorder`, { tab_ids: tabIds }),

  // revisions
  revisions: (pid: number) => api.get<Revision[]>(`/api/problems/${pid}/revisions`),
  revise: (pid: number, remindDays: number) =>
    api.post<{ ok: boolean }>(`/api/problems/${pid}/revise`, { remind_days: remindDays }),

  // media
  videoThumbnail: (url: string) =>
    api.post<{ type: string; video_id: string | null; thumbnail: string | null }>(
      '/api/video-thumbnail',
      { url },
    ),
  uploadFile: async (file: File): Promise<{ url?: string }> => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: fd })
    return res.json()
  },

  // leetcode submissions (code import)
  leetcodeSubmissions: (slug: string) =>
    api.get<{ submissions: Submission[] }>(`/api/leetcode/submissions/${slug}`),
  leetcodeSubmissionCode: (id: number) =>
    api.get<SubmissionDetail>(`/api/leetcode/submission/${id}`),

  // calendar / reminders / stats / activity
  calendar: (year: number, month: number) =>
    api.get<CalendarData>(`/api/calendar/${year}/${month}`),
  reminders: () => api.get<Reminder[]>('/api/reminders'),
  upcoming: (days = 7) => api.get<Reminder[]>(`/api/upcoming?days=${days}`),
  stats: () => api.get<Stats>('/api/stats'),
  contributions: () => api.get<Contributions>('/api/contributions'),

  // freeze
  freeze: () => api.get<FreezeState>('/api/freeze'),
  toggleFreeze: () => api.post<FreezeState>('/api/freeze'),

  // disk
  diskUsage: () => api.get<DiskUsage>('/api/disk-usage'),

  // leetcode
  leetcodeCached: () => api.get<Partial<LeetCodeProfile>>('/api/leetcode/cached'),
  leetcodeFetch: (num: number) => api.get<FetchedProblem>(`/api/leetcode/${num}`),
  leetcodeSync: (username?: string) =>
    api.post<SyncResult>('/api/leetcode/sync', username ? { username } : {}),
  leetcodeAuth: () => api.get<AuthState>('/api/leetcode/auth?validate=1'),
  leetcodeLogin: (session: string, csrf: string) =>
    api.post<{ logged_in: boolean; username: string }>('/api/leetcode/login', { session, csrf }),
  leetcodeLogout: () => api.post<{ logged_in: boolean }>('/api/leetcode/logout'),
  leetcodeBackfill: () => api.post<BackfillResult>('/api/leetcode/backfill'),
}
