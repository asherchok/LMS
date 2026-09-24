import { useEffect, useRef } from 'react'
import renderMathInElement from 'katex/contrib/auto-render'
import 'katex/dist/katex.min.css'
import { markdownToHtml, currentMermaidTheme } from '../../lib/markdown'
import { useThemeVersion } from '../../hooks/useThemeVersion'

const KATEX_DELIMS = [
  { left: '$$', right: '$$', display: true },
  { left: '$', right: '$', display: false },
]

/** Renders markdown with KaTeX math and mermaid diagrams. Re-runs when the
 *  source or the app theme changes (mermaid needs re-theming). */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const themeVersion = useThemeVersion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = markdownToHtml(source)

    try {
      renderMathInElement(el, { delimiters: KATEX_DELIMS, throwOnError: false })
    } catch {
      /* malformed math — leave as-is */
    }

    const mermaidNodes = el.querySelectorAll<HTMLElement>('.mermaid')
    if (mermaidNodes.length) {
      // Reset any prior render so a re-theme redraws cleanly.
      mermaidNodes.forEach((n) => {
        n.removeAttribute('data-processed')
        n.textContent = n.getAttribute('data-mermaid-src') || n.textContent
      })
      import('mermaid').then(({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, theme: currentMermaidTheme() })
        mermaid.run({ nodes: mermaidNodes }).catch(() => {})
      })
    }
  }, [source, themeVersion])

  return <div ref={ref} className={className} />
}
