import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { LeetCodeAccount } from '../settings/LeetCodeAccount'
import { TrashList } from '../settings/TrashList'
import { endpoints } from '../../lib/endpoints'
import type { DiskUsage } from '../../types'

const LANGUAGES = [
  ['python', 'Python'],
  ['cpp', 'C++'],
  ['java', 'Java'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['csharp', 'C#'],
  ['c', 'C'],
  ['swift', 'Swift'],
  ['kotlin', 'Kotlin'],
  ['ruby', 'Ruby'],
  ['scala', 'Scala'],
  ['sql', 'SQL'],
]

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-3">
      {children}
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-border-strong'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  )
}

export function SettingsModal({
  openInNewTab,
  setOpenInNewTab,
  onClose,
  onDataChanged,
}: {
  openInNewTab: boolean
  setOpenInNewTab: (v: boolean) => void
  onClose: () => void
  onDataChanged: () => void
}) {
  const [version, setVersion] = useState('')
  const [defaultLang, setDefaultLang] = useState('python')
  const [dfrDays, setDfrDays] = useState(1)
  const [dataDir, setDataDir] = useState('')
  const [dataDirStatus, setDataDirStatus] = useState('')
  const [disk, setDisk] = useState<DiskUsage | null>(null)

  useEffect(() => {
    endpoints.settings().then((s) => {
      setDefaultLang(s.default_language || 'python')
      setDfrDays(parseInt(s.dfr_days || '1') || 1)
    })
    endpoints.config().then((c) => {
      setVersion(c.version)
      setDataDir(c.data_dir || './data')
    })
    endpoints
      .diskUsage()
      .then(setDisk)
      .catch(() => setDisk(null))
  }, [])

  function save(key: string, value: string) {
    endpoints.saveSetting(key, value)
  }

  return (
    <Modal title="Settings" onClose={onClose} className="max-w-xl">
      {version && <div className="-mt-3 mb-3 text-[11px] text-muted">v{version}</div>}

      <Row>
        <div>
          <div className="text-sm font-medium">Default Language</div>
          <div className="text-xs text-muted">Language for new code blocks</div>
        </div>
        <select
          value={defaultLang}
          onChange={(e) => {
            setDefaultLang(e.target.value)
            save('default_language', e.target.value)
          }}
          className="w-36 rounded-md border border-border bg-bg px-2 py-1 text-sm"
        >
          {LANGUAGES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Row>

      <Row>
        <div className="flex-1">
          <LeetCodeAccount onDataChanged={onDataChanged} />
        </div>
      </Row>

      <Row>
        <div>
          <div className="text-sm font-medium">Open in New Tab</div>
          <div className="text-xs text-muted">
            Open problems and new creations in a new browser tab
          </div>
        </div>
        <Toggle
          on={openInNewTab}
          onClick={() => {
            const next = !openInNewTab
            setOpenInNewTab(next)
            save('open_in_new_tab', next ? 'true' : 'false')
          }}
        />
      </Row>

      <Row>
        <div>
          <div className="text-sm font-medium">DFR Threshold</div>
          <div className="text-xs text-muted">Minimum days overdue to show in Due for Review</div>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            value={dfrDays}
            onChange={(e) => {
              const v = parseInt(e.target.value)
              if (v >= 1) {
                setDfrDays(v)
                save('dfr_days', String(v))
              }
            }}
            className="w-16 rounded-md border border-border bg-bg px-2 py-1 text-center text-sm"
          />
          <span className="text-xs text-muted">days</span>
        </div>
      </Row>

      <Row>
        <div className="flex-1">
          <div className="text-sm font-medium">Data Directory</div>
          <div className="text-xs text-muted">Where problems and settings are stored</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              value={dataDir}
              onChange={(e) => setDataDir(e.target.value)}
              className="flex-1 rounded-md border border-border bg-bg px-2 py-1 font-mono text-xs"
            />
            <button
              onClick={() => {
                setDataDir('./data')
                setDataDirStatus('Reset to default. Click Save to apply.')
              }}
              className="rounded-md border-2 border-ink bg-card px-2 py-1 text-xs hover:bg-card-hover"
            >
              Reset
            </button>
            <button
              onClick={async () => {
                if (!dataDir.trim()) return
                setDataDirStatus('Saving…')
                await endpoints.saveConfig({ data_dir: dataDir.trim() })
                setDataDirStatus('Saved. Restart the app to use the new directory.')
              }}
              className="rounded-md border-2 border-accent bg-accent/15 px-2 py-1 text-xs hover:bg-accent/25"
            >
              Save
            </button>
          </div>
          {dataDirStatus && <div className="mt-1 text-[11px] text-muted">{dataDirStatus}</div>}
        </div>
      </Row>

      <Row>
        <div>
          <div className="text-sm font-medium">Disk Usage</div>
          <div className="text-xs text-muted">Total storage used by LMS data</div>
        </div>
        <div className="text-sm text-muted">
          {disk ? (
            <>
              <strong className="text-fg">{disk.total_mb} MB</strong> ({disk.file_count} files)
            </>
          ) : (
            'Loading…'
          )}
        </div>
      </Row>

      <div className="py-3">
        <div className="text-sm font-medium">Trash</div>
        <div className="text-xs text-muted">Deleted problems are auto-removed after 7 days</div>
        <TrashList onChanged={onDataChanged} />
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={onClose}
          className="rounded-md border-2 border-ink bg-card px-3 py-1.5 text-sm hover:bg-card-hover"
        >
          Close
        </button>
      </div>
    </Modal>
  )
}
