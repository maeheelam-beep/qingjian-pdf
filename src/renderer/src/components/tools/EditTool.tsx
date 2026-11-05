import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  MousePointer2,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  X
} from 'lucide-react'
import type { WorkFile } from '../../lib/files'
import { formatBytes, kindOf } from '../../lib/files'
import type { ToolDef } from '../../lib/tools'
import type { OverlayItem } from '../../lib/pdfOps'
import { applyOverlays } from '../../lib/pdfOps'
import { getPdfPageCount, loadPdfJs, renderPdfPage } from '../../lib/pdf'
import type { RunTask } from '../ToolPage'
import { DropZone } from '../FilePicker'
import { BlobImage } from '../BlobImage'
import { Button, NumberStepper, SectionTitle } from '../ui'

type DragState =
  | { mode: 'move'; id: string; startX: number; startY: number; x: number; y: number }
  | { mode: 'resize'; id: string; startX: number; startY: number; w: number; h: number }
  | null

let itemSequence = 0

export function EditTool({
  tool,
  initialFiles,
  run,
  notify
}: {
  tool: ToolDef
  initialFiles?: WorkFile[]
  run: RunTask
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void
}): React.JSX.Element {
  const [file, setFile] = useState<WorkFile | null>(initialFiles?.[0] ?? null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 })
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<OverlayItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewWidth, setPreviewWidth] = useState(520)
  const [history, setHistory] = useState<OverlayItem[][]>([])
  const dragRef = useRef<DragState>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const selected = items.find((item) => item.id === selectedId && item.page === page) ?? null

  useEffect(() => {
    if (!file) return
    void getPdfPageCount(file.bytes)
      .then((count) => {
        setTotal(count)
        setFile((current) => (current ? { ...current, pageCount: count } : current))
      })
      .catch((error) => notify(error instanceof Error ? error.message : '无法读取 PDF', 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id])

  useEffect(() => {
    if (!file) return
    let alive = true
    void (async () => {
      setLoading(true)
      try {
        const doc = await loadPdfJs(file.bytes)
        const pdfPage = await doc.getPage(page + 1)
        const size = pdfPage.getViewport({ scale: 1 })
        if (!alive) return
        setPageSize({ width: size.width, height: size.height })
        const image = await renderPdfPage(doc, page + 1, { maxWidth: 620 })
        if (!alive) return
        setPreview(image.dataUrl)
        await doc.destroy()
      } catch (error) {
        if (alive) notify(error instanceof Error ? error.message : '无法渲染页面', 'error')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id, page])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setPreviewWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [preview])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault()
        removeItem(selectedId)
      }
      if (event.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const captureHistory = (): void => {
    setHistory((current) => [...current.slice(-19), items])
  }

  const addItem = (kind: 'text' | 'whiteout'): void => {
    if (!file) return
    captureHistory()
    itemSequence += 1
    const item: OverlayItem = {
      id: `item_${Date.now()}_${itemSequence}`,
      kind,
      page,
      x: kind === 'text' ? 0.18 : 0.3,
      y: kind === 'text' ? 0.3 : 0.45,
      w: kind === 'text' ? 0.46 : 0.3,
      h: kind === 'text' ? 0.08 : 0.1,
      text: kind === 'text' ? '在这里输入文字' : undefined,
      fontSize: 18,
      color: '#203027',
      opacity: 1
    }
    setItems((current) => [...current, item])
    setSelectedId(item.id)
  }

  const addImage = async (): Promise<void> => {
    if (!file) return
    const opened = await window.desktop.openFiles({
      title: '选择图片',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      multiple: false
    })
    if (!opened.length) return
    const item = opened[0]
    const bytes = new Uint8Array(item.data)
    let ratio = 0.6
    try {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes).buffer]))
      ratio = bitmap.width / bitmap.height
      bitmap.close()
    } catch {
      /* use default ratio */
    }
    captureHistory()
    itemSequence += 1
    const width = 0.32
    const height = Math.min(0.6, ((width * pageSize.width) / ratio) / pageSize.height)
    const overlay: OverlayItem = {
      id: `item_${Date.now()}_${itemSequence}`,
      kind: 'image',
      page,
      x: 0.34,
      y: 0.34,
      w: width,
      h: height,
      imageBytes: bytes,
      imageName: item.name,
      opacity: 1
    }
    setItems((current) => [...current, overlay])
    setSelectedId(overlay.id)
  }

  const updateItem = useCallback((id: string, patch: Partial<OverlayItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const removeItem = (id: string): void => {
    captureHistory()
    setItems((current) => current.filter((item) => item.id !== id))
    setSelectedId(null)
  }

  const undo = (): void => {
    const previous = history[history.length - 1]
    if (!previous) return
    setItems(previous)
    setHistory((current) => current.slice(0, -1))
    setSelectedId(null)
  }

  const onCanvasPointerDown = (): void => {
    setSelectedId(null)
  }

  const onItemPointerDown = (event: React.PointerEvent, item: OverlayItem): void => {
    event.stopPropagation()
    setSelectedId(item.id)
    dragRef.current = {
      mode: 'move',
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      x: item.x,
      y: item.y
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const onResizePointerDown = (event: React.PointerEvent, item: OverlayItem): void => {
    event.stopPropagation()
    setSelectedId(item.id)
    dragRef.current = {
      mode: 'resize',
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      w: item.w,
      h: item.h
    }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent): void => {
    const drag = dragRef.current
    if (!drag || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const dx = (event.clientX - drag.startX) / rect.width
    const dy = (event.clientY - drag.startY) / rect.height
    if (drag.mode === 'move') {
      updateItem(drag.id, {
        x: Math.max(0, Math.min(0.96, drag.x + dx)),
        y: Math.max(0, Math.min(0.96, drag.y + dy))
      })
    } else {
      updateItem(drag.id, {
        w: Math.max(0.04, Math.min(0.96 - (selected?.x ?? 0), drag.w + dx)),
        h: Math.max(0.025, Math.min(0.96 - (selected?.y ?? 0), drag.h + dy))
      })
    }
  }

  const onPointerUp = (): void => {
    dragRef.current = null
  }

  const setFileFromDrop = async (incoming: WorkFile[]): Promise<void> => {
    const candidate = incoming[0]
    if (!candidate) return
    if (candidate.kind !== 'pdf') {
      notify('请选择一个 PDF 文件', 'error')
      return
    }
    setFile(candidate)
    setItems([])
    setPage(0)
    setPreview(null)
  }

  const pickFile = async (): Promise<void> => {
    const opened = await window.desktop.openFiles({
      title: '选择 PDF 文件',
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      multiple: false
    })
    if (!opened.length) return
    const item = opened[0]
    await setFileFromDrop([
      {
        id: `f_${Date.now()}`,
        name: item.name,
        size: item.size,
        bytes: new Uint8Array(item.data),
        path: item.path,
        kind: kindOf(item.name)
      }
    ])
  }

  const start = async (): Promise<void> => {
    if (!file) {
      notify('请先选择 PDF 文件', 'error')
      return
    }
    const relevant = items.filter((item) => item.text?.trim() || item.kind !== 'text')
    if (!relevant.length) {
      notify('还没有添加任何编辑内容', 'error')
      return
    }
    await run((progress) => applyOverlays(file, relevant, progress), file.name)
  }

  return (
    <div className="generic-layout edit-layout">
      <div className="tool-main">
        <section className="panel">
          <SectionTitle hint={file ? '在页面上添加内容' : '支持单个 PDF'}>
            <span className="step-number">01</span> 选择文件
          </SectionTitle>
          {!file ? (
            <DropZone tool={tool} onFiles={(incoming) => void setFileFromDrop(incoming)} onError={notify} />
          ) : (
            <div className="organize-summary-bar">
              <div>
                <strong>{file.name}</strong>
                <span>
                  {total} 页 · {formatBytes(file.size)}
                </span>
              </div>
              <button type="button" className="text-action" onClick={() => void pickFile()}>
                更换文件
              </button>
            </div>
          )}
        </section>

        {file && (
          <section className="panel edit-panel">
            <div className="edit-toolbar">
              <div className="edit-tools">
                <button type="button" className="edit-tool" onClick={() => addItem('text')}>
                  <Type size={15} /> 添加文字
                </button>
                <button type="button" className="edit-tool" onClick={() => void addImage()}>
                  <ImagePlus size={15} /> 添加图片
                </button>
                <button type="button" className="edit-tool" onClick={() => addItem('whiteout')}>
                  <Square size={15} /> 白色遮盖
                </button>
              </div>
              <div className="edit-actions">
                <button type="button" className="edit-icon-btn" disabled={!history.length} onClick={undo} title="撤销">
                  <Undo2 size={15} />
                </button>
                <span className="edit-page-indicator">
                  第 {page + 1} / {total} 页
                </span>
                <button
                  type="button"
                  className="edit-icon-btn"
                  disabled={page <= 0}
                  onClick={() => {
                    setPage((p) => Math.max(0, p - 1))
                    setSelectedId(null)
                  }}
                  title="上一页"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  className="edit-icon-btn"
                  disabled={page >= total - 1}
                  onClick={() => {
                    setPage((p) => Math.min(total - 1, p + 1))
                    setSelectedId(null)
                  }}
                  title="下一页"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div className="edit-workspace">
              <div className="edit-canvas-column">
                <div className="edit-canvas-frame">
                  {loading && (
                    <div className="edit-loading">
                      <Loader2 size={18} className="spin" /> 正在渲染页面
                    </div>
                  )}
                  {preview && (
                    <div
                      className="edit-canvas"
                      ref={canvasRef}
                      onPointerDown={onCanvasPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                    >
                      <img src={preview} alt={`第 ${page + 1} 页`} draggable={false} />
                      {items
                        .filter((item) => item.page === page)
                        .map((item) => {
                          const isSelected = item.id === selectedId
                          const scale = previewWidth / pageSize.width
                          if (item.kind === 'image' && item.imageBytes) {
                            return (
                              <div
                                key={item.id}
                                className={`edit-item edit-item-image ${isSelected ? 'is-selected' : ''}`}
                                style={{
                                  left: `${item.x * 100}%`,
                                  top: `${item.y * 100}%`,
                                  width: `${item.w * 100}%`,
                                  height: `${item.h * 100}%`,
                                  opacity: item.opacity ?? 1
                                }}
                                onPointerDown={(event) => onItemPointerDown(event, item)}
                              >
                                <BlobImage bytes={item.imageBytes} name={item.imageName} alt="" />
                                {isSelected && (
                                  <>
                                    <span className="item-outline" />
                                    <button
                                      type="button"
                                      className="item-delete"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        removeItem(item.id)
                                      }}
                                      title="删除"
                                    >
                                      <X size={11} />
                                    </button>
                                    <span
                                      className="resize-handle"
                                      onPointerDown={(event) => onResizePointerDown(event, item)}
                                    />
                                  </>
                                )}
                              </div>
                            )
                          }
                          if (item.kind === 'whiteout') {
                            return (
                              <div
                                key={item.id}
                                className={`edit-item edit-item-whiteout ${isSelected ? 'is-selected' : ''}`}
                                style={{
                                  left: `${item.x * 100}%`,
                                  top: `${item.y * 100}%`,
                                  width: `${item.w * 100}%`,
                                  height: `${item.h * 100}%`
                                }}
                                onPointerDown={(event) => onItemPointerDown(event, item)}
                              >
                                {isSelected && (
                                  <>
                                    <span className="item-outline" />
                                    <button
                                      type="button"
                                      className="item-delete"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        removeItem(item.id)
                                      }}
                                      title="删除"
                                    >
                                      <X size={11} />
                                    </button>
                                    <span
                                      className="resize-handle"
                                      onPointerDown={(event) => onResizePointerDown(event, item)}
                                    />
                                  </>
                                )}
                              </div>
                            )
                          }
                          return (
                            <div
                              key={item.id}
                              className={`edit-item edit-item-text ${isSelected ? 'is-selected' : ''}`}
                              style={{
                                left: `${item.x * 100}%`,
                                top: `${item.y * 100}%`,
                                width: `${item.w * 100}%`,
                                fontSize: `${(item.fontSize || 16) * scale}px`,
                                color: item.color
                              }}
                              onPointerDown={(event) => onItemPointerDown(event, item)}
                            >
                              <span className="text-preview" style={{ whiteSpace: 'pre-wrap' }}>
                                {item.text || ' '}
                              </span>
                              {isSelected && (
                                <>
                                  <span className="item-outline" />
                                  <button
                                    type="button"
                                    className="item-delete"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      removeItem(item.id)
                                    }}
                                    title="删除"
                                  >
                                    <X size={11} />
                                  </button>
                                  <span
                                    className="resize-handle"
                                    onPointerDown={(event) => onResizePointerDown(event, item)}
                                  />
                                </>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
                <p className="preview-caption">
                  <MousePointer2 size={13} /> 点击对象选中，拖动调整位置；拖右下角改变大小。
                </p>
              </div>

              <div className="edit-inspector">
                {selected ? (
                  <>
                    <div className="inspector-head">
                      <div>
                        <span className="section-kicker">SELECTED</span>
                        <h3>
                          {selected.kind === 'text' ? '文字' : selected.kind === 'image' ? '图片' : '遮盖区块'}
                        </h3>
                      </div>
                      <button type="button" className="inspector-delete" onClick={() => removeItem(selected.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {selected.kind === 'text' && (
                      <>
                        <label className="inspector-field">
                          <span>内容</span>
                          <textarea
                            className="inspector-textarea"
                            value={selected.text || ''}
                            rows={4}
                            onChange={(event) => updateItem(selected.id, { text: event.target.value })}
                          />
                        </label>
                        <div className="inspector-row">
                          <span>字号</span>
                          <NumberStepper
                            value={selected.fontSize || 16}
                            min={6}
                            max={96}
                            suffix="pt"
                            onChange={(value) => updateItem(selected.id, { fontSize: value })}
                          />
                        </div>
                        <div className="inspector-row">
                          <span>颜色</span>
                          <span className="color-field">
                            <input
                              type="color"
                              value={selected.color || '#203027'}
                              onChange={(event) => updateItem(selected.id, { color: event.target.value })}
                            />
                            <span>{String(selected.color || '#203027').toUpperCase()}</span>
                          </span>
                        </div>
                      </>
                    )}
                    {selected.kind === 'whiteout' && (
                      <p className="inspector-note">白色遮盖会在原内容上方绘制一个实心矩形，适合盖住小段文字。</p>
                    )}
                    {selected.kind === 'image' && (
                      <div className="inspector-image-meta">
                        <BlobImage
                          bytes={selected.imageBytes}
                          name={selected.imageName}
                          alt=""
                        />
                        <div>
                          <strong>{selected.imageName}</strong>
                          <span>拖动右下角调整大小</span>
                        </div>
                      </div>
                    )}
                    <div className="inspector-row">
                      <span>透明度</span>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={selected.opacity ?? 1}
                        onChange={(event) => updateItem(selected.id, { opacity: Number(event.target.value) })}
                      />
                      <small>{Math.round((selected.opacity ?? 1) * 100)}%</small>
                    </div>
                  </>
                ) : (
                  <div className="inspector-empty">
                    <span className="inspector-empty-icon">
                      <MousePointer2 size={18} />
                    </span>
                    <h3>选中一个对象</h3>
                    <p>添加文字、图片或白色遮盖后，在预览中点击它即可调整。</p>
                  </div>
                )}

                {items.filter((item) => item.page === page).length > 0 && (
                  <div className="page-object-list">
                    <span className="section-kicker">THIS PAGE</span>
                    {items
                      .filter((item) => item.page === page)
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={item.id === selectedId ? 'is-active' : ''}
                          onClick={() => setSelectedId(item.id)}
                        >
                          {item.kind === 'text' ? <Type size={13} /> : item.kind === 'image' ? <ImagePlus size={13} /> : <Square size={13} />}
                          <span>{item.kind === 'text' ? item.text?.slice(0, 18) || '文字' : item.kind === 'image' ? item.imageName : '白色遮盖'}</span>
                          <X
                            size={12}
                            onClick={(event) => {
                              event.stopPropagation()
                              removeItem(item.id)
                            }}
                          />
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      <aside className="tool-rail">
        <div className="rail-card">
          <span className="rail-kicker">EDIT</span>
          <h3>{items.length ? `${items.length} 处编辑` : '开始编辑'}</h3>
          <div className="rail-summary">
            <div>
              <span>当前页</span>
              <strong>{file ? `${page + 1} / ${total}` : '—'}</strong>
            </div>
            <div>
              <span>文字</span>
              <strong>{items.filter((i) => i.kind === 'text').length} 处</strong>
            </div>
            <div>
              <span>图片 / 遮盖</span>
              <strong>{items.filter((i) => i.kind !== 'text').length} 处</strong>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="rail-action"
            disabled={!file || !items.length}
            icon={<Sparkles size={17} />}
            onClick={() => void start()}
          >
            导出编辑结果
          </Button>
          <span className="rail-foot">文字会作为可搜索图层写入</span>
        </div>
      </aside>
    </div>
  )
}
