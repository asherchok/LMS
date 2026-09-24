import { marked } from 'marked'
import DOMPurify from 'dompurify'

/** marked → sanitized HTML, with ```mermaid fences turned into <div class="mermaid">
 *  so mermaid.run() can pick them up after mount. */
export function markdownToHtml(text: string): string {
  if (!text) return ''
  const raw = marked.parse(text, { async: false }) as string

  const tmp = document.createElement('div')
  tmp.innerHTML = raw
  tmp.querySelectorAll('code.language-mermaid').forEach((code) => {
    const div = document.createElement('div')
    div.className = 'mermaid'
    const src = code.textContent || ''
    div.textContent = src
    div.setAttribute('data-mermaid-src', src)
    ;(code.parentElement ?? code).replaceWith(div)
  })

  return DOMPurify.sanitize(tmp.innerHTML, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'target', 'style', 'data-mermaid-src'],
  })
}

export function currentMermaidTheme(): 'default' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'dark'
}
