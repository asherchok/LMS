import { useState } from 'react'
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { BlockShell } from './BlockShell'
import { useThemeVersion } from '../../../hooks/useThemeVersion'
import type { CodeBlock as CodeBlockT } from '../../../types'

const LANGS: [string, string][] = [
  ['python', 'python'],
  ['cpp', 'C++'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['java', 'java'],
  ['c', 'c'],
  ['csharp', 'C#'],
  ['go', 'go'],
  ['rust', 'rust'],
  ['ruby', 'ruby'],
  ['swift', 'swift'],
  ['kotlin', 'kotlin'],
  ['scala', 'scala'],
  ['sql', 'sql'],
  ['shell', 'shell'],
  ['plaintext', 'plaintext'],
]

const defineThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('lms-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#282828',
      'editor.lineHighlightBackground': '#303030',
      'editorGutter.background': '#232323',
    },
  })
  monaco.editor.defineTheme('lms-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#faf6f0',
      'editor.lineHighlightBackground': '#f0ebe2',
      'editorGutter.background': '#f5f0e8',
    },
  })
}

export function CodeBlock({
  block,
  onChange,
  onRemove,
  handleProps,
}: {
  block: CodeBlockT
  onChange: (patch: Partial<CodeBlockT>) => void
  onRemove: () => void
  handleProps?: React.HTMLAttributes<HTMLSpanElement> & { draggable?: boolean }
}) {
  const theme = useThemeVersion()
  const [height, setHeight] = useState(120)

  const onMount: OnMount = (ed) => {
    const update = () => setHeight(Math.min(600, Math.max(80, ed.getContentHeight())))
    update()
    ed.onDidContentSizeChange(update)
  }

  const options: editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
    lineNumbers: 'on',
    automaticLayout: true,
    tabSize: 4,
    wordWrap: 'on',
    padding: { top: 8, bottom: 8 },
  }

  return (
    <BlockShell
      label="Code"
      onRemove={onRemove}
      handleProps={handleProps}
      extra={
        <select
          value={block.language}
          onChange={(e) => onChange({ language: e.target.value })}
          className="rounded border border-border bg-bg px-1 py-0.5 text-xs"
        >
          {LANGS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      }
    >
      <Editor
        height={height}
        language={block.language}
        theme={theme === 'light' ? 'lms-light' : 'lms-dark'}
        value={block.content}
        beforeMount={defineThemes}
        onMount={onMount}
        onChange={(v) => onChange({ content: v ?? '' })}
        options={options}
      />
    </BlockShell>
  )
}
