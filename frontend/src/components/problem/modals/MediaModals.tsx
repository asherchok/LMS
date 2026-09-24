import { useRef, useState } from 'react'
import { Modal } from '../../ui/Modal'
import { endpoints } from '../../../lib/endpoints'
import type { Block } from '../../../types'

function DropZone({ accept, onFile }: { accept: string; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(false)
  return (
    <div
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setActive(true)
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault()
        setActive(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
      className={`cursor-pointer rounded-md border-2 border-dashed p-6 text-center text-sm ${
        active ? 'border-accent bg-accent/5' : 'border-border text-muted'
      }`}
    >
      Drag &amp; drop here, or click to browse
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </div>
  )
}

const field = 'flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm outline-none'
const insertBtn =
  'rounded-md border-2 border-accent bg-accent/15 px-3 py-1.5 text-sm hover:bg-accent/25'

export function ImageModal({
  onClose,
  onInsert,
}: {
  onClose: () => void
  onInsert: (b: Block) => void
}) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('')

  async function upload(f: File) {
    setStatus('Uploading…')
    const { url: uploaded } = await endpoints.uploadFile(f)
    if (uploaded) onInsert({ type: 'image', src: uploaded, caption: '' })
    else setStatus('Upload failed')
  }

  return (
    <Modal title="Insert Image" onClose={onClose} className="max-w-md">
      <div className="flex gap-2">
        <input
          className={field}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
        <button
          className={insertBtn}
          onClick={() => url.trim() && onInsert({ type: 'image', src: url.trim(), caption: '' })}
        >
          Insert
        </button>
      </div>
      <div className="my-3 text-center text-xs text-subtle">or upload</div>
      <DropZone accept="image/*" onFile={upload} />
      {status && <div className="mt-2 text-xs text-muted">{status}</div>}
    </Modal>
  )
}

export function VideoModal({
  onClose,
  onInsert,
}: {
  onClose: () => void
  onInsert: (b: Block) => void
}) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('')

  async function insertUrl() {
    if (!url.trim()) return
    setStatus('Fetching preview…')
    try {
      const data = await endpoints.videoThumbnail(url.trim())
      onInsert({
        type: 'video',
        src: url.trim(),
        source_type: data.type || 'url',
        video_id: data.video_id,
        thumbnail: data.thumbnail,
      })
    } catch {
      setStatus('Failed to fetch preview')
    }
  }

  async function upload(f: File) {
    setStatus('Uploading…')
    const { url: uploaded } = await endpoints.uploadFile(f)
    if (uploaded)
      onInsert({
        type: 'video',
        src: uploaded,
        source_type: 'upload',
        video_id: null,
        thumbnail: null,
      })
    else setStatus('Upload failed')
  }

  return (
    <Modal title="Insert Video" onClose={onClose} className="max-w-md">
      <p className="mb-3 text-xs text-muted">
        Paste a YouTube or video URL. The preview image is fetched and cached locally.
      </p>
      <div className="flex gap-2">
        <input
          className={field}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
        />
        <button className={insertBtn} onClick={insertUrl}>
          Insert
        </button>
      </div>
      <div className="my-3 text-center text-xs text-subtle">or upload a video file</div>
      <DropZone accept="video/*" onFile={upload} />
      {status && <div className="mt-2 text-xs text-muted">{status}</div>}
    </Modal>
  )
}
