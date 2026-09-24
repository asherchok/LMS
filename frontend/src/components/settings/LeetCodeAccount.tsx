import { useEffect, useState } from 'react'
import { endpoints } from '../../lib/endpoints'

type Status = { msg: string; color: string } | null

export function LeetCodeAccount({ onDataChanged }: { onDataChanged: () => void }) {
  const [loggedIn, setLoggedIn] = useState(false)
  const [expired, setExpired] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [session, setSession] = useState('')
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    const a = await endpoints.leetcodeAuth()
    setLoggedIn(!!a.logged_in)
    setExpired(!!a.logged_in && a.valid === false)
    setUsername(a.username ?? null)
  }
  useEffect(() => {
    refresh()
  }, [])

  async function login() {
    if (!session.trim()) {
      setStatus({ msg: 'Paste your LEETCODE_SESSION cookie.', color: 'text-hard' })
      return
    }
    setStatus({ msg: 'Verifying…', color: 'text-muted' })
    try {
      const data = await endpoints.leetcodeLogin(session.trim(), '')
      setSession('')
      setStatus({
        msg: `Logged in as ${data.username}. Click "Import solved problems".`,
        color: 'text-easy',
      })
      await refresh()
    } catch (e) {
      setStatus({ msg: (e as Error).message || 'Login failed', color: 'text-hard' })
    }
  }

  async function logout() {
    await endpoints.leetcodeLogout()
    setStatus({ msg: 'Logged out.', color: 'text-muted' })
    await refresh()
  }

  async function backfill() {
    setBusy(true)
    setStatus({ msg: 'Importing your solved problems…', color: 'text-muted' })
    try {
      const d = await endpoints.leetcodeBackfill()
      setStatus({
        msg: `Imported ${d.created} new (${d.skipped} already tracked, ${d.solved_total} solved total).`,
        color: 'text-easy',
      })
      onDataChanged()
    } catch (e) {
      setStatus({ msg: (e as Error).message || 'Import failed', color: 'text-hard' })
    } finally {
      setBusy(false)
    }
  }

  const showForm = !loggedIn || expired

  return (
    <div>
      <div className="text-sm font-medium">
        LeetCode Account{' '}
        <span className="font-normal text-muted">
          {expired
            ? '— session expired, log in again'
            : loggedIn
              ? `— logged in${username ? ' as ' + username : ''}`
              : '— not logged in'}
        </span>
      </div>
      <div className="text-xs text-muted">
        Import <b>all</b> your solved problems. Stored locally.
      </div>

      {showForm ? (
        <div className="mt-2">
          <details className="mb-2 rounded-md border border-border bg-card p-2 text-xs">
            <summary className="cursor-pointer font-medium text-muted">
              Where do I find these?
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted">
              <li>
                Log in to{' '}
                <a
                  href="https://leetcode.com"
                  target="_blank"
                  rel="noopener"
                  className="text-medium"
                >
                  leetcode.com
                </a>{' '}
                in this browser.
              </li>
              <li>
                Open DevTools → <b>Application</b> tab (<b>Storage</b> in Firefox).
              </li>
              <li>
                <b>Cookies</b> → <code className="rounded bg-bg px-1">leetcode.com</code>.
              </li>
              <li>
                Copy the <code className="rounded bg-bg px-1">LEETCODE_SESSION</code> value → paste
                below.
              </li>
            </ol>
            <div className="mt-2 text-[11px] text-subtle">
              🔒 Treat it like a password. Re-paste if login expires.
            </div>
          </details>
          <input
            type="password"
            autoComplete="off"
            value={session}
            onChange={(e) => setSession(e.target.value)}
            placeholder="Paste LEETCODE_SESSION value here"
            className="mb-1.5 w-full rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
          />
          <button
            onClick={login}
            className="rounded-md border-2 border-accent bg-accent/15 px-2.5 py-1 text-xs font-medium hover:bg-accent/25"
          >
            Verify &amp; Log in
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={backfill}
            disabled={busy}
            className="rounded-md border-2 border-accent bg-accent/15 px-2.5 py-1 text-xs font-medium hover:bg-accent/25 disabled:opacity-50"
          >
            Import solved problems
          </button>
          <button
            onClick={logout}
            className="rounded-md border-2 border-ink bg-card px-2.5 py-1 text-xs hover:bg-card-hover"
          >
            Log out
          </button>
        </div>
      )}
      {status && <div className={`mt-1 text-[11px] ${status.color}`}>{status.msg}</div>}
    </div>
  )
}
