import { useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Clock3,
  FileText,
  FolderOpen,
  ShieldCheck,
  Sparkles,
  Upload,
  X
} from 'lucide-react'
import { fileToWorkFile, formatBytes, kindOf, type WorkFile } from '../lib/files'
import {
  QUICK_TOOL_IDS,
  TOOLS,
  TOOL_GROUPS,
  TOOL_MAP,
  type ToolId
} from '../lib/tools'
import type { RecentFile } from '../../../shared/types'
import { ToolCard } from './ToolCard'
import { ToolGlyph } from './ToolGlyph'
import { Button } from './ui'
import { FileThumb } from './FilePicker'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function dateLabel(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(new Date())
}

export function HomePage({
  onOpenTool,
  onOpenRecent,
  recents,
  onShowAll
}: {
  onOpenTool: (tool: ToolId, files?: WorkFile[]) => void
  onOpenRecent: (recent: RecentFile) => void
  recents: RecentFile[]
  onShowAll: () => void
}): React.JSX.Element {
  const [pending, setPending] = useState<WorkFile[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const recommended = useMemo<ToolId[]>(() => {
    if (!pending.length) return []
    const kinds = new Set(pending.map((file) => file.kind))
    if (kinds.has('image')) return ['jpgToPdf', 'scan', 'pdfToJpg']
    if (kinds.has('office')) return ['officeToPdf']
    if (kinds.has('html')) return ['htmlToPdf']
    if (pending.length > 1) return ['merge', 'split', 'compress']
    return ['pdfToWord', 'compress', 'edit', 'sign', 'split']
  }, [pending])

  const addFiles = async (files: File[]): Promise<void> => {
    if (!files.length) return
    const converted = await Promise.all(files.map(fileToWorkFile))
    const accepted = converted.filter((file) => ['pdf', 'image', 'office', 'html'].includes(file.kind))
    if (!accepted.length) return
    setPending((current) => {
      const existing = new Set(current.map((f) => `${f.name}:${f.size}`))
      return [...current, ...accepted.filter((f) => !existing.has(`${f.name}:${f.size}`))].slice(0, 30)
    })
  }

  const pick = async (): Promise<void> => {
    const opened = await window.desktop.openFiles({
      title: '选择文件',
      filters: [
        { name: '常用文件', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'docx', 'xlsx', 'pptx', 'html'] },
        { name: '全部文件', extensions: ['*'] }
      ],
      multiple: true
    })
    if (!opened.length) return
    setPending((current) => {
      const next = opened.map((item) => ({
        id: `home_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: item.name,
        size: item.size,
        bytes: new Uint8Array(item.data),
        path: item.path,
        kind: kindOf(item.name)
      }))
      return [...current, ...next].slice(0, 30)
    })
  }

  const start = (tool: ToolId): void => {
    onOpenTool(tool, pending)
    setPending([])
  }

  return (
    <div className="page home-page">
      <div className="home-head">
        <div>
          <span className="eyebrow">
            <Sparkles size={13} />
            {dateLabel()}
          </span>
          <h1>
            {greeting()}，<span>把文件交给青笺。</span>
          </h1>
          <p className="page-lead">干净、安静的本地 PDF 工坊。文件不上传，处理完即走。</p>
        </div>
        <div className="home-head-mark">
          <span className="mark-line" />
          <span>LOCAL · PRIVATE · CALM</span>
        </div>
      </div>

      <section
        className={`home-drop ${dragging ? 'is-dragging' : ''} ${pending.length ? 'has-files' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void addFiles([...e.dataTransfer.files])
        }}
      >
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.pptx,.html,.htm"
          onChange={(e) => {
            void addFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        {!pending.length ? (
          <>
            <div className="home-drop-orb">
              <Upload size={24} strokeWidth={1.5} />
              <span className="orb-ring" />
            </div>
            <div className="home-drop-copy">
              <h2>把文件放进来</h2>
              <p>拖拽 PDF、图片或 Office 文档到这里，青笺会为你推荐合适的工具。</p>
            </div>
            <div className="home-drop-actions">
              <Button variant="primary" icon={<FolderOpen size={16} />} onClick={() => void pick()}>
                选择文件
              </Button>
              <span className="drop-hint">也可以直接拖入</span>
            </div>
            <div className="home-drop-foot">
              <span>合并</span>
              <i />
              <span>拆分</span>
              <i />
              <span>转换</span>
              <i />
              <span>编辑</span>
              <i />
              <span>签署</span>
            </div>
          </>
        ) : (
          <div className="home-queued">
            <div className="home-queued-head">
              <div>
                <span className="eyebrow">
                  <FileText size={13} />
                  已放入 {pending.length} 个文件
                </span>
                <h2>接下来想做什么？</h2>
              </div>
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  setPending([])
                  inputRef.current?.click()
                }}
              >
                <Upload size={14} /> 重新选择
              </button>
            </div>
            <div className="queued-files">
              {pending.slice(0, 4).map((file) => (
                <div className="queued-file" key={file.id}>
                  <FileThumb file={file} size="sm" />
                  <div>
                    <strong>{file.name}</strong>
                    <span>{formatBytes(file.size)}</span>
                  </div>
                  <button
                    type="button"
                    aria-label="移除"
                    onClick={() => setPending((items) => items.filter((item) => item.id !== file.id))}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {pending.length > 4 && (
                <div className="queued-more">
                  <span>+{pending.length - 4}</span>
                  <small>更多</small>
                </div>
              )}
            </div>
            <div className="recommend-row">
              <span className="recommend-label">推荐</span>
              {recommended.map((toolId, index) => {
                const tool = TOOL_MAP[toolId]
                return (
                  <button
                    key={toolId}
                    type="button"
                    className={`recommend-chip ${index === 0 ? 'is-primary' : ''}`}
                    onClick={() => start(toolId)}
                  >
                    <ToolGlyph name={tool.icon} size={15} />
                    {tool.title}
                    {index === 0 && <ArrowRight size={14} />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <section className="home-section">
        <div className="section-head">
          <div>
            <span className="section-kicker">QUICK</span>
            <h2>常用工具</h2>
          </div>
          <button type="button" className="text-action" onClick={onShowAll}>
            查看全部 <ArrowRight size={14} />
          </button>
        </div>
        <div className="quick-grid">
          {QUICK_TOOL_IDS.map((toolId) => (
            <ToolCard key={toolId} tool={TOOL_MAP[toolId]} compact onClick={() => onOpenTool(toolId)} />
          ))}
        </div>
      </section>

      <div className="home-columns">
        <section className="home-section home-toolbox">
          <div className="section-head">
            <div>
              <span className="section-kicker">TOOLBOX</span>
              <h2>按场景找工具</h2>
            </div>
          </div>
          <div className="group-list">
            {TOOL_GROUPS.map((group) => {
              const tools = TOOLS.filter((tool) => tool.group === group.id)
              return (
                <button
                  key={group.id}
                  type="button"
                  className="group-row"
                  onClick={onShowAll}
                >
                  <span className="group-row-index">{String(TOOL_GROUPS.indexOf(group) + 1).padStart(2, '0')}</span>
                  <span className="group-row-main">
                    <strong>{group.title}</strong>
                    <span>{group.description}</span>
                  </span>
                  <span className="group-row-tools">
                    {tools.slice(0, 3).map((tool) => (
                      <span key={tool.id} className="mini-tool-icon" title={tool.title}>
                        <ToolGlyph name={tool.icon} size={14} />
                      </span>
                    ))}
                    {tools.length > 3 && <span className="group-count">+{tools.length - 3}</span>}
                  </span>
                  <ArrowRight size={15} className="group-arrow" />
                </button>
              )
            })}
          </div>
        </section>

        <aside className="home-aside">
          <section className="aside-card recent-card">
            <div className="aside-card-head">
              <span className="section-kicker">RECENT</span>
              <Clock3 size={15} />
            </div>
            <h3>最近处理</h3>
            {!recents.length ? (
              <div className="recent-empty">
                <span className="recent-empty-icon">
                  <Clock3 size={17} />
                </span>
                <p>还没有处理记录。打开一份文件，青笺会安静地记住它。</p>
              </div>
            ) : (
              <div className="recent-list">
                {recents.slice(0, 4).map((recent) => (
                  <button
                    key={`${recent.path}-${recent.at}`}
                    type="button"
                    className="recent-row"
                    onClick={() => onOpenRecent(recent)}
                  >
                    <span className="recent-file-icon">
                      <FileText size={16} />
                    </span>
                    <span className="recent-copy">
                      <strong>{recent.name}</strong>
                      <small>
                        {recent.toolId ? TOOL_MAP[recent.toolId as ToolId]?.title : 'PDF'} · {formatBytes(recent.size)}
                      </small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="aside-card promise-card">
            <div className="promise-icon">
              <ShieldCheck size={18} />
            </div>
            <h3>只在你的电脑上</h3>
            <p>没有账号、没有上传、没有后台。关闭窗口，临时文件随之消失。</p>
            <span className="promise-line" />
            <small>青笺 · 本地优先</small>
          </section>
        </aside>
      </div>
    </div>
  )
}
