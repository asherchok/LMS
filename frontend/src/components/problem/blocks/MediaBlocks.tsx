import { BlockShell } from './BlockShell'
import type { ImageBlock as ImageBlockT, VideoBlock as VideoBlockT } from '../../../types'

interface GripProps {
  onGripDown?: () => void
  onGripUp?: () => void
}

export function ImageBlock({
  block,
  onRemove,
  onGripDown,
  onGripUp,
}: {
  block: ImageBlockT
  onRemove: () => void
} & GripProps) {
  return (
    <BlockShell label="Image" onRemove={onRemove} onGripDown={onGripDown} onGripUp={onGripUp}>
      <div className="p-2">
        <img src={block.src} alt={block.caption || ''} className="mx-auto max-h-[480px] rounded" />
      </div>
    </BlockShell>
  )
}

export function VideoBlock({
  block,
  onRemove,
  onGripDown,
  onGripUp,
}: {
  block: VideoBlockT
  onRemove: () => void
} & GripProps) {
  return (
    <BlockShell label="Video" onRemove={onRemove} onGripDown={onGripDown} onGripUp={onGripUp}>
      <div className="p-2">
        {block.source_type === 'youtube' && block.video_id ? (
          <div className="relative aspect-video">
            <iframe
              className="absolute inset-0 h-full w-full rounded"
              src={`https://www.youtube.com/embed/${block.video_id}`}
              allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : block.source_type === 'upload' ? (
          <video controls src={block.src} className="mx-auto max-h-[480px] rounded" />
        ) : (
          <a
            href={block.src}
            target="_blank"
            rel="noopener"
            className="block rounded border border-border p-3 text-center text-sm text-medium hover:bg-card-hover"
          >
            {block.thumbnail && (
              <img src={block.thumbnail} alt="" className="mx-auto mb-2 max-h-60 rounded" />
            )}
            Open video ↗
          </a>
        )}
      </div>
    </BlockShell>
  )
}
