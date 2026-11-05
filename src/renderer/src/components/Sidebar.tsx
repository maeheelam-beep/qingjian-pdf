import {
  Clock3,
  Grid2X2,
  House,
  Info,
  Settings2,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import type { ToolId } from '../lib/tools'
import { TOOL_MAP } from '../lib/tools'
import { ToolGlyph } from './ToolGlyph'

export type RouteName = 'home' | 'tools' | 'recent' | 'settings' | 'about' | 'tool'

interface NavItem {
  id: RouteName
  label: string
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { id: 'home', label: '工作台', icon: House },
  { id: 'tools', label: '全部工具', icon: Grid2X2 },
  { id: 'recent', label: '最近处理', icon: Clock3 }
]

const FAVORITES: ToolId[] = ['merge', 'compress', 'pdfToWord', 'sign']

export function Sidebar({
  route,
  currentTool,
  onNavigate
}: {
  route: RouteName
  currentTool?: ToolId
  onNavigate: (target: RouteName, tool?: ToolId) => void
}): React.JSX.Element {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav" aria-label="主导航">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = route === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${active ? 'is-active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={17} strokeWidth={1.7} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-caption">
          <span>顺手工具</span>
          <Sparkles size={12} />
        </div>
        <div className="favorite-list">
          {FAVORITES.map((toolId) => {
            const tool = TOOL_MAP[toolId]
            return (
              <button
                key={toolId}
                type="button"
                className={`favorite-item ${currentTool === toolId ? 'is-active' : ''}`}
                onClick={() => onNavigate('tool', toolId)}
              >
                <span className="favorite-icon">
                  <ToolGlyph name={tool.icon} size={15} />
                </span>
                <span>{tool.title.replace(' PDF', '')}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="sidebar-spacer" />

      <div className="sidebar-foot">
        <button
          type="button"
          className={`nav-item nav-item-quiet ${route === 'settings' ? 'is-active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          <Settings2 size={16} strokeWidth={1.7} />
          <span>偏好设置</span>
        </button>
        <button
          type="button"
          className={`nav-item nav-item-quiet ${route === 'about' ? 'is-active' : ''}`}
          onClick={() => onNavigate('about')}
        >
          <Info size={16} strokeWidth={1.7} />
          <span>关于青笺</span>
        </button>
        <div className="local-note">
          <span className="local-dot" />
          <div>
            <strong>离线可用</strong>
            <p>文件只在内存中处理</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
