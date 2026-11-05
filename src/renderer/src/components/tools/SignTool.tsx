import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  PenLine,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Upload
} from 'lucide-react'
import type { WorkFile } from '../../lib/files'
import { formatBytes, kindOf } from '../../lib/files'
import type { ToolDef } from '../../lib/tools'
import { applySignature } from '../../lib/pdfOps'
import { getPdfPageCount, loadPdfJs, renderPdfPage } from '../../lib/pdf'
import type { RunTask } from '../ToolPage'
import { DropZone } from '../FilePicker'
import { Button, Field, RangeField, SectionTitle, TextInput, Toggle } from '../ui'

type SignatureMode = 'draw' | 'type' | 'upload'

async function canvasPng(canvas: HTMLCanvasElement): Promise<{ bytes: Uint8Array; url: string }> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('签名图像生成失败')
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    url: URL.createObjectURL(blob)
  }
}

export function SignTool({
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
  const [mode, setMode] = useState<SignatureMode>('draw')
  const [typedName, setTypedName] = useState('')
  const [fontStyle, setFontStyle] = useState('KaiTi')
  const [signature, setSignature] = useState<{ bytes: Uint8Array; url: string } | null>(null)
  const [hasDrawing, setHasDrawing] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [showDate, setShowDate] = useState(true)
  const [widthRatio, setWidthRatio] = useState(0.28)
  const [position, setPosition] = useState({ x: 0.58, y: 0.76 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, sigX: 0, sigY: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!file) return
    void getPdfPageCount(file.bytes)
      .then((count) => {
        setTotal(count)
        setPage(count - 1)
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
        const image = await renderPdfPage(doc, page + 1, { maxWidth: 620 })
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || mode !== 'draw') return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [mode])

  useEffect(() => {
    if (mode !== 'type') return
    const timer = window.setTimeout(() => {
      if (!typedName.trim()) {
        setSignature(null)
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = 1000
      canvas.height = 300
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#1e2d24'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `italic 118px "${fontStyle}", "STKaiti", "KaiTi", "Segoe Script", cursive`
      ctx.fillText(typedName.trim(), canvas.width / 2, canvas.height / 2, canvas.width - 80)
      void canvasPng(canvas).then(setSignature)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [typedName, fontStyle, mode])

  const drawPoint = (event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    }
  }

  const onDrawStart = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = event.currentTarget
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const point = drawPoint(event)
    drawing.current = true
    canvas.setPointerCapture(event.pointerId)
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
    ctx.strokeStyle = '#1e2d24'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  const onDrawMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawing.current) return
    const canvas = event.currentTarget
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const point = drawPoint(event)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    setHasDrawing(true)
  }

  const onDrawEnd = async (): Promise<void> => {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (!canvas) return
    setSignature(await canvasPng(canvas))
  }

  const clearSignature = (): void => {
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }
    setHasDrawing(false)
    setSignature(null)
  }

  const uploadSignature = async (): Promise<void> => {
    const opened = await window.desktop.openFiles({
      title: '选择签名图片',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      multiple: false
    })
    if (!opened.length) return
    const raw = new Uint8Array(opened[0].data)
    try {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(raw).buffer]))
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('无法读取签名图片')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      const result = await canvasPng(canvas)
      setSignature(result)
      setMode('upload')
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法读取签名图片', 'error')
    }
  }

  const setPreset = (x: number, y: number): void => setPosition({ x, y })

  const onSignaturePointerDown = (event: React.PointerEvent): void => {
    event.stopPropagation()
    setDragging(true)
    dragStart.current = { x: event.clientX, y: event.clientY, sigX: position.x, sigY: position.y }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const onPagePointerMove = (event: React.PointerEvent): void => {
    if (!dragging || !pageRef.current) return
    const rect = pageRef.current.getBoundingClientRect()
    const dx = (event.clientX - dragStart.current.x) / rect.width
    const dy = (event.clientY - dragStart.current.y) / rect.height
    setPosition({
      x: Math.max(0.02, Math.min(0.9, dragStart.current.sigX + dx)),
      y: Math.max(0.02, Math.min(0.92, dragStart.current.sigY + dy))
    })
  }

  const setFileFromDrop = async (incoming: WorkFile[]): Promise<void> => {
    const candidate = incoming[0]
    if (!candidate || candidate.kind !== 'pdf') {
      notify('请选择一个 PDF 文件', 'error')
      return
    }
    setFile(candidate)
    setPreview(null)
    setSignature(null)
    setHasDrawing(false)
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
    if (!file || !signature) {
      notify('请先添加签名', 'error')
      return
    }
    await run(
      (progress) =>
        applySignature(file, signature.bytes, {
          page,
          x: position.x,
          y: position.y,
          widthRatio,
          signerName: signerName.trim(),
          showDate
        }, progress),
      file.name
    )
  }

  return (
    <div className="generic-layout sign-layout">
      <div className="tool-main">
        <section className="panel">
          <SectionTitle hint={file ? '在最后一页落款' : '支持单个 PDF'}>
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
          <section className="panel sign-panel">
            <SectionTitle hint="手写签名只作为图像嵌入页面">
              <span className="step-number">02</span> 制作签名
            </SectionTitle>
            <div className="sign-layout-grid">
              <div className="signature-builder">
                <div className="signature-tabs">
                  <button type="button" className={mode === 'draw' ? 'is-active' : ''} onClick={() => setMode('draw')}>
                    <PenLine size={15} /> 手写
                  </button>
                  <button type="button" className={mode === 'type' ? 'is-active' : ''} onClick={() => setMode('type')}>
                    <TypeIcon size={15} /> 输入
                  </button>
                  <button type="button" className={mode === 'upload' ? 'is-active' : ''} onClick={() => void uploadSignature()}>
                    <Upload size={15} /> 上传
                  </button>
                </div>

                {mode === 'draw' ? (
                  <div className="signature-pad-wrap">
                    <canvas
                      ref={canvasRef}
                      width={900}
                      height={300}
                      className="signature-pad"
                      onPointerDown={onDrawStart}
                      onPointerMove={onDrawMove}
                      onPointerUp={() => void onDrawEnd()}
                      onPointerCancel={() => void onDrawEnd()}
                    />
                    {!hasDrawing && <span className="signature-placeholder">在这里手写签名</span>}
                    <div className="signature-pad-actions">
                      <button type="button" onClick={clearSignature}>
                        <Trash2 size={14} /> 清空
                      </button>
                      <span>建议使用鼠标或触控板</span>
                    </div>
                  </div>
                ) : mode === 'type' ? (
                  <div className="signature-type-wrap">
                    <TextInput value={typedName} onChange={setTypedName} placeholder="输入姓名或称谓" />
                    <div className="font-options">
                      {[
                        { id: 'KaiTi', label: '楷体' },
                        { id: 'STKaiti', label: '华文楷体' },
                        { id: 'Segoe Script', label: '手写体' }
                      ].map((font) => (
                        <button
                          key={font.id}
                          type="button"
                          className={fontStyle === font.id ? 'is-active' : ''}
                          style={{ fontFamily: `"${font.id}", cursive` }}
                          onClick={() => setFontStyle(font.id)}
                        >
                          {font.label}
                        </button>
                      ))}
                    </div>
                    <div className="typed-preview" style={{ fontFamily: `"${fontStyle}", cursive` }}>
                      {typedName || '签名预览'}
                    </div>
                  </div>
                ) : (
                  <div className="signature-upload-wrap">
                    {signature ? (
                      <div className="uploaded-signature">
                        <img src={signature.url} alt="签名预览" />
                        <button type="button" onClick={() => void uploadSignature()}>
                          更换图片
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="upload-mini" onClick={() => void uploadSignature()}>
                        <ImagePlus size={20} />
                        <span>选择签名图片（建议透明 PNG）</span>
                      </button>
                    )}
                  </div>
                )}

                {signature && mode !== 'upload' && (
                  <div className="signature-ready">
                    <Check size={14} /> 签名已准备好
                    <button type="button" onClick={clearSignature}>
                      重新制作
                    </button>
                  </div>
                )}

                <div className="sign-meta">
                  <Field label="签署人" hint="显示在签名下方，可留空">
                    <TextInput value={signerName} onChange={setSignerName} placeholder="姓名" />
                  </Field>
                  <Toggle checked={showDate} onChange={setShowDate} label="显示签署日期" />
                </div>
                <Field label="签名大小">
                  <RangeField
                    value={widthRatio}
                    min={0.14}
                    max={0.46}
                    step={0.01}
                    onChange={setWidthRatio}
                    valueLabel={`${Math.round(widthRatio * 100)}% 页宽`}
                  />
                </Field>
              </div>

              <div className="sign-preview-column">
                <div className="sign-preview-head">
                  <span>落款位置</span>
                  <div className="sign-presets">
                    <button type="button" onClick={() => setPreset(0.08, 0.12)}>左上</button>
                    <button type="button" onClick={() => setPreset(0.5, 0.12)}>上方</button>
                    <button type="button" onClick={() => setPreset(0.08, 0.78)}>左下</button>
                    <button type="button" onClick={() => setPreset(0.58, 0.78)}>右下</button>
                  </div>
                </div>
                <div className="sign-page-shell">
                  {loading && (
                    <div className="edit-loading">
                      <Loader2 size={18} className="spin" /> 正在渲染页面
                    </div>
                  )}
                  {preview && (
                    <div
                      className="sign-page"
                      ref={pageRef}
                      onPointerMove={onPagePointerMove}
                      onPointerUp={() => setDragging(false)}
                      onPointerCancel={() => setDragging(false)}
                    >
                      <img src={preview} alt={`第 ${page + 1} 页`} draggable={false} />
                      {signature && (
                        <div
                          className={`signature-float ${dragging ? 'is-dragging' : ''}`}
                          style={{
                            left: `${position.x * 100}%`,
                            top: `${position.y * 100}%`,
                            width: `${widthRatio * 100}%`
                          }}
                          onPointerDown={onSignaturePointerDown}
                        >
                          <img src={signature.url} alt="签名" draggable={false} />
                          {signerName && <span>{signerName}</span>}
                          {showDate && <small>{new Date().toLocaleDateString('zh-CN')}</small>}
                        </div>
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
                <p className="preview-caption">拖动签名到合适位置。</p>
              </div>
            </div>
          </section>
        )}
      </div>

      <aside className="tool-rail">
        <div className="rail-card">
          <span className="rail-kicker">SIGN</span>
          <h3>{signature ? '可以落款了' : '等待签名'}</h3>
          <div className="rail-summary">
            <div>
              <span>签署页</span>
              <strong>{file ? `${page + 1} / ${total}` : '—'}</strong>
            </div>
            <div>
              <span>大小</span>
              <strong>{Math.round(widthRatio * 100)}% 页宽</strong>
            </div>
            <div>
              <span>日期</span>
              <strong>{showDate ? '显示' : '不显示'}</strong>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="rail-action"
            disabled={!file || !signature}
            icon={<Sparkles size={17} />}
            onClick={() => void start()}
          >
            签署并保存
          </Button>
          <span className="rail-foot">签名图像已嵌入页面</span>
        </div>
      </aside>
    </div>
  )
}
