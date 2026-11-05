import { ArrowUpRight, Clock3, FileText, FolderOpen, Trash2 } from 'lucide-react'
import type { RecentFile } from '../../../shared/types'
import { formatBytes } from '../lib/files'
import { TOOL_MAP, type ToolId } from '../lib/tools'
import { Button } from './ui'

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minute = 60_000
  if (diff < minute) return '刚刚'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`
  const date = new Date(timestamp)
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

export function RecentPage({
  recents,
  onOpen,
  onReveal,
  onClear
}: {
  recents: RecentFile[]
  onOpen: (recent: RecentFile) => void
  onReveal: (path: string) => void
  onClear: () => void
}): React.JSX.Element {
  return (
    <div className="page recent-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            <Clock3 size={13} />
            RECENT
          </span>
          <h1>最近处理</h1>
          <p className="page-lead">只记录文件位置与处理时间，不保存文件内容。换一台电脑就不会再看到。</p>
        </div>
        {recents.length > 0 && (
          <Button variant="ghost" size="sm" icon={<Trash2 size={15} />} onClick={onClear}>
            清空记录
          </Button>
        )}
      </div>

      {!recents.length ? (
        <div className="empty-state empty-state-large">
          <span className="empty-illustration">
            <Clock3 size={26} strokeWidth={1.4} />
          </span>
          <h3>还没有记录</h3>
          <p>处理过的文件会安静地出现在这里，方便你随时继续。</p>
        </div>
      ) : (
        <div className="recent-table">
          <div className="recent-table-head">
            <span>文件</span>
            <span>处理方式</span>
            <span>大小</span>
            <span>时间</span>
            <span />
          </div>
          {recents.map((recent) => (
            <div className="recent-table-row" key={`${recent.path}-${recent.at}`}>
              <button type="button" className="recent-file" onClick={() => onOpen(recent)}>
                <span className="recent-file-badge">
                  <FileText size={17} />
                </span>
                <span className="recent-file-name">
                  <strong>{recent.name}</strong>
                  <small title={recent.path}>{recent.path}</small>
                </span>
              </button>
              <span className="recent-tool">
                {recent.toolId ? TOOL_MAP[recent.toolId as ToolId]?.title : 'PDF 文件'}
              </span>
              <span className="recent-size">{formatBytes(recent.size)}</span>
              <span className="recent-time">{relativeTime(recent.at)}</span>
              <span className="recent-actions">
                <button type="button" title="在文件夹中显示" onClick={() => onReveal(recent.path)}>
                  <FolderOpen size={15} />
                </button>
                <button type="button" title="继续处理" onClick={() => onOpen(recent)}>
                  <ArrowUpRight size={15} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
