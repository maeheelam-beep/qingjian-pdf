import { useMemo, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { TOOLS, TOOL_GROUPS, type ToolGroupId, type ToolId } from '../lib/tools'
import { ToolCard } from './ToolCard'

const GROUPS: { id: ToolGroupId | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  ...TOOL_GROUPS.map((group) => ({ id: group.id, label: group.title }))
]

export function ToolsPage({ onOpenTool }: { onOpenTool: (tool: ToolId) => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<ToolGroupId | 'all'>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return TOOLS.filter((tool) => {
      const inGroup = group === 'all' || tool.group === group
      if (!inGroup) return false
      if (!q) return true
      return (
        tool.title.toLowerCase().includes(q) ||
        tool.subtitle.toLowerCase().includes(q) ||
        tool.keywords.some((keyword) => keyword.toLowerCase().includes(q))
      )
    })
  }, [query, group])

  return (
    <div className="page tools-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            <SlidersHorizontal size={13} />
            TOOLBOX · 27 个工具
          </span>
          <h1>所有工具</h1>
          <p className="page-lead">从整理页面到安全归档，常用的 PDF 工作都在这里。全部在本机完成。</p>
        </div>
        <div className="search-box">
          <Search size={16} />
          <input
            value={query}
            placeholder="搜索工具，例如「压缩」「签名」"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索工具"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="清除搜索">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="filter-bar">
        {GROUPS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`filter-chip ${group === item.id ? 'is-active' : ''}`}
            onClick={() => setGroup(item.id)}
          >
            {item.label}
            {item.id !== 'all' && (
              <span>{TOOLS.filter((tool) => tool.group === item.id).length}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length ? (
        <div className="tool-grid">
          {filtered.map((tool) => (
            <ToolCard key={tool.id} tool={tool} onClick={() => onOpenTool(tool.id)} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-state-mark">∅</span>
          <h3>没有找到相关工具</h3>
          <p>换一个关键词，或者查看全部工具。</p>
          <button type="button" className="text-action" onClick={() => { setQuery(''); setGroup('all') }}>
            清除筛选
          </button>
        </div>
      )}
    </div>
  )
}
