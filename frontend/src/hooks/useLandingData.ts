import { useCallback, useEffect, useState } from 'react'
import { endpoints } from '../lib/endpoints'
import type {
  CalendarData,
  Contributions,
  FreezeState,
  LeetCodeProfile,
  Problem,
  Reminder,
  Stats,
} from '../types'

/** Central data layer for the landing page. Owns all server state and exposes
 *  granular reloaders so actions (sync, freeze, reschedule…) can refresh just
 *  the affected slices — mirroring the original page's load* functions. */
export function useLandingData() {
  // year + month as one value so month rollover updates both in a single
  // setter (no nested state updates).
  const [ym, setYm] = useState(() => {
    const n = new Date()
    return { year: n.getFullYear(), month: n.getMonth() + 1 } // month 1-based
  })
  const { year, month } = ym

  const [problems, setProblems] = useState<Problem[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [contributions, setContributions] = useState<Contributions>({})
  const [calendar, setCalendar] = useState<CalendarData>({})
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [upcoming, setUpcoming] = useState<Reminder[]>([])
  const [freeze, setFreeze] = useState<FreezeState>({ frozen: false, freeze_start: null })
  const [profile, setProfile] = useState<LeetCodeProfile | null>(null)
  const [openInNewTab, setOpenInNewTab] = useState(true)

  const reloadProblems = useCallback(() => endpoints.problems().then(setProblems), [])
  const reloadStats = useCallback(() => endpoints.stats().then(setStats), [])
  const reloadContributions = useCallback(
    () => endpoints.contributions().then(setContributions),
    [],
  )
  const reloadCalendar = useCallback(
    () => endpoints.calendar(year, month).then(setCalendar),
    [year, month],
  )
  const reloadReminders = useCallback(() => endpoints.reminders().then(setReminders), [])
  const reloadUpcoming = useCallback(() => endpoints.upcoming(7).then(setUpcoming), [])
  const reloadFreeze = useCallback(() => endpoints.freeze().then(setFreeze), [])
  const reloadLeetCode = useCallback(
    () =>
      endpoints
        .leetcodeCached()
        .then((p) => setProfile(p && p.username ? (p as LeetCodeProfile) : null)),
    [],
  )

  // Settings that affect the whole page (open-in-new-tab).
  useEffect(() => {
    endpoints.settings().then((s) => setOpenInNewTab(s.open_in_new_tab !== 'false'))
  }, [])

  // Recalculate the calendar whenever the visible month changes.
  useEffect(() => {
    reloadCalendar()
  }, [reloadCalendar])

  // Initial load of everything else.
  useEffect(() => {
    reloadFreeze()
    reloadReminders()
    reloadUpcoming()
    reloadStats()
    reloadContributions()
    reloadProblems()
    reloadLeetCode()
  }, [
    reloadFreeze,
    reloadReminders,
    reloadUpcoming,
    reloadStats,
    reloadContributions,
    reloadProblems,
    reloadLeetCode,
  ])

  const changeMonth = useCallback((delta: number) => {
    setYm((prev) => {
      let m = prev.month + delta
      let y = prev.year
      if (m > 12) {
        m = 1
        y++
      } else if (m < 1) {
        m = 12
        y--
      }
      return { year: y, month: m }
    })
  }, [])

  const toggleFreeze = useCallback(async () => {
    setFreeze(await endpoints.toggleFreeze())
    reloadCalendar()
    reloadReminders()
    reloadUpcoming()
  }, [reloadCalendar, reloadReminders, reloadUpcoming])

  /** Move a problem's reminder to a new date (drag reschedule). */
  const reschedule = useCallback(
    async (id: number, remindDate: string) => {
      await endpoints.updateProblem(id, { remind_date: remindDate })
      reloadUpcoming()
      reloadCalendar()
    },
    [reloadUpcoming, reloadCalendar],
  )

  return {
    year,
    month,
    changeMonth,
    problems,
    stats,
    contributions,
    calendar,
    reminders,
    upcoming,
    freeze,
    profile,
    openInNewTab,
    setOpenInNewTab,
    reloadProblems,
    reloadStats,
    reloadContributions,
    reloadCalendar,
    reloadReminders,
    reloadUpcoming,
    reloadLeetCode,
    setProfile,
    toggleFreeze,
    reschedule,
  }
}

export type LandingData = ReturnType<typeof useLandingData>
