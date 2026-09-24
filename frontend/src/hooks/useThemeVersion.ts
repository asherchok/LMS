import { useEffect, useState } from 'react'

/** Returns the current theme ('light' | 'dark'), updating whenever the
 *  <html data-theme> attribute changes — so imperative libraries (Monaco,
 *  mermaid) can re-theme even though they live outside React state. */
export function useThemeVersion(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
  )
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return theme
}
