import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FileKey2,
  Gauge,
  ImagePlus,
  Info,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  ScanText,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react'
import type { WorkFile } from '../../lib/files'
import { extensionOf, formatBytes, kindOf, stemOf } from '../../lib/files'
import type { ToolDef } from '../../lib/tools'
import {
  addHeaderFooter,
  addPageNumbers,
  addWatermark,
  compressPdf,
  convertToPdfA,
  makePdfFromImages,
  mergePdfs,
  protectPdf,
  repairPdf,
  rotatePdf,
  splitPdf,
  unlockPdf,
  type OpOutput,
  type ProgressFn
} from '../../lib/pdfOps'
import {
  officeToHtml,
  pdfToExcel,
  pdfToJpg,
  pdfToMarkdown,
  pdfToPpt,
  pdfToWord
} from '../../lib/convert'
import { ocrPdf } from '../../lib/ocr'
import { getPdfPageCount } from '../../lib/pdf'
import type { RunTask } from '../ToolPage'
import { DropZone, FileThumb, SelectedFiles } from '../FilePicker'
import { BlobImage } from '../BlobImage'
import {
  Button,
  Field,
  NumberStepper,
  RangeField,
  SectionTitle,
  Segmented,
  Select,
  TextInput,
  Toggle
} from '../ui'

interface Props {
  tool: ToolDef
  initialFiles?: WorkFile[]
  run: RunTask
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void
}

type Options = Record<string, string | number | boolean>

const POSITION_OPTIONS = [
  { value: 'bottom-center', label: '底部居中' },
  { value: 'bottom-right', label: '底部靠右' },
  { value: 'bottom-left', label: '底部靠左' },
  { value: 'top-center', label: '顶部居中' },
  { value: 'top-right', label: '顶部靠右' },
  { value: 'top-left', label: '顶部靠左' }
]

function defaultsFor(id: string): Options {
  switch (id) {
    case 'split':
      return { mode: 'each', ranges: '1-3, 4-6', every: 2 }
    case 'compress':
      return { level: 'balanced' }
    case 'rotate':
      return { angle: 90, pages: '' }
    case 'pageNumbers':
      return {
        position: 'bottom-center',
        format: '第 {n} 页',
        startAt: 1,
        fontSize: 10,
        marginMm: 14,
        pages: '',
        skipFirst: false
      }
    case 'headerFooter':
      return {
        headerLeft: '',
        headerCenter: '{title}',
        headerRight: '{date}',
        footerLeft: '',
        footerCenter: '',
        footerRight: '第 {page} / {total} 页',
        fontSize: 8.5,
        marginMm: 12,
        pages: '',
        skipFirst: false
      }
    case 'watermark':
      return {
        type: 'text',
        text: '内部资料',
        fontSize: 42,
        opacity: 0.15,
        rotation: 28,
        color: '#3f6b52',
        layout: 'center',
        pages: ''
      }
    case 'pdfToWord':
      return { mode: 'editable', pages: '' }
    case 'pdfToExcel':
      return { pages: '' }
    case 'pdfToPpt':
      return { layout: 'wide', dpi: 140, pages: '' }
    case 'pdfToJpg':
      return { format: 'jpeg', dpi: 150, quality: 0.88, pages: '' }
    case 'jpgToPdf':
      return { pageSize: 'a4', orientation: 'auto', marginMm: 8 }
    case 'officeToPdf':
      return { pageSize: 'A4', landscape: false, marginMm: 14 }
    case 'protect':
      return {
        userPassword: '',
        confirmPassword: '',
        ownerPassword: '',
        allowPrinting: true,
        allowCopying: false,
        allowModifying: false,
        showPassword: false
      }
    case 'unlock':
      return { password: '', showPassword: false }
    case 'pdfa':
      return { conformance: '2B' }
    case 'ocr':
      return { language: 'chi_sim+eng', pages: '', output: 'pdf' }
    default:
      return {}
  }
}

export function GenericTool({ tool, initialFiles, run, notify }: Props): React.JSX.Element {
  const [files, setFiles] = useState<WorkFile[]>([])
  const [options, setOptions] = useState<Options>(() => defaultsFor(tool.id))
  const [auxImage, setAuxImage] = useState<WorkFile | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(Boolean(initialFiles?.length))

  const isMultiple = tool.multiple
  const primaryFile = files[0]

  useEffect(() => {
    if (!initialFiles?.length) return
    let alive = true
    void (async () => {
      const accepted = initialFiles.filter((file) => tool.accepts.includes(file.kind as never))
      const enriched = await enrichFiles(isMultiple ? accepted : accepted.slice(0, 1))
      if (alive) {
        setFiles(enriched)
        setLoadingInitial(false)
        if (tool.id === 'officeToPdf' && enriched[0] && extensionOf(enriched[0].name) === 'pptx') {
          setOptions((current) => ({ ...current, landscape: true }))
        }
      }
    })()
    return () => {
      alive = false
    }
    // initialFiles is intentionally read once for this tool instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const opt = <T extends string | number | boolean>(key: string): T => options[key] as T

  const setOpt = (key: string, value: string | number | boolean): void => {
    setOptions((current) => ({ ...current, [key]: value }))
  }

  const addFiles = async (incoming: WorkFile[]): Promise<void> => {
    const accepted = incoming.filter((file) => tool.accepts.includes(file.kind as never))
    if (!accepted.length) {
      notify('文件类型不符合这个工具的要求', 'error')
      return
    }
    const enriched = await enrichFiles(accepted)
    if (isMultiple) {
      setFiles((current) => [...current, ...enriched])
    } else {
      setFiles(enriched.slice(0, 1))
    }
    if (tool.id === 'officeToPdf' && accepted[0]) {
      const ext = extensionOf(accepted[0].name)
      if (ext === 'pptx') setOptions((current) => ({ ...current, landscape: true }))
      if (ext === 'docx') setOptions((current) => ({ ...current, landscape: false }))
    }
  }

  const pickMore = async (): Promise<void> => {
    const opened = await window.desktop.openFiles({
      title: `选择${tool.title}文件`,
      filters: tool.accepts.map((kind) => {
        if (kind === 'image') return { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }
        if (kind === 'office') return { name: 'Office 文档', extensions: ['docx', 'xlsx', 'pptx'] }
        return { name: 'PDF 文件', extensions: ['pdf'] }
      }),
      multiple: isMultiple
    })
    if (!opened.length) return
    const incoming: WorkFile[] = opened.map((item) => ({
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: item.name,
      size: item.size,
      bytes: new Uint8Array(item.data),
      path: item.path,
      kind: kindOf(item.name)
    }))
    await addFiles(incoming)
  }

  const moveFile = (id: string, direction: -1 | 1): void => {
    setFiles((current) => {
      const index = current.findIndex((file) => file.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const pickWatermarkImage = async (): Promise<void> => {
    const opened = await window.desktop.openFiles({
      title: '选择水印图片',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      multiple: false
    })
    if (!opened.length) return
    const file = opened[0]
    setAuxImage({
      id: `wm_${Date.now()}`,
      name: file.name,
      size: file.size,
      bytes: new Uint8Array(file.data),
      path: file.path,
      kind: 'image'
    })
  }

  const summary = useMemo(() => makeSummary(tool, files, options), [tool, files, options])

  const start = async (): Promise<void> => {
    if (!files.length) {
      notify('请先选择文件', 'error')
      return
    }
    if (tool.id === 'merge' && files.length < 2) {
      notify('合并至少需要两个 PDF 文件', 'error')
      return
    }
    if (tool.id === 'protect') {
      const pwd = String(opt('userPassword') || '')
      if (pwd.length < 4) {
        notify('打开密码至少需要 4 个字符', 'error')
        return
      }
      if (pwd !== opt('confirmPassword')) {
        notify('两次输入的密码不一致', 'error')
        return
      }
    }
    if (tool.id === 'unlock' && !String(opt('password') || '')) {
      notify('请输入文件的打开密码', 'error')
      return
    }
    if (tool.id === 'watermark' && opt('type') === 'image' && !auxImage) {
      notify('请先选择一张水印图片', 'error')
      return
    }

    const file = files[0]
    await run(async (progress) => execute(progress), file.name)
  }

  const execute = async (progress: ProgressFn): Promise<OpOutput> => {
    const file = files[0]
    switch (tool.id) {
      case 'merge':
        return mergePdfs(files, progress)
      case 'split':
        return splitPdf(
          file,
          {
            mode: opt<'each' | 'ranges' | 'every'>('mode'),
            ranges: String(opt('ranges') || ''),
            every: Number(opt('every') || 1)
          },
          progress
        )
      case 'compress':
        return compressPdf(file, { level: opt<'small' | 'balanced' | 'high'>('level') }, progress)
      case 'rotate':
        return rotatePdf(file, { angle: Number(opt('angle')), pages: String(opt('pages') || '') }, progress)
      case 'pageNumbers':
        return addPageNumbers(
          file,
          {
            position: opt<'bottom-center'>('position'),
            format: String(opt('format')),
            startAt: Number(opt('startAt')),
            fontSize: Number(opt('fontSize')),
            marginMm: Number(opt('marginMm')),
            pages: String(opt('pages') || ''),
            skipFirst: Boolean(opt('skipFirst')),
            color: '#3a423b'
          },
          progress
        )
      case 'headerFooter':
        return addHeaderFooter(
          file,
          {
            headerLeft: String(opt('headerLeft') || ''),
            headerCenter: String(opt('headerCenter') || ''),
            headerRight: String(opt('headerRight') || ''),
            footerLeft: String(opt('footerLeft') || ''),
            footerCenter: String(opt('footerCenter') || ''),
            footerRight: String(opt('footerRight') || ''),
            fontSize: Number(opt('fontSize')),
            marginMm: Number(opt('marginMm')),
            pages: String(opt('pages') || ''),
            skipFirst: Boolean(opt('skipFirst'))
          },
          progress
        )
      case 'watermark':
        return addWatermark(
          file,
          {
            type: opt<'text' | 'image'>('type'),
            text: String(opt('text') || ''),
            image: auxImage ?? undefined,
            fontSize: Number(opt('fontSize')),
            opacity: Number(opt('opacity')),
            rotation: Number(opt('rotation')),
            color: String(opt('color') || '#3f6b52'),
            layout: opt<'center' | 'tile'>('layout'),
            pages: String(opt('pages') || '')
          },
          progress
        )
      case 'pdfToWord':
        return pdfToWord(
          file,
          { mode: opt<'editable' | 'layout'>('mode'), pages: String(opt('pages') || '') },
          progress
        )
      case 'pdfToExcel':
        return pdfToExcel(file, { pages: String(opt('pages') || '') }, progress)
      case 'pdfToPpt':
        return pdfToPpt(
          file,
          {
            layout: opt<'wide' | 'standard'>('layout'),
            dpi: Number(opt('dpi')),
            pages: String(opt('pages') || '')
          },
          progress
        )
      case 'pdfToJpg':
        return pdfToJpg(
          file,
          {
            format: opt<'jpeg' | 'png'>('format'),
            dpi: Number(opt('dpi')),
            quality: Number(opt('quality')),
            pages: String(opt('pages') || '')
          },
          progress
        )
      case 'jpgToPdf':
        return makePdfFromImages(
          files,
          {
            pageSize: opt<'fit' | 'a4' | 'letter'>('pageSize'),
            orientation: opt<'auto' | 'portrait' | 'landscape'>('orientation'),
            marginMm: Number(opt('marginMm'))
          },
          progress
        )
      case 'officeToPdf': {
        const result = await officeToHtml(file, progress)
        progress(0.86, '正在打印为 PDF')
        const data = await window.desktop.htmlToPdf({
          html: result.html,
          pageSize: opt<'A4'>('pageSize') as 'A4',
          landscape: Boolean(opt('landscape')),
          marginMm: Number(opt('marginMm')),
          printBackground: true
        })
        return {
          bytes: new Uint8Array(data),
          fileName: `${stemOf(file.name)}.pdf`,
          mime: 'application/pdf',
          summary: `已将 ${file.name} 转为 PDF`,
          notes: result.notes
        }
      }
      case 'pdfToMarkdown':
        return pdfToMarkdown(file, progress)
      case 'protect':
        return protectPdf(file, {
          userPassword: String(opt('userPassword')),
          ownerPassword: String(opt('ownerPassword') || '') || undefined,
          allowPrinting: Boolean(opt('allowPrinting')),
          allowCopying: Boolean(opt('allowCopying')),
          allowModifying: Boolean(opt('allowModifying'))
        })
      case 'unlock':
        return unlockPdf(file, { password: String(opt('password')) }, progress)
      case 'pdfa':
        return convertToPdfA(
          file,
          { conformance: opt<'1B' | '2B' | '3B'>('conformance') },
          progress
        )
      case 'repair':
        return repairPdf(file, progress)
      case 'ocr':
        return ocrPdf(
          file,
          {
            language: opt<'chi_sim+eng' | 'chi_sim' | 'eng'>('language'),
            pages: String(opt('pages') || ''),
            output: opt<'pdf' | 'txt'>('output')
          },
          progress
        )
      default:
        throw new Error('这个工具还没有准备好')
    }
  }

  const actionLabel: Record<string, string> = {
    merge: '开始合并',
    split: '拆分 PDF',
    compress: '开始压缩',
    rotate: '旋转页面',
    pageNumbers: '添加页码',
    headerFooter: '写入页眉页脚',
    watermark: '添加水印',
    pdfToWord: '转换为 Word',
    pdfToExcel: '转换为 Excel',
    pdfToPpt: '转换为 PPT',
    pdfToJpg: '导出图片',
    jpgToPdf: '生成 PDF',
    officeToPdf: '转换为 PDF',
    pdfToMarkdown: '提取文字',
    protect: '加密文件',
    unlock: '解除密码',
    pdfa: '转换为 PDF/A',
    repair: '尝试修复',
    ocr: '开始识别'
  }

  return (
    <div className="generic-layout">
      <div className="tool-main">
        <section className="panel">
          <SectionTitle hint={isMultiple ? '可多选 · 顺序可调整' : '一次处理一份文件'}>
            <span className="step-number">01</span> 选择文件
          </SectionTitle>
          {loadingInitial ? (
            <div className="inline-loading">
              <Loader2 size={17} className="spin" /> 正在读取文件…
            </div>
          ) : files.length === 0 ? (
            <DropZone tool={tool} onFiles={(incoming) => void addFiles(incoming)} onError={notify} />
          ) : (
            <>
              <SelectedFiles
                files={files}
                tool={tool}
                onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
                onAdd={() => void pickMore()}
                onMove={isMultiple ? moveFile : undefined}
              />
              <div className="file-actions-row">
                <button type="button" className="text-action" onClick={() => void pickMore()}>
                  <ImagePlus size={14} />
                  {isMultiple ? '继续添加文件' : '更换文件'}
                </button>
                {isMultiple && <span>当前共 {files.length} 份 · 可用右侧箭头调整顺序</span>}
              </div>
            </>
          )}
          {tool.id === 'ocr' && (
            <div className="inline-note">
              <ScanText size={15} />
              <span>首次识别会加载本地语言模型，约需十几秒；之后会明显更快。扫描件页数越多，耗时越长。</span>
            </div>
          )}
        </section>

        <section className="panel">
          <SectionTitle hint={summary}>
            <span className="step-number">02</span> 设置
          </SectionTitle>
          <div className="option-stack">{renderOptions()}</div>
        </section>

        <div className="privacy-strip">
          <ShieldCheck size={15} />
          <div>
            <strong>所有处理都在本机完成</strong>
            <span>青笺不会上传文件、不依赖网络，也不保留处理结果。关闭窗口前请保存。</span>
          </div>
        </div>
      </div>

      <aside className="tool-rail">
        <div className="rail-card">
          <span className="rail-kicker">READY WHEN YOU ARE</span>
          <h3>{files.length ? '准备就绪' : '等待文件'}</h3>
          <div className="rail-summary">
            <div>
              <span>文件</span>
              <strong>{files.length ? `${files.length} 份` : '—'}</strong>
            </div>
            <div>
              <span>方式</span>
              <strong>{summary}</strong>
            </div>
            <div>
              <span>位置</span>
              <strong>本机内存</strong>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="rail-action"
            disabled={!files.length}
            icon={<Sparkles size={17} />}
            onClick={() => void start()}
          >
            {actionLabel[tool.id] ?? '开始处理'}
          </Button>
          <span className="rail-foot">
            <Lock size={12} />
            处理过程不需要联网
          </span>
        </div>

        {tool.id === 'compress' && (
          <div className="rail-tip">
            <Gauge size={17} />
            <div>
              <strong>如何选择压缩强度</strong>
              <p>扫描件、图片型 PDF 适合「均衡」或「最小」；以文字为主的文档建议保留清晰度。</p>
            </div>
          </div>
        )}
        {tool.id === 'protect' && (
          <div className="rail-tip">
            <FileKey2 size={17} />
            <div>
              <strong>密码不会离开本机</strong>
              <p>青笺不保存密码。忘记打开密码后，任何工具都无法恢复文件内容。</p>
            </div>
          </div>
        )}
        {tool.id === 'pdfa' && (
          <div className="rail-tip">
            <Info size={17} />
            <div>
              <strong>关于 PDF/A</strong>
              <p>会写入归档元数据与色彩描述。对合规要求严格的场景，建议再用 veraPDF 复核。</p>
            </div>
          </div>
        )}
        {tool.id === 'officeToPdf' && (
          <div className="rail-tip">
            <Layers size={17} />
            <div>
              <strong>版式说明</strong>
              <p>Word 与 Excel 采用排版重绘，适合常规文档；复杂浮动版式建议先用 Office 导出 PDF。</p>
            </div>
          </div>
        )}
      </aside>
    </div>
  )

  function renderOptions(): React.JSX.Element {
    switch (tool.id) {
      case 'merge':
        return (
          <>
            <div className="option-copy">
              <h4>文件顺序</h4>
              <p>合并会按照上方列表从上到下拼接。用箭头调整位置，页码会连续重排。</p>
            </div>
            {files.length ? (
              <div className="merge-preview">
                {files.map((file, index) => (
                  <div className="merge-preview-item" key={file.id}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <FileThumb file={file} size="sm" />
                    <div>
                      <strong>{file.name}</strong>
                      <small>{file.pageCount ? `${file.pageCount} 页` : formatBytes(file.size)}</small>
                    </div>
                    {index < files.length - 1 && <ArrowRight size={14} />}
                  </div>
                ))}
              </div>
            ) : (
              <div className="merge-empty">
                <Layers size={16} />
                选择两个或更多 PDF 后，这里会显示合并顺序。
              </div>
            )}
          </>
        )
      case 'split':
        return (
          <>
            <Segmented
              value={opt<'each' | 'ranges' | 'every'>('mode')}
              onChange={(value) => setOpt('mode', value)}
              options={[
                { value: 'each', label: '逐页拆分', hint: '每页一个 PDF' },
                { value: 'ranges', label: '按范围', hint: '自定义页码' },
                { value: 'every', label: '固定份数', hint: '每 N 页一份' }
              ]}
            />
            {opt('mode') === 'ranges' && (
              <Field label="页码范围" hint="用逗号分隔多组，例如 1-3, 4-6，每组生成一个文件">
                <TextInput
                  value={String(opt('ranges'))}
                  onChange={(value) => setOpt('ranges', value)}
                  placeholder="1-3, 4-6"
                />
              </Field>
            )}
            {opt('mode') === 'every' && (
              <div className="inline-field">
                <Field label="每份包含" hint="按固定页数分卷">
                  <NumberStepper
                    value={Number(opt('every'))}
                    min={1}
                    max={100}
                    suffix="页"
                    onChange={(value) => setOpt('every', value)}
                  />
                </Field>
              </div>
            )}
            <div className="inline-note">
              <Info size={14} />
              <span>拆分结果会打包为 ZIP，保留原始页面尺寸。</span>
            </div>
          </>
        )
      case 'compress':
        return (
          <>
            <div className="choice-cards">
              {[
                { id: 'high', title: '轻度', hint: '190 DPI', desc: '保留更多细节，体积略大' },
                { id: 'balanced', title: '均衡', hint: '145 DPI · 推荐', desc: '体积与清晰度的折中' },
                { id: 'small', title: '最小', hint: '110 DPI', desc: '适合邮件与即时传输' }
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`choice-card ${opt('level') === item.id ? 'is-active' : ''}`}
                  onClick={() => setOpt('level', item.id)}
                >
                  <span className="choice-radio">
                    {opt('level') === item.id && <Check size={11} />}
                  </span>
                  <strong>{item.title}</strong>
                  <span className="choice-hint">{item.hint}</span>
                  <small>{item.desc}</small>
                </button>
              ))}
            </div>
            <div className="inline-note warm">
              <Info size={14} />
              <span>压缩会优先尝试重建页面。若文字版 PDF 已经很小，会自动保留原始文字层。</span>
            </div>
          </>
        )
      case 'rotate':
        return (
          <>
            <Segmented
              value={String(opt('angle'))}
              onChange={(value) => setOpt('angle', Number(value))}
              options={[
                { value: '90', label: '顺时针 90°' },
                { value: '180', label: '旋转 180°' },
                { value: '270', label: '逆时针 90°' }
              ]}
            />
            <Field label="应用页面" hint="留空表示全部页面">
              <TextInput
                value={String(opt('pages'))}
                onChange={(value) => setOpt('pages', value)}
                placeholder="全部页面，例如 1-3, 5"
              />
            </Field>
          </>
        )
      case 'pageNumbers':
        return (
          <>
            <div className="split-options">
              <Field label="位置">
                <Select
                  value={String(opt('position'))}
                  onChange={(value) => setOpt('position', value)}
                  options={POSITION_OPTIONS}
                />
              </Field>
              <Field label="格式">
                <Select
                  value={String(opt('format'))}
                  onChange={(value) => setOpt('format', value)}
                  options={[
                    { value: '第 {n} 页', label: '第 1 页' },
                    { value: '{n}', label: '1' },
                    { value: '{n} / {total}', label: '1 / 12' },
                    { value: '— {n} —', label: '— 1 —' }
                  ]}
                />
              </Field>
            </div>
            <div className="split-options three">
              <Field label="起始页码">
                <NumberStepper value={Number(opt('startAt'))} min={1} max={9999} onChange={(value) => setOpt('startAt', value)} />
              </Field>
              <Field label="字号">
                <NumberStepper
                  value={Number(opt('fontSize'))}
                  min={6}
                  max={24}
                  suffix="pt"
                  onChange={(value) => setOpt('fontSize', value)}
                />
              </Field>
              <Field label="边距">
                <NumberStepper
                  value={Number(opt('marginMm'))}
                  min={4}
                  max={40}
                  suffix="mm"
                  onChange={(value) => setOpt('marginMm', value)}
                />
              </Field>
            </div>
            <Field label="应用页面" hint="留空表示全部页面">
              <TextInput
                value={String(opt('pages'))}
                onChange={(value) => setOpt('pages', value)}
                placeholder="全部页面"
              />
            </Field>
            <Toggle
              checked={Boolean(opt('skipFirst'))}
              onChange={(value) => setOpt('skipFirst', value)}
              label="跳过封面"
              description="第一页不显示页码，适合有封面的文档。"
            />
            <div className={`number-preview number-preview-${String(opt('position'))}`}>
              <div className="number-preview-page">
                <span className="number-preview-line long" />
                <span className="number-preview-line" />
                <span className="number-preview-line short" />
                <span className="number-preview-number">
                  {String(opt('format')).replace('{n}', String(opt('startAt'))).replace('{total}', '12')}
                </span>
              </div>
            </div>
          </>
        )
      case 'headerFooter':
        return (
          <>
            <div className="hf-group">
              <span className="hf-label">页眉</span>
              <div className="hf-grid">
                <TextInput value={String(opt('headerLeft'))} onChange={(v) => setOpt('headerLeft', v)} placeholder="左侧" />
                <TextInput value={String(opt('headerCenter'))} onChange={(v) => setOpt('headerCenter', v)} placeholder="中间" />
                <TextInput value={String(opt('headerRight'))} onChange={(v) => setOpt('headerRight', v)} placeholder="右侧" />
              </div>
            </div>
            <div className="hf-group">
              <span className="hf-label">页脚</span>
              <div className="hf-grid">
                <TextInput value={String(opt('footerLeft'))} onChange={(v) => setOpt('footerLeft', v)} placeholder="左侧" />
                <TextInput value={String(opt('footerCenter'))} onChange={(v) => setOpt('footerCenter', v)} placeholder="中间" />
                <TextInput value={String(opt('footerRight'))} onChange={(v) => setOpt('footerRight', v)} placeholder="右侧" />
              </div>
            </div>
            <div className="inline-note">
              <Info size={14} />
              <span>
                可用占位符：<code>{'{page}'}</code> 当前页、<code>{'{total}'}</code> 总页数、
                <code>{'{date}'}</code> 日期、<code>{'{title}'}</code> 文件名。
              </span>
            </div>
            <div className="split-options three">
              <Field label="字号">
                <NumberStepper value={Number(opt('fontSize'))} min={6} max={18} suffix="pt" onChange={(v) => setOpt('fontSize', v)} />
              </Field>
              <Field label="边距">
                <NumberStepper value={Number(opt('marginMm'))} min={4} max={30} suffix="mm" onChange={(v) => setOpt('marginMm', v)} />
              </Field>
              <Field label="页面">
                <TextInput value={String(opt('pages'))} onChange={(v) => setOpt('pages', v)} placeholder="全部" />
              </Field>
            </div>
            <Toggle
              checked={Boolean(opt('skipFirst'))}
              onChange={(value) => setOpt('skipFirst', value)}
              label="跳过封面"
              description="第一页不添加页眉页脚。"
            />
          </>
        )
      case 'watermark':
        return (
          <>
            <Segmented
              value={opt<'text' | 'image'>('type')}
              onChange={(value) => setOpt('type', value)}
              options={[
                { value: 'text', label: '文字水印' },
                { value: 'image', label: '图片水印' }
              ]}
            />
            {opt('type') === 'text' ? (
              <>
                <Field label="水印文字">
                  <TextInput value={String(opt('text'))} onChange={(v) => setOpt('text', v)} placeholder="内部资料" />
                </Field>
                <div className="split-options">
                  <Field label="字号">
                    <NumberStepper value={Number(opt('fontSize'))} min={10} max={120} suffix="pt" onChange={(v) => setOpt('fontSize', v)} />
                  </Field>
                  <Field label="颜色">
                    <span className="color-field">
                      <input
                        type="color"
                        value={String(opt('color'))}
                        onChange={(e) => setOpt('color', e.target.value)}
                      />
                      <span>{String(opt('color')).toUpperCase()}</span>
                    </span>
                  </Field>
                </div>
              </>
            ) : (
              <div className="watermark-image-picker">
                {auxImage ? (
                  <div className="watermark-image">
                    <BlobImage bytes={auxImage.bytes} name={auxImage.name} alt="水印预览" />
                    <div>
                      <strong>{auxImage.name}</strong>
                      <span>{formatBytes(auxImage.size)}</span>
                    </div>
                    <button type="button" onClick={() => setAuxImage(null)} aria-label="移除水印图片">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button type="button" className="upload-mini" onClick={() => void pickWatermarkImage()}>
                    <ImagePlus size={19} />
                    <span>选择 PNG 或 JPG 图片</span>
                  </button>
                )}
              </div>
            )}
            <div className="split-options">
              <Field label="透明度">
                <RangeField
                  value={Number(opt('opacity'))}
                  min={0.04}
                  max={0.8}
                  step={0.01}
                  onChange={(v) => setOpt('opacity', v)}
                  valueLabel={`${Math.round(Number(opt('opacity')) * 100)}%`}
                />
              </Field>
              <Field label="旋转">
                <RangeField
                  value={Number(opt('rotation'))}
                  min={0}
                  max={90}
                  step={1}
                  onChange={(v) => setOpt('rotation', v)}
                  valueLabel={`${opt('rotation')}°`}
                />
              </Field>
            </div>
            <div className="split-options">
              <Field label="排布">
                <Segmented
                  compact
                  value={opt<'center' | 'tile'>('layout')}
                  onChange={(value) => setOpt('layout', value)}
                  options={[
                    { value: 'center', label: '居中一枚' },
                    { value: 'tile', label: '平铺' }
                  ]}
                />
              </Field>
              <Field label="应用页面">
                <TextInput value={String(opt('pages'))} onChange={(v) => setOpt('pages', v)} placeholder="全部页面" />
              </Field>
            </div>
          </>
        )
      case 'pdfToWord':
        return (
          <>
            <div className="choice-cards two">
              <button
                type="button"
                className={`choice-card ${opt('mode') === 'editable' ? 'is-active' : ''}`}
                onClick={() => setOpt('mode', 'editable')}
              >
                <span className="choice-radio">{opt('mode') === 'editable' && <Check size={11} />}</span>
                <strong>可编辑文字</strong>
                <span className="choice-hint">推荐</span>
                <small>提取段落与字号，适合继续修改</small>
              </button>
              <button
                type="button"
                className={`choice-card ${opt('mode') === 'layout' ? 'is-active' : ''}`}
                onClick={() => setOpt('mode', 'layout')}
              >
                <span className="choice-radio">{opt('mode') === 'layout' && <Check size={11} />}</span>
                <strong>保留版式</strong>
                <span className="choice-hint">图片排版</span>
                <small>逐页转图，视觉最接近原文</small>
              </button>
            </div>
            <Field label="转换页面" hint="留空表示全部页面">
              <TextInput value={String(opt('pages'))} onChange={(v) => setOpt('pages', v)} placeholder="全部页面" />
            </Field>
          </>
        )
      case 'pdfToExcel':
        return (
          <>
            <Field label="转换页面" hint="每个页面会生成一个工作表">
              <TextInput value={String(opt('pages'))} onChange={(v) => setOpt('pages', v)} placeholder="全部页面" />
            </Field>
            <div className="inline-note warm">
              <Info size={14} />
              <span>表格会按文字坐标自动分列。扫描件请先使用 OCR，再转换为 Excel。</span>
            </div>
          </>
        )
      case 'pdfToPpt':
        return (
          <>
            <Field label="幻灯片比例">
              <Segmented
                value={opt<'wide' | 'standard'>('layout')}
                onChange={(value) => setOpt('layout', value)}
                options={[
                  { value: 'wide', label: '16:9 宽屏' },
                  { value: 'standard', label: '4:3 标准' }
                ]}
              />
            </Field>
            <Field label="渲染清晰度" hint="越高越清晰，文件也越大">
              <RangeField
                value={Number(opt('dpi'))}
                min={96}
                max={220}
                step={2}
                onChange={(v) => setOpt('dpi', v)}
                valueLabel={`${opt('dpi')} DPI`}
              />
            </Field>
            <Field label="转换页面">
              <TextInput value={String(opt('pages'))} onChange={(v) => setOpt('pages', v)} placeholder="全部页面" />
            </Field>
          </>
        )
      case 'pdfToJpg':
        return (
          <>
            <Field label="图片格式">
              <Segmented
                value={opt<'jpeg' | 'png'>('format')}
                onChange={(value) => setOpt('format', value)}
                options={[
                  { value: 'jpeg', label: 'JPG', hint: '体积更小' },
                  { value: 'png', label: 'PNG', hint: '无损' }
                ]}
              />
            </Field>
            <div className="split-options">
              <Field label="分辨率">
                <Select
                  value={String(opt('dpi'))}
                  onChange={(value) => setOpt('dpi', Number(value))}
                  options={[
                    { value: '96', label: '96 DPI · 屏幕' },
                    { value: '150', label: '150 DPI · 清晰' },
                    { value: '300', label: '300 DPI · 印刷' }
                  ]}
                />
              </Field>
              {opt('format') === 'jpeg' && (
                <Field label="画质">
                  <RangeField
                    value={Number(opt('quality'))}
                    min={0.5}
                    max={1}
                    step={0.01}
                    onChange={(v) => setOpt('quality', v)}
                    valueLabel={`${Math.round(Number(opt('quality')) * 100)}%`}
                  />
                </Field>
              )}
            </div>
            <Field label="导出页面">
              <TextInput value={String(opt('pages'))} onChange={(v) => setOpt('pages', v)} placeholder="全部页面" />
            </Field>
          </>
        )
      case 'jpgToPdf':
        return (
          <>
            <div className="split-options">
              <Field label="页面尺寸">
                <Select
                  value={String(opt('pageSize'))}
                  onChange={(value) => setOpt('pageSize', value)}
                  options={[
                    { value: 'a4', label: 'A4' },
                    { value: 'letter', label: 'Letter' },
                    { value: 'fit', label: '跟随图片' }
                  ]}
                />
              </Field>
              <Field label="方向">
                <Select
                  value={String(opt('orientation'))}
                  onChange={(value) => setOpt('orientation', value)}
                  options={[
                    { value: 'auto', label: '自动' },
                    { value: 'portrait', label: '纵向' },
                    { value: 'landscape', label: '横向' }
                  ]}
                />
              </Field>
            </div>
            <Field label="页边距">
              <RangeField
                value={Number(opt('marginMm'))}
                min={0}
                max={40}
                step={1}
                onChange={(v) => setOpt('marginMm', v)}
                valueLabel={`${opt('marginMm')} mm`}
              />
            </Field>
            <div className="inline-note">
              <Info size={14} />
              <span>图片会按原始比例居中放置，不会拉伸。多张图片按列表顺序逐页排列。</span>
            </div>
          </>
        )
      case 'officeToPdf':
        return (
          <>
            <div className="split-options">
              <Field label="纸张">
                <Select
                  value={String(opt('pageSize'))}
                  onChange={(value) => setOpt('pageSize', value)}
                  options={[
                    { value: 'A4', label: 'A4' },
                    { value: 'A3', label: 'A3' },
                    { value: 'Letter', label: 'Letter' }
                  ]}
                />
              </Field>
              <Field label="方向">
                <Select
                  value={String(opt('landscape'))}
                  onChange={(value) => setOpt('landscape', value === 'true')}
                  options={[
                    { value: 'false', label: '纵向' },
                    { value: 'true', label: '横向' }
                  ]}
                />
              </Field>
            </div>
            <Field label="页边距">
              <RangeField
                value={Number(opt('marginMm'))}
                min={0}
                max={30}
                step={1}
                onChange={(v) => setOpt('marginMm', v)}
                valueLabel={`${opt('marginMm')} mm`}
              />
            </Field>
            <div className="inline-note warm">
              <Info size={14} />
              <span>支持 DOCX、XLSX、PPTX。Word 与 Excel 按阅读排版输出，PPT 会提取文字与图片重排。</span>
            </div>
          </>
        )
      case 'pdfToMarkdown':
        return (
          <>
            <div className="inline-note">
              <Info size={14} />
              <span>会根据字号推断标题层级，保留段落顺序。图片、表格和手写批注不会保留。</span>
            </div>
            <div className="markdown-sample">
              <span>#</span>
              <div>
                <strong>{primaryFile ? stemOf(primaryFile.name) : '文档标题'}</strong>
                <small>## 一级标题　　### 二级标题</small>
              </div>
            </div>
          </>
        )
      case 'protect':
        return (
          <>
            <div className="password-section">
              <Field label="打开密码" hint="至少 4 个字符，打开文件时必须输入">
                <div className="password-wrap">
                  <TextInput
                    type={opt('showPassword') ? 'text' : 'password'}
                    value={String(opt('userPassword'))}
                    onChange={(v) => setOpt('userPassword', v)}
                    placeholder="设置打开密码"
                  />
                  <button
                    type="button"
                    className="password-eye"
                    onClick={() => setOpt('showPassword', !opt('showPassword'))}
                    aria-label={opt('showPassword') ? '隐藏密码' : '显示密码'}
                  >
                    {opt('showPassword') ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>
              <Field label="确认密码">
                <TextInput
                  type={opt('showPassword') ? 'text' : 'password'}
                  value={String(opt('confirmPassword'))}
                  onChange={(v) => setOpt('confirmPassword', v)}
                  placeholder="再次输入密码"
                />
              </Field>
              {String(opt('userPassword')).length > 0 && (
                <div className="password-strength">
                  <span
                    className={`strength-bar level-${Math.min(
                      3,
                      Math.floor(String(opt('userPassword')).length / 4)
                    )}`}
                  />
                  <small>
                    {String(opt('userPassword')).length < 6
                      ? '偏弱，建议使用 8 位以上混合字符'
                      : String(opt('userPassword')).length < 10
                        ? '尚可，继续增加长度会更安全'
                        : '强度良好'}
                  </small>
                </div>
              )}
            </div>
            <details className="advanced-block">
              <summary>
                权限与所有者密码 <ChevronDown size={14} />
              </summary>
              <Field label="所有者密码" hint="可选；用于允许修改权限。留空会自动生成">
                <TextInput
                  type="password"
                  value={String(opt('ownerPassword'))}
                  onChange={(v) => setOpt('ownerPassword', v)}
                  placeholder="可选"
                />
              </Field>
              <div className="permission-list">
                <Toggle
                  checked={Boolean(opt('allowPrinting'))}
                  onChange={(v) => setOpt('allowPrinting', v)}
                  label="允许打印"
                />
                <Toggle
                  checked={Boolean(opt('allowCopying'))}
                  onChange={(v) => setOpt('allowCopying', v)}
                  label="允许复制文字"
                />
                <Toggle
                  checked={Boolean(opt('allowModifying'))}
                  onChange={(v) => setOpt('allowModifying', v)}
                  label="允许编辑与添加批注"
                />
              </div>
            </details>
            <div className="inline-note warm">
              <KeyRound size={14} />
              <span>使用 AES-256 加密。密码不会保存到任何地方，请自行妥善保管。</span>
            </div>
          </>
        )
      case 'unlock':
        return (
          <>
            <Field label="文件密码" hint="请输入当前文件的打开密码">
              <div className="password-wrap">
                <TextInput
                  type={opt('showPassword') ? 'text' : 'password'}
                  value={String(opt('password'))}
                  onChange={(v) => setOpt('password', v)}
                  placeholder="输入打开密码"
                />
                <button
                  type="button"
                  className="password-eye"
                  onClick={() => setOpt('showPassword', !opt('showPassword'))}
                  aria-label={opt('showPassword') ? '隐藏密码' : '显示密码'}
                >
                  {opt('showPassword') ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <div className="inline-note">
              <Info size={14} />
              <span>解密后的文件不再需要密码。请只处理你有权访问的文件。</span>
            </div>
          </>
        )
      case 'pdfa':
        return (
          <>
            <Field label="归档版本">
              <Segmented
                value={opt<'1B' | '2B' | '3B'>('conformance')}
                onChange={(value) => setOpt('conformance', value)}
                options={[
                  { value: '1B', label: 'PDF/A-1b', hint: '兼容性最广' },
                  { value: '2B', label: 'PDF/A-2b', hint: '推荐' },
                  { value: '3B', label: 'PDF/A-3b', hint: '可附文件' }
                ]}
              />
            </Field>
            <div className="inline-note warm">
              <Info size={14} />
              <span>青笺会写入 PDF/A 标识、输出意图与同步元数据，但不会重排原页面内容。</span>
            </div>
          </>
        )
      case 'repair':
        return (
          <>
            <div className="repair-visual">
              <span className="repair-mark">
                <ShieldCheck size={24} />
              </span>
              <div>
                <h4>先温和修复，再逐页重建</h4>
                <p>青笺会先尝试重建文档目录与交叉引用；如果结构严重损坏，会自动逐页渲染并重新装订为 PDF。</p>
              </div>
            </div>
            <div className="inline-note">
              <Info size={14} />
              <span>逐页重建会丢失文字选中与表单，但通常能救回页面内容。修复前请保留原文件。</span>
            </div>
          </>
        )
      case 'ocr':
        return (
          <>
            <div className="split-options">
              <Field label="识别语言">
                <Select
                  value={String(opt('language'))}
                  onChange={(value) => setOpt('language', value)}
                  options={[
                    { value: 'chi_sim+eng', label: '中文 + 英文' },
                    { value: 'chi_sim', label: '仅简体中文' },
                    { value: 'eng', label: '仅英文' }
                  ]}
                />
              </Field>
              <Field label="输出">
                <Select
                  value={String(opt('output'))}
                  onChange={(value) => setOpt('output', value)}
                  options={[
                    { value: 'pdf', label: '可搜索 PDF' },
                    { value: 'txt', label: '纯文本 TXT' }
                  ]}
                />
              </Field>
            </div>
            <Field label="识别页面" hint="留空表示全部页面；页数较多时建议分段处理">
              <TextInput value={String(opt('pages'))} onChange={(v) => setOpt('pages', v)} placeholder="全部页面" />
            </Field>
            <div className="inline-note">
              <ScanText size={14} />
              <span>OCR 会保留页面图像，并在其上叠加透明文字层。可搜索 PDF 的清晰度取决于原扫描件质量。</span>
            </div>
          </>
        )
      default:
        return <div className="inline-note">这个工具暂时没有额外设置。</div>
    }
  }
}

async function enrichFiles(files: WorkFile[]): Promise<WorkFile[]> {
  const result: WorkFile[] = []
  for (const file of files) {
    if (file.kind === 'pdf' && !file.pageCount) {
      try {
        const pageCount = await getPdfPageCount(file.bytes)
        result.push({ ...file, pageCount })
      } catch {
        result.push(file)
      }
    } else {
      result.push(file)
    }
  }
  return result
}

function makeSummary(tool: ToolDef, files: WorkFile[], options: Options): string {
  switch (tool.id) {
    case 'merge':
      return files.length ? `${files.length} 份文件` : '—'
    case 'split':
      return options.mode === 'each' ? '逐页拆分' : options.mode === 'ranges' ? '按范围' : `每 ${options.every} 页`
    case 'compress':
      return options.level === 'small' ? '最小体积' : options.level === 'high' ? '轻度压缩' : '均衡压缩'
    case 'rotate':
      return `旋转 ${options.angle}°`
    case 'pageNumbers':
      return `${POSITION_OPTIONS.find((p) => p.value === options.position)?.label ?? '页码'}`
    case 'headerFooter':
      return '页眉与页脚'
    case 'watermark':
      return options.type === 'image' ? '图片水印' : '文字水印'
    case 'pdfToWord':
      return options.mode === 'layout' ? '保留版式' : '可编辑文字'
    case 'pdfToExcel':
      return '按页生成工作表'
    case 'pdfToPpt':
      return options.layout === 'wide' ? '16:9 宽屏' : '4:3 标准'
    case 'pdfToJpg':
      return `${String(options.format).toUpperCase()} · ${options.dpi} DPI`
    case 'jpgToPdf':
      return `${String(options.pageSize).toUpperCase()} · ${options.marginMm} mm`
    case 'officeToPdf':
      return `${options.pageSize} · ${options.landscape ? '横向' : '纵向'}`
    case 'pdfToMarkdown':
      return 'Markdown 文本'
    case 'protect':
      return 'AES-256'
    case 'unlock':
      return '移除密码'
    case 'pdfa':
      return `PDF/A-${options.conformance}`
    case 'repair':
      return '结构修复'
    case 'ocr':
      return options.output === 'pdf' ? '可搜索 PDF' : '纯文本'
    default:
      return files.length ? `${files.length} 份文件` : '—'
  }
}
