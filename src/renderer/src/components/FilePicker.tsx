import { useEffect, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Plus, Upload, X } from 'lucide-react'
import type { ToolDef } from '../lib/tools'
import { ACCEPT_FILTERS } from '../lib/tools'
import { fileToWorkFile, formatBytes, kindOf, type WorkFile } from '../lib/files'
import { renderFirstPage } from '../lib/pdf'
import { Button } from './ui'

const ACCEPT_ATTR: Record<string, string> = {
  pdf: '.pdf,application/pdf',
  image: '.jpg,.jpeg,.png,.webp,.bmp,.gif,.tif,.tiff,image/*',
  office: '.docx,.xlsx,.pptx',
  html: '.html,.htm,text/html'
}

export function FileThumb({
  file,
  size = 'md'
}: {
  file: WorkFile
  size?: 'sm' | 'md' | 'lg'
}): React.JSX.Element {
  const [preview, setPreview] = useState<string | null>(file.previewUrl ?? null)
  useEffect(() => {
    let alive = true
    if (file.kind === 'pdf' && !preview) {
      void renderFirstPage(file.bytes, 180).then((url) => {
        if (alive && url) setPreview(url)
      })
    }
    if (file.kind === 'image' && !preview) {
      const blob = new Blob([new Uint8Array(file.bytes).buffer])
      const url = URL.createObjectURL(blob)
      setPreview(url)
      return () => {
        alive = false
        URL.revokeObjectURL(url)
      }
    }
    return () => {
      alive = false
    }
  }, [file, preview])

  if (preview) {
    return (
      <div className={`file-thumb file-thumb-${size}`}>
        <img src={preview} alt="" />
      </div>
    )
  }
  return (
    <div className={`file-thumb file-thumb-${size} file-thumb-fallback`}>
      {file.kind === 'image' ? <ImageIcon size={20} /> : <FileText size={20} />}
    </div>
  )
}

export function DropZone({
  tool,
  onFiles,
  onError,
  compact,
  label
}: {
  tool: ToolDef
  onFiles: (files: WorkFile[]) => void
  onError?: (message: string) => void
  compact?: boolean
  label?: string
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const accept = ACCEPT_ATTR[tool.accepts[0]] || '.pdf'
  const filters = tool.accepts.flatMap((kind) => ACCEPT_FILTERS[kind] || [])

  const handleBrowser = async (): Promise<void> => {
    try {
      setBusy(true)
      const opened = await window.desktop.openFiles({
        title: `选择${tool.title}文件`,
        filters,
        multiple: tool.multiple
      })
      if (opened.length) {
        onFiles(
          opened.map((item) => ({
            id: `f_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: item.name,
            size: item.size,
            bytes: new Uint8Array(item.data),
            path: item.path,
            kind: kindOf(item.name)
          }))
        )
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : '文件打开失败')
    } finally {
      setBusy(false)
    }
  }

  const handleDrop = async (event: React.DragEvent): Promise<void> => {
    event.preventDefault()
    setDragging(false)
    const dropped = [...event.dataTransfer.files]
    if (!dropped.length) return
    const allowed = dropped.filter((file) => (tool.accepts as string[]).includes(kindOf(file.name)))
    if (!allowed.length) {
      onError?.(`这里需要${tool.accepts.includes('pdf') ? ' PDF' : tool.accepts.includes('image') ? '图片' : '支持的文档'}文件`)
      return
    }
    if (!tool.multiple && allowed.length > 1) {
      onFiles([await fileToWorkFile(allowed[0])])
      onError?.('这个工具一次处理一份文件，已选择第一份')
      return
    }
    onFiles(await Promise.all(allowed.map(fileToWorkFile)))
  }

  return (
    <div
      className={`dropzone ${compact ? 'dropzone-compact' : ''} ${dragging ? 'is-dragging' : ''}`}
      onDragEnter={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => void handleDrop(e)}
      onClick={() => void handleBrowser()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') void handleBrowser()
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={tool.multiple}
        hidden
        onChange={async (e) => {
          const list = [...(e.target.files ?? [])]
          if (list.length) onFiles(await Promise.all(list.map(fileToWorkFile)))
          e.target.value = ''
        }}
      />
      <div className="dropzone-illustration">
        <Upload size={21} strokeWidth={1.6} />
      </div>
      <div className="dropzone-copy">
        <strong>{label ?? (dragging ? '松开即可放入' : '拖入文件，或点击选择')}</strong>
        <span>
          {tool.accepts.includes('pdf') && '支持 PDF'}
          {tool.accepts.includes('image') && '支持 JPG、PNG、WebP 等图片'}
          {tool.accepts.includes('office') && '支持 DOCX、XLSX、PPTX'}
          {tool.accepts.includes('html') && '支持 HTML 文件'}
          {' · 文件不会离开这台电脑'}
        </span>
      </div>
      <Button variant="soft" size="sm" loading={busy} icon={<Plus size={15} />}>
        选择文件
      </Button>
    </div>
  )
}

export function SelectedFiles({
  files,
  onRemove,
  onAdd,
  tool,
  disabled,
  extra,
  onMove
}: {
  files: WorkFile[]
  onRemove: (id: string) => void
  onAdd?: () => void
  tool: ToolDef
  disabled?: boolean
  extra?: React.ReactNode
  onMove?: (id: string, direction: -1 | 1) => void
}): React.JSX.Element {
  if (!files.length) return <></>
  return (
    <div className="selected-files">
      <div className="selected-files-head">
        <span>
          已选择 <strong>{files.length}</strong> 个文件
        </span>
        {onAdd && tool.multiple && (
          <button type="button" className="text-action" onClick={onAdd} disabled={disabled}>
            <Plus size={14} />
            继续添加
          </button>
        )}
      </div>
      {files.map((file, index) => (
        <div className="file-row" key={file.id}>
          <span className="file-index">{String(index + 1).padStart(2, '0')}</span>
          <FileThumb file={file} size="sm" />
          <div className="file-row-copy">
            <span className="file-row-name" title={file.name}>
              {file.name}
            </span>
            <span className="file-row-meta">
              {file.pageCount ? `${file.pageCount} 页 · ` : ''}
              {formatBytes(file.size)}
              {file.kind === 'image' ? ' · 图片' : ''}
            </span>
          </div>
          {extra}
          {onMove && !disabled && (
            <div className="file-move">
              <button
                type="button"
                title="上移"
                aria-label="上移"
                disabled={index === 0}
                onClick={() => onMove(file.id, -1)}
              >
                <span className="chevron-up" />
              </button>
              <button
                type="button"
                title="下移"
                aria-label="下移"
                disabled={index === files.length - 1}
                onClick={() => onMove(file.id, 1)}
              >
                <span className="chevron-down" />
              </button>
            </div>
          )}
          {!disabled && (
            <button
              type="button"
              className="file-remove"
              onClick={() => onRemove(file.id)}
              aria-label={`移除 ${file.name}`}
              title="移除"
            >
              <X size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
