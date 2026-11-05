import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Crop, Loader2, Sparkles } from 'lucide-react'
import type { WorkFile } from '../../lib/files'
import { formatBytes, kindOf } from '../../lib/files'
import type { ToolDef } from '../../lib/tools'
import { cropPdf } from '../../lib/pdfOps'
import { getPdfPageCount, loadPdfJs, renderPdfPage } from '../../lib/pdf'
import type { RunTask } from '../ToolPage'
import { DropZone } from '../FilePicker'
import { Button, Field, RangeField, SectionTitle, TextInput } from '../ui'

export function CropTool({
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
  const [previewPage, setPreviewPage] = useState(1)
  const [preview, setPreview] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [margins, setMargins] = useState({ top: 8, right: 8, bottom: 8, left: 8 })
  const [linked, setLinked] = useState(true)
  const [pages, setPages] = useState('')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!file) return
    let alive = true
    void (async () => {
      setLoading(true)
      try {
        const count = await getPdfPageCount(file.bytes)
        if (!alive) return
        setTotal(count)
        setFile((current) => (current ? { ...current, pageCount: count } : current))
        setPreviewPage(1)
      } catch (error) {
        if (alive) notify(error instanceof Error ? error.message : '无法读取 PDF', 'error')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id])

  useEffect(() => {
    if (!file || !total) return
    let alive = true
    void (async () => {
      try {
        setProgress(0.1)
        const doc = await loadPdfJs(file.bytes)
        const page = await doc.getPage(previewPage)
        if (!alive) return
        const viewport = page.getViewport({ scale: 1 })
        setPageSize({ width: viewport.width, height: viewport.height })
        setProgress(0.45)
        const image = await renderPdfPage(doc, previewPage, { maxWidth: 460 })
        if (!alive) return
        setPreview(image.dataUrl)
        setProgress(1)
        await doc.destroy()
      } catch (error) {
        if (alive) notify(error instanceof Error ? error.message : '无法渲染预览', 'error')
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id, previewPage, total])

  const percentage = useMemo(() => {
    const ptPerMm = 72 / 25.4
    if (!pageSize) return { top: 0, right: 0, bottom: 0, left: 0 }
    return {
      top: ((margins.top * ptPerMm) / pageSize.height) * 100,
      right: ((margins.right * ptPerMm) / pageSize.width) * 100,
      bottom: ((margins.bottom * ptPerMm) / pageSize.height) * 100,
      left: ((margins.left * ptPerMm) / pageSize.width) * 100
    }
  }, [margins, pageSize])

  const setMargin = (key: keyof typeof margins, value: number): void => {
    if (linked) {
      setMargins({ top: value, right: value, bottom: value, left: value })
    } else {
      setMargins((current) => ({ ...current, [key]: value }))
    }
  }

  const setFileFromDrop = async (incoming: WorkFile[]): Promise<void> => {
    const candidate = incoming[0]
    if (!candidate) return
    try {
      const count = await getPdfPageCount(candidate.bytes)
      setFile({ ...candidate, pageCount: count })
      setPreview(null)
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法读取 PDF', 'error')
    }
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
    if (Math.max(margins.top + margins.bottom, margins.left + margins.right) > 320) {
      notify('边距过大，请调小后再试', 'error')
      return
    }
    await run(
      (p) => cropPdf(file, { margins, pages }, p),
      file.name
    )
  }

  return (
    <div className="generic-layout">
      <div className="tool-main">
        <section className="panel">
          <SectionTitle hint={file ? '预览会随边距变化' : '支持单个 PDF'}>
            <span className="step-number">01</span> 选择文件
          </SectionTitle>
          {!file ? (
            <DropZone tool={tool} onFiles={(incoming) => void setFileFromDrop(incoming)} onError={notify} />
          ) : (
            <div className="organize-summary-bar">
              <div>
                <strong>{file.name}</strong>
                <span>
                  {file.pageCount ?? total} 页 · {formatBytes(file.size)}
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
            <SectionTitle hint={loading ? '正在渲染页面…' : '拖不动也没关系，用数字慢慢来'}>
              <span className="step-number">02</span> 裁切范围
            </SectionTitle>
            <div className="crop-layout">
              <div className="crop-preview-column">
                <div className="crop-preview">
                  {!preview ? (
                    <div className="crop-loading">
                      <Loader2 size={20} className="spin" />
                      <span>正在准备预览 {Math.round(progress * 100)}%</span>
                    </div>
                  ) : (
                    <div className="crop-canvas">
                      <img src={preview} alt="页面预览" />
                      <span className="crop-mask top" style={{ height: `${percentage.top}%` }} />
                      <span className="crop-mask bottom" style={{ height: `${percentage.bottom}%` }} />
                      <span className="crop-mask left" style={{ top: `${percentage.top}%`, bottom: `${percentage.bottom}%`, width: `${percentage.left}%` }} />
                      <span className="crop-mask right" style={{ top: `${percentage.top}%`, bottom: `${percentage.bottom}%`, width: `${percentage.right}%` }} />
                      <span
                        className="crop-frame"
                        style={{
                          top: `${percentage.top}%`,
                          right: `${percentage.right}%`,
                          bottom: `${percentage.bottom}%`,
                          left: `${percentage.left}%`
                        }}
                      >
                        <i className="crop-corner tl" />
                        <i className="crop-corner tr" />
                        <i className="crop-corner bl" />
                        <i className="crop-corner br" />
                      </span>
                    </div>
                  )}
                  {total > 1 && (
                    <div className="preview-pager">
                      <button
                        type="button"
                        aria-label="上一页"
                        disabled={previewPage <= 1}
                        onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft size={15} />
                      </button>
                      <span>
                        第 {previewPage} / {total} 页
                      </span>
                      <button
                        type="button"
                        aria-label="下一页"
                        disabled={previewPage >= total}
                        onClick={() => setPreviewPage((p) => Math.min(total, p + 1))}
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  )}
                </div>
                <p className="preview-caption">深色区域将被裁掉，白色框内为保留范围。</p>
              </div>

              <div className="crop-controls">
                <button
                  type="button"
                  className={`link-margins ${linked ? 'is-on' : ''}`}
                  onClick={() => setLinked((value) => !value)}
                >
                  <span className={`mini-check ${linked ? 'is-on' : ''}`} />
                  四边等距
                </button>
                <div className="margin-grid">
                  {(
                    [
                      ['top', '上边距'],
                      ['right', '右边距'],
                      ['bottom', '下边距'],
                      ['left', '左边距']
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <RangeField
                        value={margins[key]}
                        min={0}
                        max={50}
                        step={1}
                        onChange={(value) => setMargin(key, value)}
                        valueLabel={`${margins[key]} mm`}
                      />
                    </Field>
                  ))}
                </div>
                <Field label="应用页面" hint="留空表示全部页面">
                  <TextInput value={pages} onChange={setPages} placeholder="全部页面" />
                </Field>
                <div className="crop-ratio-note">
                  <Crop size={15} />
                  <span>
                    {pageSize
                      ? `页面 ${(pageSize.width / (72 / 25.4)).toFixed(0)} × ${(pageSize.height / (72 / 25.4)).toFixed(0)} mm`
                      : '正在读取页面尺寸'}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      <aside className="tool-rail">
        <div className="rail-card">
          <span className="rail-kicker">CROP</span>
          <h3>{file ? '调整留白' : '等待文件'}</h3>
          <div className="rail-summary">
            <div>
              <span>上 / 下</span>
              <strong>
                {margins.top} / {margins.bottom} mm
              </strong>
            </div>
            <div>
              <span>左 / 右</span>
              <strong>
                {margins.left} / {margins.right} mm
              </strong>
            </div>
            <div>
              <span>应用</span>
              <strong>{pages || '全部页面'}</strong>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="rail-action"
            disabled={!file}
            icon={<Sparkles size={17} />}
            onClick={() => void start()}
          >
            裁切并保存
          </Button>
          <span className="rail-foot">原文件不会被修改</span>
        </div>
      </aside>
    </div>
  )
}
