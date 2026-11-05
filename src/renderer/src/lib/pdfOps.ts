import JSZip from 'jszip'
import { degrees, rgb } from '@cantoo/pdf-lib'
import type { PDFDocument } from '@cantoo/pdf-lib'
import {
  PDFLibDocument,
  canvasToBytes,
  drawSafeText,
  embedCjkFont,
  embedImageAuto,
  formatRangeIndices,
  getPageThumbnails,
  imageFit,
  loadPdf,
  loadPdfJs,
  parsePageRanges,
  renderPdfPageToCanvas,
  renderPdfToImages,
  wrapText
} from './pdf'
import type { WorkFile } from './files'
import { sanitizeFileName, stemOf } from './files'

export type ProgressFn = (ratio: number, label: string) => void

export interface OpOutput {
  bytes: Uint8Array
  fileName: string
  mime: string
  summary: string
  notes?: string[]
  extraFiles?: { name: string; bytes: Uint8Array }[]
}

function stampMetadata(doc: PDFDocument): void {
  const now = new Date()
  doc.setProducer('青笺 PDF')
  doc.setCreator('青笺 PDF')
  doc.setCreationDate(now)
  doc.setModificationDate(now)
}

function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const value = Number.parseInt(full, 16)
  if (!Number.isFinite(value)) return rgb(0.1, 0.1, 0.1)
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255)
}

export async function mergePdfs(files: WorkFile[], onProgress?: ProgressFn): Promise<OpOutput> {
  if (!files.length) throw new Error('请先选择 PDF 文件')
  const out = await PDFLibDocument.create()
  let totalPages = 0
  for (let i = 0; i < files.length; i += 1) {
    const src = await loadPdf(files[i].bytes)
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((page) => out.addPage(page))
    totalPages += pages.length
    onProgress?.((i + 1) / (files.length + 1), `正在合并 ${files[i].name}`)
    await new Promise((r) => setTimeout(r, 0))
  }
  stampMetadata(out)
  const bytes = await out.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(files[0].name)}-合并.pdf`,
    mime: 'application/pdf',
    summary: `已合并 ${files.length} 个文件，共 ${totalPages} 页`,
    notes: ['原文件的页面尺寸与方向保持不变']
  }
}

export async function splitPdf(
  file: WorkFile,
  options: { mode: 'each' | 'ranges' | 'every'; ranges?: string; every?: number },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const src = await loadPdf(file.bytes)
  const total = src.getPageCount()
  const groups: number[][] = []
  if (options.mode === 'each') {
    for (let i = 0; i < total; i += 1) groups.push([i])
  } else if (options.mode === 'every') {
    const step = Math.max(1, options.every || 1)
    for (let i = 0; i < total; i += step) {
      groups.push(Array.from({ length: Math.min(step, total - i) }, (_, k) => i + k))
    }
  } else {
    const parts = (options.ranges || '')
      .split(/[,，;；]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!parts.length) throw new Error('请输入要拆分的页码范围，例如 1-3, 4-6')
    for (const part of parts) {
      const indices = parsePageRanges(part, total)
      if (!indices.length) throw new Error(`页码「${part}」不在文档范围内`)
      groups.push(indices)
    }
  }

  const zip = new JSZip()
  const base = sanitizeFileName(stemOf(file.name))
  for (let i = 0; i < groups.length; i += 1) {
    const out = await PDFLibDocument.create()
    const copied = await out.copyPages(src, groups[i])
    copied.forEach((page) => out.addPage(page))
    stampMetadata(out)
    const data = await out.save({ useObjectStreams: true })
    const pages = groups[i]
    const suffix =
      pages.length === 1 ? `第${pages[0] + 1}页` : `第${pages[0] + 1}-${pages[pages.length - 1] + 1}页`
    zip.file(`${base}-${suffix}.pdf`, data)
    onProgress?.((i + 1) / (groups.length + 1), `正在生成 ${suffix}`)
    await new Promise((r) => setTimeout(r, 0))
  }
  onProgress?.(0.95, '正在打包')
  const zipBytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return {
    bytes: zipBytes,
    fileName: `${base}-拆分.zip`,
    mime: 'application/zip',
    summary: `已拆分为 ${groups.length} 个文件`,
    notes: ['压缩包内每个 PDF 保留原始页面尺寸']
  }
}

export async function compressPdf(
  file: WorkFile,
  options: { level: 'small' | 'balanced' | 'high'; dpi?: number; quality?: number },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const presets = {
    small: { dpi: 110, quality: 0.6 },
    balanced: { dpi: 145, quality: 0.72 },
    high: { dpi: 190, quality: 0.82 }
  } as const
  const preset = presets[options.level] || presets.balanced
  const dpi = options.dpi || preset.dpi
  const quality = options.quality ?? preset.quality

  const source = await loadPdf(file.bytes)
  const sourceSizes = source.getPages().map((p) => p.getSize())

  onProgress?.(0.05, '正在分析页面')
  const images = await renderPdfToImages(
    file.bytes,
    { dpi, format: 'jpeg', quality, pages: sourceSizes.map((_, i) => i) },
    (done, total) => onProgress?.(0.05 + (done / total) * 0.75, `正在压缩第 ${done} / ${total} 页`)
  )

  const out = await PDFLibDocument.create()
  for (let i = 0; i < images.length; i += 1) {
    const image = await out.embedJpg(images[i].bytes)
    const page = out.addPage([sourceSizes[i].width, sourceSizes[i].height])
    page.drawImage(image, { x: 0, y: 0, width: sourceSizes[i].width, height: sourceSizes[i].height })
    onProgress?.(0.8 + (i / images.length) * 0.12, `正在重建第 ${i + 1} 页`)
  }
  stampMetadata(out)
  const rasterBytes = await out.save({ useObjectStreams: true })

  let best = rasterBytes
  let note = '已按图像方式重排页面'
  if (rasterBytes.byteLength >= file.size) {
    const clean = await loadPdf(file.bytes)
    const cleanBytes = await clean.save({ useObjectStreams: true, objectsPerTick: 200 })
    if (cleanBytes.byteLength < rasterBytes.byteLength) {
      best = cleanBytes
      note = '原文件已足够精简，已保留文字与矢量内容'
    }
  }

  const saved = Math.max(0, file.size - best.byteLength)
  return {
    bytes: best,
    fileName: `${stemOf(file.name)}-压缩.pdf`,
    mime: 'application/pdf',
    summary:
      saved > 0
        ? `体积减少 ${((saved / file.size) * 100).toFixed(0)}% · ${Math.round(file.size / 1024)} KB → ${Math.round(best.byteLength / 1024)} KB`
        : `已优化结构，输出 ${Math.round(best.byteLength / 1024)} KB`,
    notes: [note, '压缩会将页面栅格化；如需保留可选中文字，请选择「轻度」或保留原文件']
  }
}

export async function organizePdf(
  file: WorkFile,
  pages: { sourceIndex: number; rotation: number }[],
  onProgress?: ProgressFn
): Promise<OpOutput> {
  if (!pages.length) throw new Error('请至少保留一页')
  const src = await loadPdf(file.bytes)
  const out = await PDFLibDocument.create()
  for (let i = 0; i < pages.length; i += 1) {
    const [copied] = await out.copyPages(src, [pages[i].sourceIndex])
    const current = copied.getRotation().angle || 0
    copied.setRotation(degrees((current + pages[i].rotation + 360) % 360))
    out.addPage(copied)
    onProgress?.((i + 1) / (pages.length + 1), `正在整理第 ${i + 1} 页`)
  }
  stampMetadata(out)
  const bytes = await out.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-整理.pdf`,
    mime: 'application/pdf',
    summary: `已重排为 ${pages.length} 页`,
    notes: ['页面顺序、旋转与删除操作已写入新文件']
  }
}

export async function rotatePdf(
  file: WorkFile,
  options: { angle: number; pages?: string },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const doc = await loadPdf(file.bytes)
  const total = doc.getPageCount()
  const indices = options.pages ? parsePageRanges(options.pages, total) : doc.getPageIndices()
  const pages = doc.getPages()
  indices.forEach((index, i) => {
    const page = pages[index]
    page.setRotation(degrees(((page.getRotation().angle || 0) + options.angle + 360) % 360))
    onProgress?.((i + 1) / (indices.length + 1), `正在旋转第 ${index + 1} 页`)
  })
  stampMetadata(doc)
  const bytes = await doc.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-旋转.pdf`,
    mime: 'application/pdf',
    summary: `${formatRangeIndices(indices)} 已旋转 ${options.angle}°`,
    notes: ['页面内容未改动，仅调整显示方向']
  }
}

export async function cropPdf(
  file: WorkFile,
  options: { margins: { top: number; right: number; bottom: number; left: number }; pages?: string },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const doc = await loadPdf(file.bytes)
  const total = doc.getPageCount()
  const indices = options.pages ? parsePageRanges(options.pages, total) : doc.getPageIndices()
  const pages = doc.getPages()
  const ptPerMm = 72 / 25.4
  const m = options.margins
  indices.forEach((index, i) => {
    const page = pages[index]
    const { width, height } = page.getSize()
    const left = Math.min(m.left * ptPerMm, width * 0.8)
    const right = Math.min(m.right * ptPerMm, width * 0.8)
    const top = Math.min(m.top * ptPerMm, height * 0.8)
    const bottom = Math.min(m.bottom * ptPerMm, height * 0.8)
    const w = Math.max(20, width - left - right)
    const h = Math.max(20, height - top - bottom)
    page.setCropBox(left, bottom, w, h)
    page.setMediaBox(left, bottom, w, h)
    onProgress?.((i + 1) / (indices.length + 1), `正在裁切第 ${index + 1} 页`)
  })
  stampMetadata(doc)
  const bytes = await doc.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-裁切.pdf`,
    mime: 'application/pdf',
    summary: `已裁切 ${indices.length} 页`,
    notes: ['裁切后的页面仍保留原始内容，可使用专业工具进一步还原']
  }
}

export async function addPageNumbers(
  file: WorkFile,
  options: {
    position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left'
    format: string
    startAt: number
    fontSize: number
    marginMm: number
    pages?: string
    skipFirst: boolean
    color: string
  },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const doc = await loadPdf(file.bytes)
  const font = await embedCjkFont(doc)
  const total = doc.getPageCount()
  let indices = options.pages ? parsePageRanges(options.pages, total) : doc.getPageIndices()
  if (options.skipFirst) indices = indices.filter((i) => i !== 0)
  const pages = doc.getPages()
  const margin = options.marginMm * (72 / 25.4)
  indices.forEach((index, i) => {
    const page = pages[index]
    const { width, height } = page.getSize()
    const number = options.startAt + i
    const text = options.format
      .replace(/\{n\}/g, String(number))
      .replace(/\{total\}/g, String(indices.length))
    const textWidth = font.widthOfTextAtSize(text, options.fontSize)
    const isTop = options.position.startsWith('top')
    const y = isTop ? height - margin - options.fontSize : margin
    let x = (width - textWidth) / 2
    if (options.position.endsWith('left')) x = margin
    if (options.position.endsWith('right')) x = width - textWidth - margin
    drawSafeText(page, text, {
      x,
      y,
      size: options.fontSize,
      font,
      color: hexToRgb(options.color)
    })
    onProgress?.((i + 1) / (indices.length + 1), `正在添加第 ${index + 1} 页页码`)
  })
  stampMetadata(doc)
  const bytes = await doc.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-页码.pdf`,
    mime: 'application/pdf',
    summary: `已为 ${indices.length} 页添加页码`,
    notes: ['页码作为文字层写入，不会改变页面原有内容']
  }
}

export async function addHeaderFooter(
  file: WorkFile,
  options: {
    headerLeft: string
    headerCenter: string
    headerRight: string
    footerLeft: string
    footerCenter: string
    footerRight: string
    fontSize: number
    marginMm: number
    pages?: string
    skipFirst: boolean
  },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const doc = await loadPdf(file.bytes)
  const font = await embedCjkFont(doc)
  const total = doc.getPageCount()
  let indices = options.pages ? parsePageRanges(options.pages, total) : doc.getPageIndices()
  if (options.skipFirst) indices = indices.filter((i) => i !== 0)
  const title = doc.getTitle() || stemOf(file.name)
  const date = new Date().toLocaleDateString('zh-CN')
  const pages = doc.getPages()
  const margin = options.marginMm * (72 / 25.4)
  const replace = (value: string, pageNumber: number): string =>
    value
      .replace(/\{page\}/g, String(pageNumber))
      .replace(/\{total\}/g, String(total))
      .replace(/\{date\}/g, date)
      .replace(/\{title\}/g, title)
  const drawRow = (
    page: (typeof pages)[number],
    row: [string, string, string],
    y: number,
    pageNumber: number
  ): void => {
    const { width } = page.getSize()
    const values = row.map((v) => replace(v, pageNumber))
    if (values[0]) drawSafeText(page, values[0], { x: margin, y, size: options.fontSize, font, color: rgb(0.35, 0.37, 0.34) })
    if (values[1]) {
      const widthText = font.widthOfTextAtSize(values[1], options.fontSize)
      drawSafeText(page, values[1], {
        x: (width - widthText) / 2,
        y,
        size: options.fontSize,
        font,
        color: rgb(0.35, 0.37, 0.34)
      })
    }
    if (values[2]) {
      const widthText = font.widthOfTextAtSize(values[2], options.fontSize)
      drawSafeText(page, values[2], {
        x: width - margin - widthText,
        y,
        size: options.fontSize,
        font,
        color: rgb(0.35, 0.37, 0.34)
      })
    }
  }
  indices.forEach((index, i) => {
    const page = pages[index]
    const { height } = page.getSize()
    drawRow(
      page,
      [options.headerLeft, options.headerCenter, options.headerRight],
      height - margin - options.fontSize,
      index + 1
    )
    drawRow(page, [options.footerLeft, options.footerCenter, options.footerRight], margin, index + 1)
    onProgress?.((i + 1) / (indices.length + 1), `正在处理第 ${index + 1} 页`)
  })
  stampMetadata(doc)
  const bytes = await doc.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-页眉页脚.pdf`,
    mime: 'application/pdf',
    summary: `已处理 ${indices.length} 页`,
    notes: ['可用占位符：{page} {total} {date} {title}']
  }
}

export async function addWatermark(
  file: WorkFile,
  options: {
    type: 'text' | 'image'
    text: string
    image?: WorkFile
    fontSize: number
    opacity: number
    rotation: number
    color: string
    layout: 'center' | 'tile'
    pages?: string
  },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const doc = await loadPdf(file.bytes)
  const total = doc.getPageCount()
  const indices = options.pages ? parsePageRanges(options.pages, total) : doc.getPageIndices()
  const pages = doc.getPages()
  const font = await embedCjkFont(doc)
  const embeddedImage = options.image ? await embedImageAuto(doc, options.image.bytes, options.image.name) : null
  const color = hexToRgb(options.color)
  indices.forEach((index, i) => {
    const page = pages[index]
    const { width, height } = page.getSize()
    if (options.type === 'text') {
      const textWidth = font.widthOfTextAtSize(options.text, options.fontSize)
      const drawOne = (cx: number, cy: number): void => {
        const rad = (options.rotation * Math.PI) / 180
        const x = cx - (textWidth / 2) * Math.cos(rad)
        const y = cy - (textWidth / 2) * Math.sin(rad)
        drawSafeText(page, options.text, {
          x,
          y,
          size: options.fontSize,
          font,
          color,
          opacity: options.opacity,
          rotate: options.rotation
        })
      }
      if (options.layout === 'tile') {
        const cols = 2
        const rows = 3
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            drawOne(width * ((c + 1) / (cols + 1)), height * ((r + 1) / (rows + 1)))
          }
        }
      } else {
        drawOne(width / 2, height / 2)
      }
    } else if (embeddedImage) {
      const targetWidth = width * 0.48
      const fit = imageFit(embeddedImage.width, embeddedImage.height, targetWidth, height * 0.48)
      page.drawImage(embeddedImage, {
        x: (width - fit.width) / 2,
        y: (height - fit.height) / 2,
        width: fit.width,
        height: fit.height,
        opacity: options.opacity,
        rotate: degrees(options.rotation)
      })
    }
    onProgress?.((i + 1) / (indices.length + 1), `正在添加水印 · 第 ${index + 1} 页`)
  })
  stampMetadata(doc)
  const bytes = await doc.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-水印.pdf`,
    mime: 'application/pdf',
    summary: `已为 ${indices.length} 页添加水印`,
    notes: ['水印以独立图层叠加，不会移除原页面内容']
  }
}

export async function protectPdf(
  file: WorkFile,
  options: {
    userPassword: string
    ownerPassword?: string
    allowPrinting: boolean
    allowCopying: boolean
    allowModifying: boolean
  }
): Promise<OpOutput> {
  if (!options.userPassword) throw new Error('请设置打开密码')
  const doc = await loadPdf(file.bytes)
  doc.encrypt({
    userPassword: options.userPassword,
    ownerPassword: options.ownerPassword || `${options.userPassword}__owner`,
    algorithm: 'AES-256',
    permissions: {
      printing: options.allowPrinting ? 'highResolution' : false,
      copying: options.allowCopying,
      modifying: options.allowModifying,
      annotating: options.allowModifying,
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: options.allowModifying
    }
  })
  stampMetadata(doc)
  const bytes = await doc.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-加密.pdf`,
    mime: 'application/pdf',
    summary: '已使用 AES-256 加密',
    notes: ['请妥善保存密码，青笺不会上传或记录密码', '所有者密码用于修改权限，可与打开密码不同']
  }
}

export async function unlockPdf(
  file: WorkFile,
  options: { password: string },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  onProgress?.(0.25, '正在验证密码')
  const doc = await loadPdf(file.bytes, options.password)
  onProgress?.(0.55, '正在移除加密')
  // Saving a decrypted context can retain its security handler in some PDFs.
  // Rebuilding into a fresh document guarantees an unencrypted output.
  const out = await PDFLibDocument.create()
  const pages = await out.copyPages(doc, doc.getPageIndices())
  pages.forEach((page) => out.addPage(page))
  out.setTitle(doc.getTitle() || stemOf(file.name))
  out.setAuthor(doc.getAuthor() || '')
  stampMetadata(out)
  onProgress?.(0.8, '正在写出文件')
  const bytes = await out.save({ useObjectStreams: true })
  onProgress?.(0.95, '正在完成')
  return {
    bytes,
    fileName: `${stemOf(file.name)}-已解锁.pdf`,
    mime: 'application/pdf',
    summary: '已移除文档密码',
    notes: ['仅可解锁你拥有权限的文件', '书签与交互式表单不会保留，页面内容保持不变']
  }
}

export async function repairPdf(file: WorkFile, onProgress?: ProgressFn): Promise<OpOutput> {
  const tail = new TextDecoder('latin1').decode(file.bytes.slice(-4096))
  const truncated = !tail.includes('%%EOF')
  onProgress?.(0.16, truncated ? '检测到文件不完整，正在尝试结构恢复' : '正在重建文档结构')

  let structural: Uint8Array | null = null
  try {
    const doc = await PDFLibDocument.load(file.bytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
      updateMetadata: false
    })
    stampMetadata(doc)
    structural = await doc.save({ useObjectStreams: true, objectsPerTick: 100 })
  } catch {
    structural = null
  }

  if (structural) {
    try {
      onProgress?.(0.65, '正在校验修复结果')
      const check = await loadPdfJs(structural)
      await check.destroy()
      onProgress?.(1, '修复完成')
      return {
        bytes: structural,
        fileName: `${stemOf(file.name)}-修复.pdf`,
        mime: 'application/pdf',
        summary: '已修复文档结构',
        notes: truncated
          ? [
              '原文件尾部不完整，已重建可读取的结构',
              '部分字体或图片的数据可能已经丢失，建议逐页检查'
            ]
          : ['已重新写出交叉引用表与文档目录']
      }
    } catch {
      /* fall through to page-by-page recovery */
    }
  }

  try {
    onProgress?.(0.32, '结构无法完整读取，正在逐页重建')
    return await rasterRepair(file, onProgress)
  } catch (error) {
    if (structural) {
      onProgress?.(1, '已尽力恢复')
      return {
        bytes: structural,
        fileName: `${stemOf(file.name)}-修复.pdf`,
        mime: 'application/pdf',
        summary: '已尽力恢复文档结构',
        notes: [
          '文件损坏较严重，无法逐页重建',
          '输出文件可以打开，但部分字体、图片或页面内容可能缺失'
        ]
      }
    }
    throw new Error(
      `无法修复这个文件：${error instanceof Error ? error.message : '文档结构严重损坏'}`
    )
  }
}

async function rasterRepair(file: WorkFile, onProgress?: ProgressFn): Promise<OpOutput> {
  const source = await loadPdfJs(file.bytes)
  const out = await PDFLibDocument.create()
  for (let i = 1; i <= source.numPages; i += 1) {
    const canvas = await renderPdfPageToCanvas(source, i, 180 / 72)
    const bytes = await canvasToBytes(canvas, 'image/jpeg', 0.9)
    const image = await out.embedJpg(bytes)
    const page = out.addPage([canvas.width * (72 / 180), canvas.height * (72 / 180)])
    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
    onProgress?.(0.3 + (i / source.numPages) * 0.65, `正在重建第 ${i} / ${source.numPages} 页`)
  }
  await source.destroy()
  stampMetadata(out)
  const bytes = await out.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-修复.pdf`,
    mime: 'application/pdf',
    summary: `已逐页重建 ${out.getPageCount()} 页`,
    notes: ['原文档结构损坏，已以页面图像方式恢复；文字将不可选中']
  }
}

export async function convertToPdfA(
  file: WorkFile,
  options: { conformance: '1B' | '2B' | '3B' },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  onProgress?.(0.3, '正在写入归档元数据')
  const doc = await loadPdf(file.bytes)
  doc.convertToPDFA({ conformance: options.conformance })
  stampMetadata(doc)
  onProgress?.(0.75, '正在保存 PDF/A')
  const bytes = await doc.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-PDFA-${options.conformance}.pdf`,
    mime: 'application/pdf',
    summary: `已按 PDF/A-${options.conformance} 结构归档`,
    notes: ['归档结构已写入，但仍建议用 veraPDF 等专业工具做合规复核']
  }
}

export interface OverlayItem {
  id: string
  kind: 'text' | 'image' | 'whiteout'
  page: number
  x: number
  y: number
  w: number
  h: number
  text?: string
  fontSize?: number
  color?: string
  imageBytes?: Uint8Array
  imageName?: string
  opacity?: number
}

export async function applyOverlays(
  file: WorkFile,
  items: OverlayItem[],
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const doc = await loadPdf(file.bytes)
  const font = await embedCjkFont(doc)
  const pages = doc.getPages()
  const imageCache = new Map<string, Awaited<ReturnType<typeof embedImageAuto>>>()
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    const page = pages[item.page]
    if (!page) continue
    const { width, height } = page.getSize()
    const x = item.x * width
    const top = item.y * height
    const w = item.w * width
    const h = item.h * height
    if (item.kind === 'text') {
      const size = item.fontSize ?? 16
      const lines = wrapText(item.text || '', font, size, w)
      lines.forEach((line, lineIndex) => {
        drawSafeText(page, line, {
          x,
          y: height - top - size - lineIndex * size * 1.45,
          size,
          font,
          color: hexToRgb(item.color || '#1f2a22'),
          opacity: item.opacity ?? 1
        })
      })
    } else if (item.kind === 'whiteout') {
      page.drawRectangle({
        x,
        y: height - top - h,
        width: w,
        height: h,
        color: rgb(1, 1, 1),
        opacity: item.opacity ?? 1
      })
    } else if (item.kind === 'image' && item.imageBytes) {
      const key = item.id
      let image = imageCache.get(key)
      if (!image) {
        image = await embedImageAuto(doc, item.imageBytes, item.imageName || 'image.png')
        imageCache.set(key, image)
      }
      const fit = imageFit(image.width, image.height, w, h)
      page.drawImage(image, {
        x: x + (w - fit.width) / 2,
        y: height - top - h + (h - fit.height) / 2,
        width: fit.width,
        height: fit.height,
        opacity: item.opacity ?? 1
      })
    }
    onProgress?.((i + 1) / (items.length + 1), `正在写入第 ${item.page + 1} 页`)
  }
  stampMetadata(doc)
  const bytes = await doc.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-编辑.pdf`,
    mime: 'application/pdf',
    summary: `已写入 ${items.length} 处编辑`,
    notes: ['文字以可搜索图层写入；原作者内容保持不变']
  }
}

export interface RedactionBox {
  page: number
  x: number
  y: number
  w: number
  h: number
}

export async function redactPdf(
  file: WorkFile,
  boxes: RedactionBox[],
  options: { dpi?: number } = {},
  onProgress?: ProgressFn
): Promise<OpOutput> {
  if (!boxes.length) throw new Error('请先在页面上框选要遮盖的内容')
  const source = await loadPdfJs(file.bytes)
  const out = await PDFLibDocument.create()
  const dpi = options.dpi ?? 170
  const scale = dpi / 72
  for (let i = 1; i <= source.numPages; i += 1) {
    const canvas = await renderPdfPageToCanvas(source, i, scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建画布')
    const pageBoxes = boxes.filter((b) => b.page === i - 1)
    ctx.fillStyle = '#101310'
    pageBoxes.forEach((b) => {
      ctx.fillRect(b.x * canvas.width, b.y * canvas.height, b.w * canvas.width, b.h * canvas.height)
    })
    const imageBytes = await canvasToBytes(canvas, 'image/jpeg', 0.9)
    const image = await out.embedJpg(imageBytes)
    const page = out.addPage([canvas.width / scale, canvas.height / scale])
    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
    onProgress?.((i / source.numPages) * 0.9, `正在涂黑第 ${i} / ${source.numPages} 页`)
  }
  await source.destroy()
  stampMetadata(out)
  const bytes = await out.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-脱敏.pdf`,
    mime: 'application/pdf',
    summary: `已永久遮盖 ${boxes.length} 处内容`,
    notes: ['输出文件已栅格化，被遮盖的文字与图像无法再被复制或还原', '这是不可逆操作，请保留原文件备份']
  }
}

export async function makePdfFromImages(
  images: WorkFile[],
  options: {
    pageSize: 'fit' | 'a4' | 'letter'
    orientation: 'auto' | 'portrait' | 'landscape'
    marginMm: number
    jpegQuality?: number
  },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  if (!images.length) throw new Error('请先添加图片')
  const out = await PDFLibDocument.create()
  const margin = options.marginMm * (72 / 25.4)
  for (let i = 0; i < images.length; i += 1) {
    const file = images[i]
    let bytes = file.bytes
    let name = file.name
    if (!/\.(jpe?g|png)$/i.test(name)) {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes).buffer]))
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('无法读取图片')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      bytes = await canvasToBytes(canvas, 'image/jpeg', options.jpegQuality ?? 0.9)
      name = `${stemOf(name)}.jpg`
    }
    const image = await embedImageAuto(out, bytes, name)
    if (options.pageSize === 'fit') {
      const page = out.addPage([image.width + margin * 2, image.height + margin * 2])
      page.drawImage(image, { x: margin, y: margin, width: image.width, height: image.height })
    } else {
      const base = options.pageSize === 'a4' ? [595.28, 841.89] : [612, 792]
      const landscape =
        options.orientation === 'landscape' ||
        (options.orientation === 'auto' && image.width > image.height)
      const [pw, ph] = landscape ? [base[1], base[0]] : base
      const page = out.addPage([pw, ph])
      const fit = imageFit(image.width, image.height, pw - margin * 2, ph - margin * 2)
      page.drawImage(image, {
        x: (pw - fit.width) / 2,
        y: (ph - fit.height) / 2,
        width: fit.width,
        height: fit.height
      })
    }
    onProgress?.((i + 1) / (images.length + 1), `正在排版第 ${i + 1} 张图片`)
  }
  stampMetadata(out)
  const bytes = await out.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: '图片转PDF.pdf',
    mime: 'application/pdf',
    summary: `已生成 ${images.length} 页 PDF`,
    notes: ['图片按原始比例居中放置，不会拉伸变形']
  }
}

export async function applySignature(
  file: WorkFile,
  signaturePng: Uint8Array,
  options: {
    page: number
    x: number
    y: number
    widthRatio: number
    signerName: string
    showDate: boolean
  },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const doc = await loadPdf(file.bytes)
  const font = await embedCjkFont(doc)
  const pages = doc.getPages()
  const page = pages[Math.min(options.page, pages.length - 1)]
  if (!page) throw new Error('页码不存在')
  const { width } = page.getSize()
  const image = await doc.embedPng(signaturePng)
  const targetWidth = width * options.widthRatio
  const targetHeight = (image.height / image.width) * targetWidth
  const x = options.x * width
  const y = page.getHeight() - options.y * page.getHeight() - targetHeight
  page.drawImage(image, { x, y, width: targetWidth, height: targetHeight })
  let baseline = y - 12
  if (options.signerName) {
    drawSafeText(page, options.signerName, {
      x,
      y: baseline,
      size: 9,
      font,
      color: rgb(0.3, 0.32, 0.29)
    })
    baseline -= 12
  }
  if (options.showDate) {
    drawSafeText(page, new Date().toLocaleDateString('zh-CN'), {
      x,
      y: baseline,
      size: 8,
      font,
      color: rgb(0.42, 0.44, 0.4)
    })
  }
  onProgress?.(0.8, '正在写入签名')
  stampMetadata(doc)
  const bytes = await doc.save({ useObjectStreams: true })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-已签署.pdf`,
    mime: 'application/pdf',
    summary: `已在第 ${options.page + 1} 页添加签名`,
    notes: ['签名图像已嵌入页面；如需具备法律效力的数字签名，请配合证书服务使用']
  }
}

export async function buildPageThumbnails(file: WorkFile, onProgress?: ProgressFn): Promise<string[]> {
  return getPageThumbnails(
    file.bytes,
    150,
    500,
    (done, total) => onProgress?.(done / total, `正在预览第 ${done} / ${total} 页`)
  )
}

export function isZipOutput(output: OpOutput): boolean {
  return output.mime === 'application/zip'
}
