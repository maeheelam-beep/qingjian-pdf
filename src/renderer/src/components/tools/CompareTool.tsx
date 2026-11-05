import { useEffect, useMemo, useState } from 'react'
import { FileDiff, GitCompareArrows, Loader2, Plus, Sparkles, X } from 'lucide-react'
import type { WorkFile } from '../../lib/files'
import { formatBytes, kindOf } from '../../lib/files'
import type { ToolDef } from '../../lib/tools'
import { comparePdfs } from '../../lib/convert'
import type { RunTask } from '../ToolPage'
import { FileThumb } from '../FilePicker'
import { Button, SectionTitle, Toggle } from '../ui'

interface CompareResult {
  pages: { index: number; ratio: number; changed: boolean; leftText: string; rightText: string; diff: string }[]
  leftPages: number
  rightPages: number
  different: number
}

export function CompareTool({
  tool,
  initialFiles,
  notify
}: {
  tool: ToolDef
  initialFiles?: WorkFile[]
  run: RunTask
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void
}): React.JSX.Element {
  const [left, setLeft] = useState<WorkFile | null>(initialFiles?.[0] ?? null)
  const [right, setRight] = useState<WorkFile | null>(initialFiles?.[1] ?? null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ ratio: 0, label: '' })
  const [result, setResult] = useState<CompareResult | null>(null)
  const [onlyChanges, setOnlyChanges] = useState(true)
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null)

  useEffect(() => {
    if (!initialFiles?.length) return
    setLeft(initialFiles[0] ?? null)
    setRight(initialFiles[1] ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = async (side: 'left' | 'right'): Promise<void> => {
    const opened = await window.desktop.openFiles({
      title: side === 'left' ? '选择旧版本' : '选择新版本',
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
      multiple: false
    })
    if (!opened.length) return
    const item = opened[0]
    const file: WorkFile = {
      id: `cmp_${Date.now()}_${side}`,
      name: item.name,
      size: item.size,
      bytes: new Uint8Array(item.data),
      path: item.path,
      kind: kindOf(item.name)
    }
    if (side === 'left') setLeft(file)
    else setRight(file)
    setResult(null)
  }

  const acceptDrop = async (side: 'left' | 'right', incoming: File[]): Promise<void> => {
    const file = incoming[0]
    if (!file) return
    if (kindOf(file.name) !== 'pdf') {
      notify('请拖入 PDF 文件', 'error')
      return
    }
    const converted = await fileToWork(file)
    if (side === 'left') setLeft(converted)
    else setRight(converted)
    setResult(null)
  }

  const start = async (): Promise<void> => {
    if (!left || !right) {
      notify('请分别选择两个 PDF 版本', 'error')
      return
    }
    setBusy(true)
    setProgress({ ratio: 0.03, label: '正在读取两个版本…' })
    try {
      const output = await comparePdfs(left, right, (ratio, label) => setProgress({ ratio, label }))
      setResult(output)
    } catch (error) {
      notify(error instanceof Error ? error.message : '对比失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const visiblePages = useMemo(
    () => (result ? result.pages.filter((page) => (onlyChanges ? page.changed : true)) : []),
    [result, onlyChanges]
  )

  return (
    <div className="generic-layout">
      <div className="tool-main">
        <section className="panel">
          <SectionTitle hint="左右各放一份 PDF">
            <span className="step-number">01</span> 选择两个版本
          </SectionTitle>
          <div className="compare-pickers">
            <CompareSlot
              side="left"
              label="旧版本"
              file={left}
              dragging={dragging === 'left'}
              onPick={() => void pick('left')}
              onDrop={(files) => void acceptDrop('left', files)}
              onDragState={(state) => setDragging(state ? 'left' : null)}
              onClear={() => {
                setLeft(null)
                setResult(null)
              }}
            />
            <span className="compare-vs">VS</span>
            <CompareSlot
              side="right"
              label="新版本"
              file={right}
              dragging={dragging === 'right'}
              onPick={() => void pick('right')}
              onDrop={(files) => void acceptDrop('right', files)}
              onDragState={(state) => setDragging(state ? 'right' : null)}
              onClear={() => {
                setRight(null)
                setResult(null)
              }}
            />
          </div>
        </section>

        {result && (
          <section className="panel compare-results">
            <div className="compare-summary">
              <div className="compare-summary-mark">
                <FileDiff size={23} />
              </div>
              <div>
                <span className="section-kicker">RESULT</span>
                <h3>
                  {result.different === 0 ? '两个版本内容一致' : `发现 ${result.different} 页存在差异`}
                </h3>
                <p>
                  旧版 {result.leftPages} 页 · 新版 {result.rightPages} 页 · 对比基于页面图像与文字内容
                </p>
              </div>
              <Toggle checked={onlyChanges} onChange={setOnlyChanges} label="只看差异页" />
            </div>
            <div className="compare-page-list">
              {visiblePages.map((page) => (
                <div key={page.index} className={`compare-page ${page.changed ? 'is-changed' : ''}`}>
                  <div className="compare-page-head">
                    <span className="compare-page-number">第 {page.index + 1} 页</span>
                    <span className={`compare-badge ${page.changed ? 'changed' : ''}`}>
                      {page.changed ? `差异 ${(page.ratio * 100).toFixed(1)}%` : '一致'}
                    </span>
                  </div>
                  <div className="compare-page-body">
                    <div className="compare-text old">
                      <span className="compare-text-label">旧版</span>
                      <p>{page.leftText || '（无文字）'}</p>
                    </div>
                    <div className="compare-text new">
                      <span className="compare-text-label">新版</span>
                      <p>{page.rightText || '（无文字）'}</p>
                    </div>
                  </div>
                  {page.changed && page.diff && <pre className="compare-diff">{page.diff}</pre>}
                </div>
              ))}
              {!visiblePages.length && (
                <div className="compare-empty">
                  <Sparkles size={18} /> 没有需要显示的差异页
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <aside className="tool-rail">
        <div className="rail-card">
          <span className="rail-kicker">COMPARE</span>
          <h3>{left && right ? '可以开始' : '等待两个版本'}</h3>
          <div className="rail-summary">
            <div>
              <span>文件</span>
              <strong>{left && right ? '2 份' : `${Number(Boolean(left)) + Number(Boolean(right))} / 2`}</strong>
            </div>
            <div>
              <span>方法</span>
              <strong>逐页 + 文字</strong>
            </div>
            <div>
              <span>结果</span>
              <strong>{result ? `${result.different} 页差异` : '—'}</strong>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="rail-action"
            disabled={!left || !right || busy}
            loading={busy}
            icon={<GitCompareArrows size={17} />}
            onClick={() => void start()}
          >
            开始对比
          </Button>
          <span className="rail-foot">对比结果不会写入原文件</span>
        </div>
        {busy && (
          <div className="rail-tip progress-tip">
            <Loader2 size={17} className="spin" />
            <div>
              <strong>{Math.round(progress.ratio * 100)}%</strong>
              <p>{progress.label}</p>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

function CompareSlot({
  side,
  label,
  file,
  dragging,
  onPick,
  onDrop,
  onDragState,
  onClear
}: {
  side: 'left' | 'right'
  label: string
  file: WorkFile | null
  dragging: boolean
  onPick: () => void
  onDrop: (files: File[]) => void
  onDragState: (dragging: boolean) => void
  onClear: () => void
}): React.JSX.Element {
  return (
    <div
      className={`compare-slot ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        onDragState(true)
      }}
      onDragLeave={() => onDragState(false)}
      onDrop={(event) => {
        event.preventDefault()
        onDragState(false)
        void onDrop([...event.dataTransfer.files])
      }}
    >
      <span className="compare-slot-label">{label}</span>
      {file ? (
        <>
          <div className="compare-file">
            <FileThumb file={file} size="md" />
            <div>
              <strong>{file.name}</strong>
              <span>{formatBytes(file.size)}</span>
            </div>
            <button type="button" onClick={onClear} aria-label="移除">
              <X size={14} />
            </button>
          </div>
          <button type="button" className="text-action" onClick={onPick}>
            更换文件
          </button>
        </>
      ) : (
        <button type="button" className="compare-empty-slot" onClick={onPick}>
          <span className="compare-empty-icon">
            <Plus size={18} />
          </span>
          <strong>放入{side === 'left' ? '旧版本' : '新版本'}</strong>
          <span>点击选择，或拖入 PDF</span>
        </button>
      )}
    </div>
  )
}

async function fileToWork(file: File): Promise<WorkFile> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return {
    id: `drop_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: file.name,
    size: file.size,
    bytes,
    kind: kindOf(file.name)
  }
}
