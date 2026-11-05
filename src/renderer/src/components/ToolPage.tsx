import { useCallback, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FolderOpen,
  Lock,
  Save,
  ShieldCheck,
  Sparkles
} from 'lucide-react'
import type { WorkFile } from '../lib/files'
import { formatBytes } from '../lib/files'
import type { OpOutput, ProgressFn } from '../lib/pdfOps'
import type { ToolDef } from '../lib/tools'
import { friendlyError } from '../lib/errors'
import { TOOL_GROUP } from '../lib/tools'
import { ToolGlyph } from './ToolGlyph'
import { Button } from './ui'
import { GenericTool } from './tools/GenericTool'
import { OrganizeTool } from './tools/OrganizeTool'
import { CropTool } from './tools/CropTool'
import { EditTool } from './tools/EditTool'
import { SignTool } from './tools/SignTool'
import { RedactTool } from './tools/RedactTool'
import { ScanTool } from './tools/ScanTool'
import { CompareTool } from './tools/CompareTool'
import { HtmlTool } from './tools/HtmlTool'

export type RunTask = (
  task: (progress: ProgressFn) => Promise<OpOutput>,
  originalName: string
) => Promise<void>

interface ToolPageProps {
  tool: ToolDef
  initialFiles?: WorkFile[]
  onBack: () => void
  onHome: () => void
  onSaved: (output: OpOutput, path: string, name: string) => void
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

type Phase = 'idle' | 'running' | 'done'

export function ToolPage({
  tool,
  initialFiles,
  onBack,
  onHome,
  onSaved,
  notify
}: ToolPageProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<{ ratio: number; label: string }>({ ratio: 0, label: '' })
  const [result, setResult] = useState<OpOutput | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [runKey, setRunKey] = useState(0)

  const run: RunTask = useCallback(async (task, _originalName) => {
    setPhase('running')
    setProgress({ ratio: 0.02, label: '正在准备…' })
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    try {
      const output = await task((ratio, label) => {
        setProgress({ ratio: Math.max(0, Math.min(1, ratio)), label })
      })
      setResult(output)
      setSavedPath(null)
      setPhase('done')
    } catch (error) {
      console.error(error)
      setPhase('idle')
      notify(friendlyError(error), 'error')
    }
  }, [notify])

  const save = async (): Promise<void> => {
    if (!result) return
    setSaveBusy(true)
    try {
      const ext = result.fileName.split('.').pop()?.toLowerCase() || 'pdf'
      const saved = await window.desktop.saveFile(
        {
          title: '保存处理结果',
          defaultName: result.fileName,
          filters: [{ name: `${ext.toUpperCase()} 文件`, extensions: [ext] }]
        },
        result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength) as ArrayBuffer
      )
      if (saved) {
        setSavedPath(saved.path)
        onSaved(result, saved.path, saved.name)
        notify('文件已保存', 'success')
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '保存失败', 'error')
    } finally {
      setSaveBusy(false)
    }
  }

  const reset = (): void => {
    setResult(null)
    setSavedPath(null)
    setPhase('idle')
    setRunKey((key) => key + 1)
  }

  const group = TOOL_GROUP[tool.group]

  return (
    <div className="page tool-page">
      <div className="tool-heading">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft size={15} />
          返回
        </button>
        <div className="tool-heading-main">
          <span className="tool-heading-icon">
            <ToolGlyph name={tool.icon} size={22} />
          </span>
          <div>
            <span className="tool-breadcrumb">{group.title}</span>
            <h1>{tool.title}</h1>
          </div>
        </div>
        <p className="tool-heading-desc">{tool.subtitle}</p>
        <span className="local-chip">
          <Lock size={12} />
          本机处理
        </span>
      </div>

      <div className="tool-stage">
        <div className={result ? 'tool-body tool-body-hidden' : 'tool-body'}>
          {renderTool()}
        </div>
        {result && phase === 'done' && (
          <ResultPanel
            tool={tool}
            result={result}
            savedPath={savedPath}
            saveBusy={saveBusy}
            onSave={() => void save()}
            onReset={reset}
            onHome={onHome}
            onReveal={() => savedPath && void window.desktop.revealPath(savedPath)}
          />
        )}
        {phase === 'running' && (
          <div className="processing-overlay" role="status" aria-live="polite">
            <div className="processing-card">
              <div className="processing-top">
                <span className="processing-icon">
                  <Sparkles size={19} />
                </span>
                <div>
                  <strong>{tool.title}</strong>
                  <span>正在本机处理，请保持窗口打开</span>
                </div>
                <span className="processing-percent">{Math.round(progress.ratio * 100)}%</span>
              </div>
              <div className="progress-track">
                <span style={{ width: `${Math.max(3, progress.ratio * 100)}%` }} />
              </div>
              <div className="processing-label">{progress.label || '正在处理…'}</div>
              <div className="processing-foot">
                <ShieldCheck size={13} />
                文件不会离开这台电脑
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  function renderTool(): React.JSX.Element {
    const shared = { tool, initialFiles, run, notify }
    switch (tool.id) {
      case 'organize':
        return <OrganizeTool key={runKey} {...shared} />
      case 'crop':
        return <CropTool key={runKey} {...shared} />
      case 'edit':
        return <EditTool key={runKey} {...shared} />
      case 'sign':
        return <SignTool key={runKey} {...shared} />
      case 'redact':
        return <RedactTool key={runKey} {...shared} />
      case 'scan':
        return <ScanTool key={runKey} {...shared} />
      case 'compare':
        return <CompareTool key={runKey} {...shared} />
      case 'htmlToPdf':
        return <HtmlTool key={runKey} {...shared} />
      default:
        return <GenericTool key={runKey} {...shared} />
    }
  }
}

function ResultPanel({
  tool,
  result,
  savedPath,
  saveBusy,
  onSave,
  onReset,
  onHome,
  onReveal
}: {
  tool: ToolDef
  result: OpOutput
  savedPath: string | null
  saveBusy: boolean
  onSave: () => void
  onReset: () => void
  onHome: () => void
  onReveal: () => void
}): React.JSX.Element {
  return (
    <div className="result-panel">
      <div className="result-mark">
        <CheckCircle2 size={30} strokeWidth={1.5} />
      </div>
      <span className="result-kicker">
        <Check size={12} /> DONE
      </span>
      <h2>{savedPath ? '文件已妥帖保存' : '处理完成'}</h2>
      <p className="result-summary">{result.summary}</p>

      <div className="result-file">
        <span className="result-file-icon">
          <ToolGlyph name={tool.icon} size={20} />
        </span>
        <div className="result-file-copy">
          <strong>{result.fileName}</strong>
          <span>
            {formatBytes(result.bytes.byteLength)} · {result.mime.split('/').pop()?.toUpperCase()}
          </span>
        </div>
        {savedPath && (
          <span className="saved-tag">
            <Check size={12} /> 已保存
          </span>
        )}
      </div>

      {savedPath && (
        <button type="button" className="saved-path" onClick={onReveal} title={savedPath}>
          <FolderOpen size={14} />
          <span>{savedPath}</span>
          <ArrowRight size={13} />
        </button>
      )}

      {result.notes && result.notes.length > 0 && (
        <ul className="result-notes">
          {result.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <div className="result-actions">
        <Button
          variant="primary"
          size="lg"
          icon={savedPath ? <FolderOpen size={17} /> : <Save size={17} />}
          loading={saveBusy}
          onClick={savedPath ? onReveal : onSave}
        >
          {savedPath ? '打开所在文件夹' : '保存文件'}
        </Button>
        {savedPath && (
          <Button variant="secondary" size="lg" icon={<Save size={16} />} onClick={onSave}>
            另存一份
          </Button>
        )}
        <Button variant="ghost" size="lg" onClick={onReset}>
          继续处理
        </Button>
        <Button variant="ghost" size="lg" onClick={onHome}>
          回到工作台
        </Button>
      </div>
      <p className="result-privacy">
        <ShieldCheck size={13} />
        结果只存在于当前窗口，关闭前请保存。
      </p>
    </div>
  )
}
