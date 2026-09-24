import { useEffect } from 'react'

interface ModalProps {
  title?: string
  onClose: () => void
  children: React.ReactNode
  /** Extra classes for the modal card (e.g. width). */
  className?: string
}

/** Centered modal over a dimmed backdrop. Closes on backdrop click or Escape. */
export function Modal({ title, onClose, children, className = '' }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`my-8 w-full max-w-lg rounded-xl border-2 border-ink bg-card p-5 shadow-xl ${className}`}
      >
        {title && <h2 className="mb-4 text-lg font-bold">{title}</h2>}
        {children}
      </div>
    </div>
  )
}
