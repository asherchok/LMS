import { Link } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  /** Page-specific actions rendered on the right side of the header. */
  actions?: React.ReactNode
}

export function Header({ actions }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b-2 border-ink bg-bg/95 px-4 py-3 backdrop-blur sm:px-6">
      <Link to="/" className="flex items-center gap-2 text-fg no-underline">
        <img
          src="/favicon.png"
          width={24}
          height={24}
          alt=""
          className="rounded-full"
        />
        <h1 className="text-base font-bold sm:text-lg">
          <span className="hidden sm:inline">LeetCode Management System</span>
          <span className="sm:hidden">LMS</span>
        </h1>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {actions}
      </div>
    </header>
  )
}
