export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Problem {
  id: number
  leetcode_number: number | null
  title: string
  description: string
  difficulty: Difficulty
  tags: string[]
  source_url: string | null
  elo_rating: number | null
  created_at: string
  last_visited_at: string | null
  remind_date: string | null
  revision_count: number
  deleted_at: string | null
  platform: string
  external_id: string | null
}

/** A badge shown on a calendar day. */
export interface CalendarEntry {
  id: number
  leetcode_number: number | null
  title: string
  difficulty: Difficulty
  type: 'created' | 'revised' | 'upcoming'
  first_revision?: boolean
  last_visited_at: string | null
}

export type CalendarData = Record<string, CalendarEntry[]>

export interface Reminder {
  id: number
  leetcode_number: number | null
  title: string
  difficulty: Difficulty
  remind_date: string
}

export interface Stats {
  difficulty_counts: Partial<Record<Difficulty, number>>
  tag_counts: Record<string, number>
}

export type Contributions = Record<string, number>

export interface LeetCodeProfile {
  username: string
  ranking?: number | null
  solved?: Partial<Record<'all' | Difficulty, number>>
  streak?: number
  totalActiveDays?: number
}

export interface AuthState {
  logged_in: boolean
  username?: string | null
  valid?: boolean
}

export interface FreezeState {
  frozen: boolean
  freeze_start: string | null
}

export interface DiskUsage {
  total_mb: number
  file_count: number
}

export interface Settings {
  default_language?: string
  open_in_new_tab?: string
  dfr_days?: string
  leetcode_username?: string
  leetcode_last_sync_at?: string
  [key: string]: string | undefined
}
