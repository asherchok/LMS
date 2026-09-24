import { useEffect, useState } from 'react'
import { Header } from '../components/Header'
import { api, type AppConfig } from '../lib/api'

/** Placeholder landing page. Phase 1 replaces the body with the real calendar,
 *  sidebar, stats, and panels. For now it verifies the theme + API proxy. */
export default function Landing() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<AppConfig>('/api/config')
      .then(setConfig)
      .catch((e) => setApiError(e.message))
  }, [])

  return (
    <div className="min-h-screen">
      <Header
        actions={
          <button className="rounded-md border-2 border-ink bg-card px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-card-hover">
            + New Problem
          </button>
        }
      />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h2 className="text-2xl font-bold">Phase 0 shell</h2>
        <p className="mt-2 text-muted">
          React + Vite + TypeScript + Tailwind is live. Theme toggle and the API proxy both work.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Full class names (no interpolation) so Tailwind's scanner keeps them. */}
          {[
            { label: 'easy', color: 'text-easy' },
            { label: 'medium', color: 'text-medium' },
            { label: 'hard', color: 'text-hard' },
          ].map((d) => (
            <div key={d.label} className="rounded-lg border-2 border-ink bg-card p-4 text-center">
              <div className={`text-3xl font-bold ${d.color}`}>—</div>
              <div className="mt-1 text-xs uppercase tracking-wide text-muted">{d.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-border bg-card p-4 text-sm">
          <div className="font-medium text-fg">Backend health check</div>
          {config ? (
            <p className="mt-1 text-easy">Connected to Flask API — v{config.version}</p>
          ) : apiError ? (
            <p className="mt-1 text-hard">API unreachable ({apiError}). Start Flask on :5001.</p>
          ) : (
            <p className="mt-1 text-muted">Checking…</p>
          )}
        </div>
      </main>
    </div>
  )
}
