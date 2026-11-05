import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Loader2,
  ShieldAlert,
  Sparkles,
  Undo2,
  X
} from 'lucide-react'
import type { WorkFile } from '../../lib/files'
import { formatBytes, kindOf } from '../../lib/files'
import type { ToolDef } from '../../lib/tools'
import type { RedactionBox } from '../../lib/pdfOps'
import { redactPdf } from '../../lib/pdfOps'
import { getPdfPageCount, loadPdfJs, renderPdfPage } from '../../lib/pdf'
import type { RunTask } from '../ToolPage'
import { DropZone } from '../FilePicker'
import { Button, Field, SectionTitle, Select } from '../ui'

export function RedactTool({
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
  const [loading, setLoading] = useState(false)
  const [boxes, setBoxes] = useState<RedactionBox[]>([])
  const [dpi, setDpi] = useState('170')
  const [draft, setDraft] = useState<RedactionBox | null>(null)
  const [drawing, setDrawing] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)

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
        const image = await renderPdfPage(doc, page + 1, { maxWidth: 650 })
        if (alive) setPreview(image.dataUrl)
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

  const point = (event: React.PointerEvent): { x: number; y: number } => {
    const el = canvasRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    }
  }

  const onDown = (event: React.PointerEvent): void => {
    if ((event.target as HTMLElement).closest('.redaction-box-delete')) return
    const start = point(event)
    startRef.current = start
    setDrawing(true)
    setDraft({ page, x: start.x, y: start.y, w: 0, h: 0 })
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const onMove = (event: React.PointerEvent): void => {
    if (!drawing || !startRef.current) return
    const current = point(event)
    const start = startRef.current
    setDraft({
      page,
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      w: Math.abs(current.x - start.x),
      h: Math.abs(current.y - start.y)
    })
  }

  const onUp = (): void => {
    setDrawing(false)
    if (draft && draft.w > 0.004 && draft.h > 0.004) {
      setBoxes((current) => [...current, draft])
    }
    setDraft(null)
    startRef.current = null
  }

  const removeLast = (): void => setBoxes((current) => current.slice(0, -1))

  const setFileFromDrop = async (incoming: WorkFile[]): Promise<void> => {
    const candidate = incoming[0]
    if (!candidate || candidate.kind !== 'pdf') {
      notify('请选择一个 PDF 文件', 'error')
      return
    }
    setFile(candidate)
    setBoxes([])
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
    if (!boxes.length) {
      notify('请先在页面上框选要遮盖的内容', 'error')
      return
    }
    await run((progress) => redactPdf(file, boxes, { dpi: Number(dpi) }, progress), file.name)
  }

  const pageBoxes = boxes.filter((box) => box.page === page)
  const affectedPages = new Set(boxes.map((box) => box.page)).size

  return (
    <div className="generic-layout">
      <div className="tool-main">
        <section className="panel">
          <SectionTitle hint={file ? '框选即遮盖，导出后不可恢复' : '支持单个 PDF'}>
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
          <section className="panel">
            <div className="redact-head">
              <SectionTitle hint="在页面上拖动鼠标，画出要遮盖的区域">
                <span className="step-number">02</span> 框选敏感内容
              </SectionTitle>
              <div className="redact-actions">
                <button type="button" className="text-action" disabled={!boxes.length} onClick={removeLast}>
                  <Undo2 size={14} /> 撤销
                </button>
                <button type="button" className="text-action" disabled={!boxes.length} onClick={() => setBoxes([])}>
                  <Eraser size={14} /> 清空
                </button>
              </div>
            </div>
            <div className="redact-layout">
              <div className="redact-canvas-column">
                <div className="redact-page-shell">
                  {loading && (
                    <div className="edit-loading">
                      <Loader2 size={18} className="spin" /> 正在渲染页面
                    </div>
                  )}
                  {preview && (
                    <div
                      className={`redact-page ${drawing ? 'is-drawing' : ''}`}
                      ref={canvasRef}
                      onPointerDown={onDown}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      onPointerCancel={onUp}
                    >
                      <img src={preview} alt={`第 ${page + 1} 页`} draggable={false} />
                      {pageBoxes.map((box, index) => (
                        <div
                          key={`${box.page}-${index}-${box.x}`}
                          className="redaction-box"
                          style={{
                            left: `${box.x * 100}%`,
                            top: `${box.y * 100}%`,
                            width: `${box.w * 100}%`,
                            height: `${box.h * 100}%`
                          }}
                        >
                          <button
                            type="button"
                            className="redaction-box-delete"
                            onClick={(event) => {
                              event.stopPropagation()
                              setBoxes((current) =>
                                current.filter((candidate) => candidate !== box)
                              )
                            }}
                            title="移除遮盖"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                      {draft && (
                        <div
                          className="redaction-box is-draft"
                          style={{
                            left: `${draft.x * 100}%`,
                            top: `${draft.y * 100}%`,
                            width: `${draft.w * 100}%`,
                            height: `${draft.h * 100}%`
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
                <div className="preview-pager">
                  <button type="button" disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="上一页">
                    <ChevronLeft size={15} />
                  </button>
                  <span>
                    第 {page + 1} / {total} 页
                  </span>
                  <button
                    type="button"
                    disabled={page >= total - 1}
                    onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
                    aria-label="下一页"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
                <p className="preview-caption">被涂黑的内容会随页面一起栅格化，无法通过复制或还原找回。</p>
              </div>

              <div className="redact-side">
                <div className="redact-warning">
                  <ShieldAlert size={19} />
                  <div>
                    <strong>不可逆操作</strong>
                    <p>导出后，原文字与图像都会被移除。建议先保留一份原文件。</p>
                  </div>
                </div>
                <Field label="导出清晰度" hint="越高越清晰，文件也越大">
                  <Select
                    value={dpi}
                    onChange={setDpi}
                    options={[
                      { value: '140', label: '140 DPI · 轻量' },
                      { value: '170', label: '170 DPI · 推荐' },
                      { value: '220', label: '220 DPI · 清晰' }
                    ]}
                  />
                </Field>
                <div className="redact-stats">
                  <div>
                    <span>已框选</span>
                    <strong>{boxes.length} 处</strong>
                  </div>
                  <div>
                    <span>涉及页面</span>
                    <strong>{affectedPages} 页</strong>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      <aside className="tool-rail">
        <div className="rail-card">
          <span className="rail-kicker">REDACT</span>
          <h3>{boxes.length ? `${boxes.length} 处待遮盖` : '等待框选'}</h3>
          <div className="rail-summary">
            <div>
              <span>当前页</span>
              <strong>{file ? `${page + 1} / ${total}` : '—'}</strong>
            </div>
            <div>
              <span>涉及</span>
              <strong>{affectedPages} 页</strong>
            </div>
            <div>
              <span>输出</span>
              <strong>栅格化 PDF</strong>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="rail-action"
            disabled={!file || !boxes.length}
            icon={<Sparkles size={17} />}
            onClick={() => void start()}
          >
            永久遮盖并导出
          </Button>
          <span className="rail-foot">原文件不会被修改</span>
        </div>
      </aside>
    </div>
  )
}
