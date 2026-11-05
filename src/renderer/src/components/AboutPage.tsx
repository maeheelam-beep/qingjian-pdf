import { useEffect, useState } from 'react'
import { ArrowUpRight, Heart, MonitorCheck, ShieldCheck } from 'lucide-react'
import type { AppInfo } from '../../../shared/types'
import { Logo } from './Logo'

export function AboutPage(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    void window.desktop.getAppInfo().then(setInfo)
  }, [])

  return (
    <div className="page about-page">
      <div className="about-hero">
        <Logo size={56} />
        <div className="about-title">
          <span className="eyebrow">ABOUT</span>
          <h1>青笺 PDF</h1>
          <p>把 PDF 收拾得妥帖，也让眼睛舒服一点。</p>
        </div>
        <span className="about-version">v{info?.version ?? '1.0.0'}</span>
      </div>

      <div className="about-grid">
        <section className="about-card about-manifesto">
          <span className="section-kicker">WHY</span>
          <h2>为什么是「青笺」</h2>
          <p>
            青笺是一款完全在本机运行的 PDF 工具。没有账号体系，没有上传队列，也没有等待下载的焦虑。
            它不追求炫目的界面，只希望把常用的工作做得安静、清楚、可靠。
          </p>
          <p>
            配色取自纸张与苔藓：浅色是暖白底与墨绿字，深色是低光的墨夜与提亮的苔绿。
            窗口去掉边框，让内容更靠近你；工具栏留出呼吸感，适合连续处理一整个下午。
          </p>
          <div className="manifesto-sign">Qingjian · 2026</div>
        </section>

        <section className="about-card">
          <span className="section-kicker">PRIVACY</span>
          <h2>文件不出门</h2>
          <div className="about-points">
            <div>
              <ShieldCheck size={17} />
              <span>文档处理全部在本地内存中完成</span>
            </div>
            <div>
              <MonitorCheck size={17} />
              <span>不连接云端账号，不上传任何文件</span>
            </div>
            <div>
              <Heart size={17} />
              <span>没有广告、追踪脚本与隐藏收费</span>
            </div>
          </div>
          <p className="about-fineprint">最近记录只包含文件路径与工具名称，可在「偏好设置」中关闭。</p>
        </section>

        <section className="about-card">
          <span className="section-kicker">ENGINE</span>
          <h2>站在开源之上</h2>
          <p className="about-fineprint">
            青笺使用 PDF.js 渲染页面，@cantoo/pdf-lib 处理文档结构与加密，Tesseract.js
            完成离线文字识别，docx、ExcelJS、PptxGenJS 负责 Office 输出。
          </p>
          <div className="engine-tags">
            <span>PDF.js</span>
            <span>pdf-lib</span>
            <span>Tesseract.js</span>
            <span>Electron</span>
            <span>React</span>
          </div>
        </section>

        <section className="about-card about-meta">
          <span className="section-kicker">DETAILS</span>
          <h2>版本信息</h2>
          <dl>
            <div>
              <dt>版本</dt>
              <dd>{info?.version ?? '—'}</dd>
            </div>
            <div>
              <dt>运行环境</dt>
              <dd>Electron {info?.electron ?? '—'}</dd>
            </div>
            <div>
              <dt>平台</dt>
              <dd>{info?.platform === 'win32' ? 'Windows' : info?.platform ?? '—'}</dd>
            </div>
            <div>
              <dt>工具数量</dt>
              <dd>27 项</dd>
            </div>
          </dl>
          <button
            type="button"
            className="text-action"
            onClick={() => void window.desktop.openExternal('https://www.ilovepdf.com/zh-cn')}
          >
            功能结构参考 iLovePDF <ArrowUpRight size={14} />
          </button>
          <p className="about-fineprint">青笺与 iLovePDF 无隶属关系，仅作为工具分类的参考。</p>
        </section>
      </div>
    </div>
  )
}
