import { useState } from 'react'
import { Header } from '../components/Header'
import { Sidebar } from '../components/landing/Sidebar'
import { Calendar } from '../components/landing/Calendar'
import { StatsRow } from '../components/landing/StatsRow'
import { Topics } from '../components/landing/Topics'
import { ContributionGraph } from '../components/landing/ContributionGraph'
import { LeetCodePanel } from '../components/landing/LeetCodePanel'
import { NewProblemModal } from '../components/modals/NewProblemModal'
import { SettingsModal } from '../components/modals/SettingsModal'
import { FreezeModal } from '../components/modals/FreezeModal'
import { useLandingData } from '../hooks/useLandingData'
import { endpoints } from '../lib/endpoints'

export default function Landing() {
  const d = useLandingData()
  const [filters, setFilters] = useState<string[]>([])
  const [modal, setModal] = useState<'new' | 'settings' | 'freeze' | null>(null)
  const [syncing, setSyncing] = useState(false)

  const toggleFilter = (tag: string) =>
    setFilters((f) => (f.includes(tag) ? f.filter((t) => t !== tag) : [...f, tag]))

  async function sync() {
    setSyncing(true)
    try {
      const res = await endpoints.leetcodeSync()
      d.setProfile(res.profile)
      d.reloadCalendar()
      d.reloadStats()
      d.reloadContributions()
      d.reloadProblems()
    } catch {
      /* surfaced elsewhere; keep the page responsive */
    } finally {
      setSyncing(false)
    }
  }

  function reloadAll() {
    d.reloadProblems()
    d.reloadStats()
    d.reloadCalendar()
    d.reloadContributions()
    d.reloadReminders()
    d.reloadUpcoming()
  }

  const headerBtn =
    'rounded-md border-2 border-ink bg-card px-3 py-1.5 text-sm text-fg transition-colors hover:bg-card-hover'

  return (
    <div className="min-h-screen">
      <Header
        actions={
          <>
            <button
              onClick={() => setModal('freeze')}
              title={d.freeze.frozen ? 'Resume revisions' : 'Freeze revisions'}
              className={`${headerBtn} ${d.freeze.frozen ? 'border-accent text-accent' : ''}`}
            >
              {d.freeze.frozen ? '▶' : '❚❚'}
            </button>
            <button onClick={() => setModal('settings')} title="Settings" className={headerBtn}>
              ⚙
            </button>
            <button
              onClick={() => setModal('new')}
              className="rounded-md border-2 border-accent bg-accent/15 px-3 py-1.5 text-sm font-medium text-fg hover:bg-accent/25"
            >
              + New Problem
            </button>
          </>
        }
      />

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[340px_1fr]">
        <div className="order-2 lg:order-1">
          <Sidebar
            reminders={d.reminders}
            upcoming={d.upcoming}
            problems={d.problems}
            activeFilters={filters}
            openInNewTab={d.openInNewTab}
            freeze={d.freeze}
            onRemoveFilter={(t) => setFilters((f) => f.filter((x) => x !== t))}
            onClearFilters={() => setFilters([])}
            onReschedule={d.reschedule}
          />
        </div>

        <main className="order-1 min-w-0 lg:order-2">
          <Calendar
            year={d.year}
            month={d.month}
            data={d.calendar}
            problems={d.problems}
            activeFilters={filters}
            freeze={d.freeze}
            openInNewTab={d.openInNewTab}
            onChangeMonth={d.changeMonth}
            onReschedule={d.reschedule}
          />
          <LeetCodePanel profile={d.profile} onSync={sync} syncing={syncing} />
          <StatsRow stats={d.stats} />
          <Topics
            tagCounts={d.stats?.tag_counts ?? {}}
            activeFilters={filters}
            onToggle={toggleFilter}
            onReset={() => setFilters([])}
          />
          <ContributionGraph data={d.contributions} />
        </main>
      </div>

      {modal === 'new' && (
        <NewProblemModal
          openInNewTab={d.openInNewTab}
          onClose={() => setModal(null)}
          onCreated={d.reloadProblems}
        />
      )}
      {modal === 'settings' && (
        <SettingsModal
          openInNewTab={d.openInNewTab}
          setOpenInNewTab={d.setOpenInNewTab}
          onClose={() => setModal(null)}
          onDataChanged={reloadAll}
        />
      )}
      {modal === 'freeze' && (
        <FreezeModal
          freeze={d.freeze}
          onClose={() => setModal(null)}
          onConfirm={() => {
            d.toggleFreeze()
            setModal(null)
          }}
        />
      )}
    </div>
  )
}
