import { useEffect, useState } from 'react'
import { Copy, Minus, ShieldCheck, Square, X } from 'lucide-react'
import { Wordmark } from './Logo'

export function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.desktop.windowIsMaximized().then(setMaximized)
    return window.desktop.onMaximizedChange(setMaximized)
  }, [])

  return (
    <header
      className="titlebar"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('.window-controls')) return
        window.desktop.windowToggleMaximize()
      }}
    >
      <div className="titlebar-brand">
        <Wordmark />
      </div>
      <div className="titlebar-center">
        <span className="privacy-pill">
          <ShieldCheck size={13} strokeWidth={1.8} />
          全程本机处理，文件不会上传
        </span>
      </div>
      <div className="titlebar-drag" />
      <div className="window-controls">
        <button
          type="button"
          className="window-control"
          aria-label="最小化"
          title="最小化"
          onClick={() => window.desktop.windowMinimize()}
        >
          <Minus size={15} strokeWidth={1.6} />
        </button>
        <button
          type="button"
          className="window-control"
          aria-label={maximized ? '还原' : '最大化'}
          title={maximized ? '还原' : '最大化'}
          onClick={() => window.desktop.windowToggleMaximize()}
        >
          {maximized ? <Copy size={12} strokeWidth={1.6} /> : <Square size={11} strokeWidth={1.6} />}
        </button>
        <button
          type="button"
          className="window-control window-control-close"
          aria-label="关闭"
          title="关闭"
          onClick={() => window.desktop.windowClose()}
        >
          <X size={16} strokeWidth={1.6} />
        </button>
      </div>
    </header>
  )
}
