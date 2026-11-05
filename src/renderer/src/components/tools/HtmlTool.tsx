import { useState } from 'react'
import {
  Code2,
  FileCode2,
  Globe2,
  Link2,
  Sparkles,
  X
} from 'lucide-react'
import type { WorkFile } from '../../lib/files'
import { formatBytes, kindOf, stemOf } from '../../lib/files'
import type { ToolDef } from '../../lib/tools'
import type { RunTask } from '../ToolPage'
import { Button, Field, RangeField, SectionTitle, Segmented, Select, TextInput, Toggle } from '../ui'

type Source = 'url' | 'html' | 'file'

export function HtmlTool({
  tool,
  run,
  notify
}: {
  tool: ToolDef
  initialFiles?: WorkFile[]
  run: RunTask
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void
}): React.JSX.Element {
  const [source, setSource] = useState<Source>('url')
  const [url, setUrl] = useState('https://')
  const [html, setHtml] = useState(
    '<!doctype html>\n<html lang="zh-CN">\n<head><meta charset="utf-8"><title>我的文档</title></head>\n<body>\n  <h1>标题</h1>\n  <p>在这里粘贴一段 HTML。</p>\n</body>\n</html>'
  )
  const [local, setLocal] = useState<WorkFile | null>(null)
  const [pageSize, setPageSize] = useState<'A4' | 'A3' | 'Letter'>('A4')
  const [landscape, setLandscape] = useState(false)
  const [marginMm, setMarginMm] = useState(12)
  const [printBackground, setPrintBackground] = useState(true)

  const pickHtml = async (): Promise<void> => {
    const opened = await window.desktop.openFiles({
      title: '选择 HTML 文件',
      filters: [{ name: 'HTML 文件', extensions: ['html', 'htm'] }],
      multiple: false
    })
    if (!opened.length) return
    const item = opened[0]
    setLocal({
      id: `html_${Date.now()}`,
      name: item.name,
      size: item.size,
      bytes: new Uint8Array(item.data),
      path: item.path,
      kind: kindOf(item.name)
    })
  }

  const start = async (): Promise<void> => {
    let options
    let defaultName = '网页.pdf'
    if (source === 'url') {
      let target = url.trim()
      if (!target || target === 'https://') {
        notify('请输入网页地址', 'error')
        return
      }
      if (!/^https?:\/\//i.test(target)) target = `https://${target}`
      try {
        new URL(target)
      } catch {
        notify('网页地址格式不正确', 'error')
        return
      }
      options = { url: target }
      try {
        defaultName = `${new URL(target).hostname}.pdf`
      } catch {
        defaultName = '网页.pdf'
      }
    } else if (source === 'file') {
      if (!local) {
        notify('请先选择 HTML 文件', 'error')
        return
      }
      options = { filePath: local.path }
      defaultName = `${stemOf(local.name)}.pdf`
    } else {
      if (!html.trim()) {
        notify('请粘贴 HTML 内容', 'error')
        return
      }
      options = { html }
      defaultName = 'HTML 文档.pdf'
    }

    await run(async (progress) => {
      progress(0.2, '正在载入页面')
      const data = await window.desktop.htmlToPdf({
        ...options,
        pageSize,
        landscape,
        marginMm,
        printBackground
      })
      progress(0.95, '正在写出 PDF')
      return {
        bytes: new Uint8Array(data),
        fileName: defaultName,
        mime: 'application/pdf',
        summary: '已将 HTML 页面打印为 PDF',
        notes: [
          source === 'url' ? '网页中的远程图片与样式需要网络连接才能载入完整' : '本地页面已按当前样式打印',
          '固定页眉页脚与脚本交互不会被保留'
        ]
      }
    }, defaultName)
  }

  return (
    <div className="generic-layout">
      <div className="tool-main">
        <section className="panel">
          <SectionTitle hint="网页、代码或本地文件">
            <span className="step-number">01</span> 页面来源
          </SectionTitle>
          <Segmented
            value={source}
            onChange={(value) => setSource(value)}
            options={[
              { value: 'url', label: '网页链接', icon: <Globe2 size={15} /> },
              { value: 'html', label: '粘贴 HTML', icon: <Code2 size={15} /> },
              { value: 'file', label: '本地文件', icon: <FileCode2 size={15} /> }
            ]}
          />

          <div className="html-source">
            {source === 'url' && (
              <Field label="网页地址" hint="支持公开访问的 http 或 https 页面">
                <span className="url-input">
                  <Link2 size={15} />
                  <TextInput value={url} onChange={setUrl} placeholder="https://example.com" type="url" />
                </span>
              </Field>
            )}
            {source === 'html' && (
              <Field label="HTML 代码" hint="内联样式与 Base64 图片最可靠">
                <textarea
                  className="code-editor"
                  value={html}
                  onChange={(event) => setHtml(event.target.value)}
                  spellCheck={false}
                  rows={14}
                />
              </Field>
            )}
            {source === 'file' && (
              <div className="html-file">
                {local ? (
                  <div className="html-file-card">
                    <span className="html-file-icon">
                      <FileCode2 size={20} />
                    </span>
                    <div>
                      <strong>{local.name}</strong>
                      <span>
                        {formatBytes(local.size)} · {local.path}
                      </span>
                    </div>
                    <button type="button" onClick={() => setLocal(null)} aria-label="移除">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button type="button" className="upload-mini tall" onClick={() => void pickHtml()}>
                    <FileCode2 size={21} />
                    <span>选择本地 HTML 文件</span>
                    <small>相对路径的图片与样式会一并载入</small>
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <SectionTitle hint="决定打印纸张与留白">
            <span className="step-number">02</span> 页面设置
          </SectionTitle>
          <div className="split-options three">
            <Field label="纸张">
              <Select
                value={pageSize}
                onChange={setPageSize}
                options={[
                  { value: 'A4', label: 'A4' },
                  { value: 'A3', label: 'A3' },
                  { value: 'Letter', label: 'Letter' }
                ]}
              />
            </Field>
            <Field label="方向">
              <Select
                value={String(landscape)}
                onChange={(value) => setLandscape(value === 'true')}
                options={[
                  { value: 'false', label: '纵向' },
                  { value: 'true', label: '横向' }
                ]}
              />
            </Field>
            <Field label="页边距">
              <RangeField
                value={marginMm}
                min={0}
                max={30}
                step={1}
                onChange={setMarginMm}
                valueLabel={`${marginMm} mm`}
              />
            </Field>
          </div>
          <Toggle
            checked={printBackground}
            onChange={setPrintBackground}
            label="打印背景与底色"
            description="关闭后，彩色背景会变为白色，更省墨。"
          />
        </section>
      </div>

      <aside className="tool-rail">
        <div className="rail-card">
          <span className="rail-kicker">HTML TO PDF</span>
          <h3>{source === 'url' ? '打印网页' : source === 'file' ? '打印本地页面' : '打印 HTML'}</h3>
          <div className="rail-summary">
            <div>
              <span>纸张</span>
              <strong>{pageSize}</strong>
            </div>
            <div>
              <span>方向</span>
              <strong>{landscape ? '横向' : '纵向'}</strong>
            </div>
            <div>
              <span>边距</span>
              <strong>{marginMm} mm</strong>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="rail-action"
            icon={<Sparkles size={17} />}
            onClick={() => void start()}
          >
            生成 PDF
          </Button>
          <span className="rail-foot">
            {source === 'url' ? '访问网页时需要网络' : '页面在本机渲染'}
          </span>
        </div>
        {source === 'url' && (
          <div className="rail-tip">
            <Globe2 size={17} />
            <div>
              <strong>关于网页打印</strong>
              <p>需要登录、验证码或大量脚本交互的页面可能无法完整呈现。</p>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
