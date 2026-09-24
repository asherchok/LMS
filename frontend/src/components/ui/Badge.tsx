import type { Difficulty } from '../../types'

// Full class strings (no interpolation) so Tailwind's scanner keeps them.
const STYLES: Record<Difficulty, string> = {
  easy: 'text-easy border-easy bg-easy/10',
  medium: 'text-medium border-medium bg-medium/10',
  hard: 'text-hard border-hard bg-hard/10',
}

export function Badge({ difficulty, short = false }: { difficulty: Difficulty; short?: boolean }) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${STYLES[difficulty]}`}
    >
      {short ? difficulty[0].toUpperCase() : difficulty}
    </span>
  )
}
