import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, ShieldAlert } from 'lucide-react'

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Renderer error', error, info)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="crash-screen">
          <div className="crash-card">
            <span className="crash-icon">
              <ShieldAlert size={22} />
            </span>
            <span className="eyebrow">SOMETHING WENT QUIET</span>
            <h1>页面遇到了一点问题</h1>
            <p>文件没有上传，也不会丢失到别处。重新载入即可回到工作台。</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>
              <RotateCcw size={16} />
              重新载入
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
