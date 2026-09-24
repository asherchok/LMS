import { useTheme } from '../hooks/useTheme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      title="Toggle theme"
      aria-label="Toggle theme"
      className="grid h-9 w-9 place-items-center rounded-md text-lg text-muted transition-colors hover:bg-card hover:text-fg"
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}
