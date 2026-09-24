import { Link, useParams } from 'react-router-dom'
import { Header } from '../components/Header'

/** Placeholder problem page. Phase 2 replaces the body with the split-pane
 *  editor (description, tabs, Monaco blocks, import, etc.). */
export default function Problem() {
  const { id } = useParams()
  return (
    <div className="min-h-screen">
      <Header
        actions={
          <Link
            to="/"
            className="rounded-md border-2 border-ink bg-card px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-card-hover"
          >
            ← Back
          </Link>
        }
      />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h2 className="text-2xl font-bold">Problem #{id}</h2>
        <p className="mt-2 text-muted">Phase 2 will render the editor here.</p>
      </main>
    </div>
  )
}
