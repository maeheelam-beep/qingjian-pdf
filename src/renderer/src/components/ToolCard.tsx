import { ArrowUpRight } from 'lucide-react'
import type { ToolDef } from '../lib/tools'
import { ToolGlyph } from './ToolGlyph'

export function ToolCard({
  tool,
  onClick,
  compact
}: {
  tool: ToolDef
  onClick: () => void
  compact?: boolean
}): React.JSX.Element {
  return (
    <button type="button" className={`tool-card ${compact ? 'tool-card-compact' : ''}`} onClick={onClick}>
      <span className="tool-card-icon">
        <ToolGlyph name={tool.icon} size={compact ? 17 : 20} />
      </span>
      <span className="tool-card-copy">
        <strong>{tool.title}</strong>
        <span>{tool.subtitle}</span>
      </span>
      {!compact && (
        <span className="tool-card-foot">
          <span>{tool.time}</span>
          <ArrowUpRight size={15} className="tool-card-arrow" />
        </span>
      )}
    </button>
  )
}
