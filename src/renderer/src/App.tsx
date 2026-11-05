import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import type { RecentFile } from '../../shared/types'
import type { ToolId } from './lib/tools'
import { TOOL_MAP } from './lib/tools'
import { kindOf } from './lib/files'
import type { WorkFile } from './lib/files'
import type { OpOutput } from './lib/pdfOps'
import { applySettings, loadSettings, saveSettings, type AppSettings } from './lib/settings'
import { TitleBar } from './components/TitleBar'
import { Sidebar, type RouteName } from './components/Sidebar'
import { HomePage } from './components/HomePage'
import { ToolsPage } from './components/ToolsPage'
import { RecentPage } from './components/RecentPage'
import { SettingsPage } from './components/SettingsPage'
import { AboutPage } from './components/AboutPage'
import { ToolPage } from './components/ToolPage'

type Route = { name: RouteName; tool?: ToolId }

interface ToastItem {
  id: number
  message: string
  tone: 'info' | 'success' | 'error'
}

const RECENT_KEY = 'qingjian.recent.v1'

function loadRecents(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RecentFile[]) : []
  } catch {
    return []
  }
}

export default function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [recents, setRecents] = useState<RecentFile[]>(() => loadRecents())
  const [initialFiles, setInitialFiles] = useState<WorkFile[] | undefined>()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastId = useRef(0)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    applySettings(settings)
    saveSettings(settings)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const syncSystemMode = (): void => {
      if (settings.appearance === 'system') applySettings(settings)
    }
    media.addEventListener('change', syncSystemMode)
    return () => media.removeEventListener('change', syncSystemMode)
  }, [settings])

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [route])

  const notify = useCallback((message: string, tone: 'info' | 'success' | 'error' = 'info') => {
    toastId.current += 1
    const id = toastId.current
    setToasts((current) => [...current.slice(-2), { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, tone === 'error' ? 5200 : 3200)
  }, [])

  const addRecent = useCallback(
    (file: { path: string; name: string; size: number }, toolId?: string) => {
      if (!settings.rememberRecent || !file.path) return
      setRecents((current) => {
        const next = [
          { path: file.path, name: file.name, size: file.size, toolId, at: Date.now() },
          ...current.filter((item) => item.path !== file.path)
        ].slice(0, 24)
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
        return next
      })
    },
    [settings.rememberRecent]
  )

  const openTool = (toolId: ToolId, files?: WorkFile[]): void => {
    setInitialFiles(files?.length ? files : undefined)
    setRoute({ name: 'tool', tool: toolId })
  }

  const openRecent = async (recent: RecentFile): Promise<void> => {
    try {
      const opened = await window.desktop.openPath(recent.path)
      const file: WorkFile = {
        id: `recent_${Date.now()}`,
        name: opened.name,
        size: opened.size,
        bytes: new Uint8Array(opened.data),
        path: opened.path,
        kind: kindOf(opened.name)
      }
      const toolId = (recent.toolId as ToolId | undefined) || 'pdfToWord'
      if (!TOOL_MAP[toolId] || !TOOL_MAP[toolId].accepts.includes(file.kind as never)) {
        const error = await window.desktop.openLocalFile(recent.path)
        if (error) notify('无法打开这个文件，可能已被移动', 'error')
        return
      }
      openTool(toolId, [file])
    } catch {
      notify('找不到这个文件，可能已被移动或删除', 'error')
    }
  }

  const onSaved = (output: OpOutput, path: string, name: string): void => {
    if (route.name === 'tool' && route.tool) {
      addRecent({ path, name, size: output.bytes.byteLength }, route.tool)
    }
  }

  const clearRecents = (): void => {
    setRecents([])
    localStorage.removeItem(RECENT_KEY)
    notify('最近记录已清空', 'success')
  }

  const navigate = (target: RouteName, tool?: ToolId): void => {
    if (target === 'tool' && tool) {
      setInitialFiles(undefined)
      setRoute({ name: 'tool', tool })
    } else {
      setRoute({ name: target })
    }
  }

  const content = useMemo(() => {
    switch (route.name) {
      case 'tools':
        return <ToolsPage onOpenTool={(toolId) => openTool(toolId)} />
      case 'recent':
        return (
          <RecentPage
            recents={recents}
            onOpen={(recent) => void openRecent(recent)}
            onReveal={(path) => void window.desktop.revealPath(path)}
            onClear={clearRecents}
          />
        )
      case 'settings':
        return <SettingsPage settings={settings} onChange={setSettings} />
      case 'about':
        return <AboutPage />
      case 'tool':
        return route.tool ? (
          <ToolPage
            key={`${route.tool}-${initialFiles?.[0]?.id ?? 'blank'}`}
            tool={TOOL_MAP[route.tool]}
            initialFiles={initialFiles}
            onBack={() => setRoute({ name: 'tools' })}
            onHome={() => setRoute({ name: 'home' })}
            onSaved={onSaved}
            notify={notify}
          />
        ) : null
      case 'home':
      default:
        return (
          <HomePage
            onOpenTool={openTool}
            onOpenRecent={(recent) => void openRecent(recent)}
            recents={recents}
            onShowAll={() => setRoute({ name: 'tools' })}
          />
        )
    }
  }, [route, recents, settings, initialFiles, notify, onSaved])

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar route={route.name} currentTool={route.tool} onNavigate={navigate} />
        <main className="content-scroll" ref={contentRef}>
          {content}
          <footer className="app-footer">
            <span>青笺 PDF · 本机处理</span>
            <span className="footer-dot" />
            <span>把文件收拾得妥帖</span>
          </footer>
        </main>
      </div>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.tone === 'success' ? (
              <CheckCircle2 size={16} />
            ) : toast.tone === 'error' ? (
              <TriangleAlert size={16} />
            ) : (
              <Info size={16} />
            )}
            <span>{toast.message}</span>
            <button
              type="button"
              aria-label="关闭提示"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
