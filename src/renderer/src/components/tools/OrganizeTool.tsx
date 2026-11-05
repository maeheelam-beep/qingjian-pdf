import { useEffect, useMemo, useRef, useState } from 'react'
import { GripVertical, Loader2, RotateCcw, RotateCw, Sparkles, Trash2, Undo2 } from 'lucide-react'
import type { WorkFile } from '../../lib/files'
import { formatBytes } from '../../lib/files'
import type { ToolDef } from '../../lib/tools'
import { getPdfPageCount, getPageThumbnails } from '../../lib/pdf'
import { organizePdf } from '../../lib/pdfOps'
import type { RunTask } from '../ToolPage'
import { DropZone } from '../FilePicker'
import { Button, SectionTitle } from '../ui'

interface PageItem {
  id: string
  sourceIndex: number
  rotation: number
}

export function OrganizeTool({
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
  const [pages, setPages] = useState<PageItem[]>([])
  const [thumbs, setThumbs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const initialFileRef = useRef(initialFiles?.[0] ?? null)

  useEffect(() => {
    if (!file) return
    let alive = true
    void (async () => {
      setLoading(true)
      setThumbs([])
      setLoadProgress(0)
      try {
        const total = await getPdfPageCount(file.bytes)
        if (!alive) return
        setPages(
          Array.from({ length: total }, (_, index) => ({
            id: `p_${index}`,
            sourceIndex: index,
            rotation: 0
          }))
        )
        const images = await getPageThumbnails(file.bytes, 145, total, (done, count) => {
          if (alive) setLoadProgress(done / count)
        })
        if (alive) setThumbs(images)
      } catch (error) {
        if (alive) notify(error instanceof Error ? error.message : '无法读取这个 PDF', 'error')
      } finally {
        if (alive) {
          setLoading(false)
          setLoadProgress(1)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [file, notify])

  useEffect(() => {
    if (!initialFileRef.current) return
    const candidate = initialFiles?.[0]
    if (candidate) {
      void getPdfPageCount(candidate.bytes)
        .then((count) => setFile({ ...candidate, pageCount: count }))
        .catch(() => setFile(candidate))
    }
  }, [initialFiles])

  const deleted = useMemo(() => {
    if (!file?.pageCount) return 0
    return file.pageCount - pages.length
  }, [file, pages.length])

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
        kind: 'pdf'
      }
    ])
  }

  const setFileFromDrop = async (incoming: WorkFile[]): Promise<void> => {
    const candidate = incoming[0]
    if (!candidate || candidate.kind !== 'pdf') {
      notify('请选择一个 PDF 文件', 'error')
      return
    }
    try {
      const count = await getPdfPageCount(candidate.bytes)
      setFile({ ...candidate, pageCount: count })
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法读取这个 PDF', 'error')
    }
  }

  const rotate = (id: string, delta: number): void => {
    setPages((current) =>
      current.map((page) =>
        page.id === id ? { ...page, rotation: (page.rotation + delta + 360) % 360 } : page
      )
    )
  }

  const remove = (id: string): void => {
    if (pages.length <= 1) {
      notify('至少保留一页', 'error')
      return
    }
    setPages((current) => current.filter((page) => page.id !== id))
  }

  const reset = (): void => {
    if (!file?.pageCount) return
    setPages(
      Array.from({ length: file.pageCount }, (_, index) => ({
        id: `p_${index}`,
        sourceIndex: index,
        rotation: 0
      }))
    )
  }

  const dropOn = (targetId: string): void => {
    if (!dragId || dragId === targetId) return
    setPages((current) => {
      const from = current.findIndex((page) => page.id === dragId)
      const to = current.findIndex((page) => page.id === targetId)
      if (from < 0 || to < 0) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setDragId(null)
    setOverId(null)
  }

  const start = async (): Promise<void> => {
    if (!file || !pages.length) {
      notify('请先选择 PDF 文件', 'error')
      return
    }
    await run(
      (progress) =>
        organizePdf(
          file,
          pages.map((page) => ({ sourceIndex: page.sourceIndex, rotation: page.rotation })),
          progress
        ),
      file.name
    )
  }

  return (
    <div className="generic-layout">
      <div className="tool-main">
        <section className="panel">
          <SectionTitle hint={file ? '拖拽页面卡片即可排序' : '支持单个 PDF'}>
            <span className="step-number">01</span> 选择文件
          </SectionTitle>
          {!file ? (
            <DropZone tool={tool} onFiles={(incoming) => void setFileFromDrop(incoming)} onError={notify} />
          ) : (
            <div className="organize-summary-bar">
              <div>
                <strong>{file.name}</strong>
                <span>
                  {file.pageCount ? `${file.pageCount} 页 · ` : ''}
                  {formatBytes(file.size)}
                </span>
              </div>
              <div className="organize-summary-actions">
                <button type="button" className="text-action" onClick={() => void pickFile()}>
                  更换文件
                </button>
                <button type="button" className="text-action" onClick={reset}>
                  <Undo2 size={14} /> 还原
                </button>
              </div>
            </div>
          )}
        </section>

        {file && (
          <section className="panel organize-panel">
            <div className="organize-head">
              <div>
                <SectionTitle hint={loading ? '正在生成页面预览…' : '拖动卡片调整顺序'}>
                  <span className="step-number">02</span> 整理页面
                </SectionTitle>
              </div>
              <div className="organize-stats">
                <span>{pages.length} 页保留</span>
                {deleted > 0 && <span className="deleted">{deleted} 页已删除</span>}
              </div>
            </div>
            {loading && !thumbs.length ? (
              <div className="thumbnail-loading">
                <Loader2 size={19} className="spin" />
                <span>正在读取页面 · {Math.round(loadProgress * 100)}%</span>
                <div className="progress-track slim">
                  <span style={{ width: `${Math.max(4, loadProgress * 100)}%` }} />
                </div>
              </div>
            ) : (
              <div className="page-grid">
                {pages.map((page, index) => (
                  <div
                    key={page.id}
                    className={`page-card ${dragId === page.id ? 'is-dragging' : ''} ${overId === page.id ? 'is-over' : ''}`}
                    draggable
                    onDragStart={(event) => {
                      setDragId(page.id)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverId(null)
                    }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setOverId(page.id)
                    }}
                    onDragLeave={() => setOverId((id) => (id === page.id ? null : id))}
                    onDrop={(event) => {
                      event.preventDefault()
                      dropOn(page.id)
                    }}
                  >
                    <div className="page-card-top">
                      <span className="page-drag">
                        <GripVertical size={14} />
                      </span>
                      <span className="page-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="page-origin">原 {page.sourceIndex + 1}</span>
                    </div>
                    <div className="page-card-preview">
                      {thumbs[page.sourceIndex] ? (
                        <img
                          src={thumbs[page.sourceIndex]}
                          alt={`第 ${page.sourceIndex + 1} 页`}
                          style={{ transform: `rotate(${page.rotation}deg)` }}
                        />
                      ) : (
                        <span className="page-placeholder">
                          <Loader2 size={15} className="spin" />
                        </span>
                      )}
                    </div>
                    <div className="page-card-actions">
                      <button type="button" title="逆时针旋转" onClick={() => rotate(page.id, -90)}>
                        <RotateCcw size={14} />
                      </button>
                      <button type="button" title="顺时针旋转" onClick={() => rotate(page.id, 90)}>
                        <RotateCw size={14} />
                      </button>
                      <button type="button" title="删除页面" className="page-delete" onClick={() => remove(page.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {loading && thumbs.length > 0 && (
              <div className="thumbnail-progress">
                正在生成预览 · {Math.round(loadProgress * 100)}%
              </div>
            )}
          </section>
        )}

        <div className="privacy-strip">
          <span className="privacy-dot" />
          <div>
            <strong>原始文件不会被修改</strong>
            <span>所有删除与旋转会写入一份新的 PDF。</span>
          </div>
        </div>
      </div>

      <aside className="tool-rail">
        <div className="rail-card">
          <span className="rail-kicker">ORGANIZE</span>
          <h3>{pages.length ? `${pages.length} 页待整理` : '等待文件'}</h3>
          <div className="rail-summary">
            <div>
              <span>当前顺序</span>
              <strong>{pages.length ? `1 → ${pages.length}` : '—'}</strong>
            </div>
            <div>
              <span>旋转</span>
              <strong>{pages.filter((p) => p.rotation).length} 页</strong>
            </div>
            <div>
              <span>删除</span>
              <strong>{Math.max(0, deleted)} 页</strong>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="rail-action"
            disabled={!file || !pages.length || loading}
            icon={<Sparkles size={17} />}
            onClick={() => void start()}
          >
            保存整理结果
          </Button>
          <span className="rail-foot">输出为新文件，原文件保持原样</span>
        </div>
      </aside>
    </div>
  )
}
