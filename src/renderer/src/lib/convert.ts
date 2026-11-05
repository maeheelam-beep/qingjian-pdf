import {
  Document,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  TextRun
} from 'docx'
import ExcelJS from 'exceljs'
import pptxgen from 'pptxgenjs'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { parsePageRanges, renderPdfToImages } from './pdf'
import type { ProgressFn } from './pdfOps'
import type { OpOutput } from './pdfOps'
import type { WorkFile } from './files'
import { sanitizeFileName, stemOf } from './files'
import { loadPdfJs } from './pdf'

export interface TextLine {
  text: string
  x: number
  y: number
  fontSize: number
  width: number
  segments: { text: string; x: number; width: number }[]
}
export interface PageText {
  page: number
  width: number
  height: number
  lines: TextLine[]
  text: string
}
export interface Extracted {
  pages: PageText[]
  text: string
}

type TextItemLike = {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL?: boolean
}

function smartJoin(items: TextItemLike[]): string {
  if (!items.length) return ''
  const sorted = [...items].sort((a, b) => a.transform[4] - b.transform[4])
  let line = sorted[0].str
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    const gap = curr.transform[4] - (prev.transform[4] + prev.width)
    const chineseBoundary = /[\u4e00-\u9fff]$/.test(prev.str) || /^[\u4e00-\u9fff]/.test(curr.str)
    if (gap > Math.max(1.5, prev.height * 0.22) && !chineseBoundary) line += ' '
    line += curr.str
  }
  return line.trim()
}

export async function extractPdfText(
  bytes: Uint8Array,
  onProgress?: ProgressFn,
  pages?: number[]
): Promise<Extracted> {
  const doc = await loadPdfJs(bytes)
  const numbers = pages?.length ? pages.map((p) => p + 1) : Array.from({ length: doc.numPages }, (_, i) => i + 1)
  const result: PageText[] = []
  for (let index = 0; index < numbers.length; index += 1) {
    const page = await doc.getPage(numbers[index])
    const content = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1 })
    const items = content.items.filter((item) => {
      return Boolean(
        item &&
          typeof item === 'object' &&
          'str' in item &&
          'transform' in item &&
          Array.isArray((item as TextItemLike).transform)
      )
    }) as unknown as TextItemLike[]
    const rows: { y: number; items: TextItemLike[]; fontSize: number }[] = []
    for (const item of items) {
      if (!item.str.trim()) continue
      const y = item.transform[5]
      const fontSize = Math.abs(item.transform[3]) || item.height || 10
      const existing = rows.find((row) => Math.abs(row.y - y) <= Math.max(2, fontSize * 0.32))
      if (existing) {
        existing.items.push(item)
        existing.fontSize = Math.max(existing.fontSize, fontSize)
      } else {
        rows.push({ y, items: [item], fontSize })
      }
    }
    rows.sort((a, b) => b.y - a.y)
    const lines: TextLine[] = rows.map((row) => {
      const sorted = [...row.items].sort((a, b) => a.transform[4] - b.transform[4])
      const x = sorted[0]?.transform[4] ?? 0
      const width = sorted.length
        ? Math.max(...sorted.map((s) => s.transform[4] + s.width)) - x
        : 0
      return {
        text: smartJoin(row.items),
        x,
        y: row.y,
        fontSize: row.fontSize,
        width,
        segments: sorted.map((item) => ({
          text: item.str,
          x: item.transform[4],
          width: item.width
        }))
      }
    }).filter((line) => line.text.length > 0)
    result.push({
      page: numbers[index],
      width: viewport.width,
      height: viewport.height,
      lines,
      text: lines.map((l) => l.text).join('\n')
    })
    onProgress?.((index + 1) / numbers.length, `正在读取第 ${numbers[index]} 页`)
  }
  await doc.destroy()
  return { pages: result, text: result.map((p) => p.text).join('\n\n') }
}

function arrayBufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export async function pdfToWord(
  file: WorkFile,
  options: { mode: 'editable' | 'layout'; pages?: string },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const docJs = await loadPdfJs(file.bytes)
  const indices = options.pages?.trim()
    ? parsePageRanges(options.pages, docJs.numPages)
    : Array.from({ length: docJs.numPages }, (_, i) => i)
  await docJs.destroy()

  const children: Paragraph[] = []
  if (options.mode === 'layout') {
    const images = await renderPdfToImages(
      file.bytes,
      { dpi: 150, format: 'jpeg', quality: 0.86, pages: indices },
      (done, total) => onProgress?.(done / total, `正在逐页排版 ${done} / ${total}`)
    )
    for (let i = 0; i < images.length; i += 1) {
      const image = images[i]
      const width = 640
      const height = (image.height / image.width) * width
      children.push(
        new Paragraph({
          alignment: 'center',
          spacing: { before: 0, after: 0 },
          children: [
            new ImageRun({
              type: 'jpg',
              data: image.bytes,
              transformation: { width, height }
            })
          ]
        })
      )
      if (i < images.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }))
    }
  } else {
    const extracted = await extractPdfText(file.bytes, onProgress, indices)
    const sizes = extracted.pages.flatMap((p) => p.lines.map((l) => l.fontSize)).sort((a, b) => a - b)
    const bodySize = sizes[Math.floor(sizes.length / 2)] || 10.5
    for (let pIndex = 0; pIndex < extracted.pages.length; pIndex += 1) {
      const page = extracted.pages[pIndex]
      for (const line of page.lines) {
        const isHeading = line.fontSize > bodySize * 1.45 && line.text.length < 80
        children.push(
          new Paragraph({
            spacing: { after: isHeading ? 160 : 40, before: isHeading ? 160 : 0 },
            children: [
              new TextRun({
                text: line.text,
                bold: isHeading,
                size: Math.round(Math.max(9, Math.min(28, line.fontSize)) * 2),
                font: { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Microsoft YaHei' }
              })
            ]
          })
        )
      }
      if (pIndex < extracted.pages.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }))
    }
    if (!children.length) {
      throw new Error('没有提取到可编辑文字，请改用「保留版式」模式')
    }
  }

  onProgress?.(0.85, '正在生成 Word 文档')
  const doc = new Document({
    creator: '青笺 PDF',
    title: stemOf(file.name),
    styles: {
      default: {
        document: {
          run: { font: { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Microsoft YaHei' }, size: 21 },
          paragraph: { spacing: { line: 320 } }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 }
          }
        },
        children
      }
    ]
  })
  const blob = await Packer.toBlob(doc)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  onProgress?.(1, 'Word 文档已生成')
  return {
    bytes,
    fileName: `${stemOf(file.name)}.docx`,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    summary: options.mode === 'layout' ? `已按页面图像保留 ${indices.length} 页版式` : `已转换 ${indices.length} 页为可编辑文字`,
    notes: [
      options.mode === 'layout'
        ? '版式模式将页面转为图片，文字不可编辑'
        : '复杂分栏、表格与图片不会完整重建；可在 Word 中继续整理'
    ]
  }
}

export async function pdfToExcel(
  file: WorkFile,
  options: { pages?: string },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const docJs = await loadPdfJs(file.bytes)
  const indices = options.pages?.trim()
    ? parsePageRanges(options.pages, docJs.numPages)
    : Array.from({ length: docJs.numPages }, (_, i) => i)
  await docJs.destroy()
  const extracted = await extractPdfText(file.bytes, onProgress, indices)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '青笺 PDF'
  workbook.created = new Date()

  for (const page of extracted.pages) {
    const sheet = workbook.addWorksheet(`第${page.page}页`, {
      views: [{ state: 'frozen', ySplit: 1 }]
    })
    const rows: { y: number; cells: { x: number; text: string }[] }[] = []
    const rawLines = page.lines
    for (const line of rawLines) {
      const cells: { x: number; text: string }[] = []
      const segments = line.segments
        .filter((segment) => segment.text.trim())
        .sort((a, b) => a.x - b.x)
      if (segments.length > 1) {
        let current = { x: segments[0].x, text: segments[0].text, end: segments[0].x + segments[0].width }
        const gapLimit = Math.max(6.5, line.fontSize * 0.65)
        for (let i = 1; i < segments.length; i += 1) {
          const segment = segments[i]
          const gap = segment.x - current.end
          if (gap > gapLimit) {
            cells.push({ x: current.x, text: current.text.trim() })
            current = {
              x: segment.x,
              text: segment.text,
              end: segment.x + segment.width
            }
          } else {
            const cjk = /[\u4e00-\u9fff]$/.test(current.text) || /^[\u4e00-\u9fff]/.test(segment.text)
            current.text += `${gap > 1.5 && !cjk ? ' ' : ''}${segment.text}`
            current.end = segment.x + segment.width
          }
        }
        cells.push({ x: current.x, text: current.text.trim() })
      } else {
        cells.push({ x: line.x, text: line.text })
      }
      const existing = rows.find((row) => Math.abs(row.y - line.y) <= 3)
      if (existing) existing.cells.push(...cells.filter((cell) => cell.text))
      else rows.push({ y: line.y, cells: cells.filter((cell) => cell.text) })
    }
    rows.sort((a, b) => b.y - a.y)
    if (!rows.length) {
      sheet.addRow(['（此页未找到可提取的文字）'])
      continue
    }
    const columnStarts: number[] = []
    for (const row of rows) {
      for (const cell of row.cells) {
        const found = columnStarts.findIndex((x) => Math.abs(x - cell.x) < 34)
        if (found === -1) columnStarts.push(cell.x)
      }
    }
    columnStarts.sort((a, b) => a - b)
    const maxCells = rows.reduce((max, row) => Math.max(max, row.cells.length), 0)
    const maxCols = Math.min(Math.max(maxCells, columnStarts.length), 40)
    rows.forEach((row) => {
      const values: string[] = Array.from({ length: maxCols }, () => '')
      const sortedCells = [...row.cells].sort((a, b) => a.x - b.x)
      if (maxCells >= 2 && sortedCells.length === maxCells) {
        // A full row usually follows the table's column order. Position-based
        // estimates drift when the source PDF uses proportional spacing.
        sortedCells.forEach((cell, index) => {
          values[index] = cell.text
        })
      } else {
        for (const cell of sortedCells) {
          let nearest = 0
          let distance = Infinity
          columnStarts.slice(0, maxCols).forEach((x, index) => {
            const d = Math.abs(x - cell.x)
            if (d < distance) {
              distance = d
              nearest = index
            }
          })
          values[nearest] = values[nearest] ? `${values[nearest]} ${cell.text}` : cell.text
        }
      }
      sheet.addRow(values)
    })
    for (let c = 0; c < maxCols; c += 1) {
      const lengths = rows.map((r) => {
        const cell = r.cells.find((cl) => Math.abs(cl.x - columnStarts[c]) < 36)
        return cell?.text.length ?? 6
      })
      sheet.getColumn(c + 1).width = Math.min(52, Math.max(8, Math.max(...lengths) + 2))
    }
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.font = { name: 'Microsoft YaHei', size: 10 }
        cell.alignment = { vertical: 'middle', wrapText: true }
      })
    })
  }
  onProgress?.(0.9, '正在生成工作簿')
  const buffer = await workbook.xlsx.writeBuffer()
  const bytes = new Uint8Array(buffer as ArrayBuffer)
  return {
    bytes,
    fileName: `${stemOf(file.name)}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    summary: `已生成 ${extracted.pages.length} 个工作表`,
    notes: ['表格按文字坐标自动分列，复杂合并单元格可能需要手动调整']
  }
}

export async function pdfToPpt(
  file: WorkFile,
  options: { layout: 'wide' | 'standard'; dpi?: number; pages?: string },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const docJs = await loadPdfJs(file.bytes)
  const indices = options.pages?.trim()
    ? parsePageRanges(options.pages, docJs.numPages)
    : Array.from({ length: docJs.numPages }, (_, i) => i)
  await docJs.destroy()
  const images = await renderPdfToImages(
    file.bytes,
    { dpi: options.dpi ?? 135, format: 'jpeg', quality: 0.88, pages: indices },
    (done, total) => onProgress?.((done / total) * 0.75, `正在渲染第 ${done} / ${total} 页`)
  )
  const pptx = new pptxgen()
  pptx.layout = options.layout === 'wide' ? 'LAYOUT_WIDE' : 'LAYOUT_4X3'
  pptx.author = '青笺 PDF'
  pptx.company = 'Qingjian'
  pptx.subject = stemOf(file.name)
  pptx.title = stemOf(file.name)
  const slideW = options.layout === 'wide' ? 13.333 : 10
  const slideH = options.layout === 'wide' ? 7.5 : 7.5
  images.forEach((image, index) => {
    const slide = pptx.addSlide()
    slide.background = { color: 'FFFFFF' }
    const margin = 0.12
    const maxW = slideW - margin * 2
    const maxH = slideH - margin * 2
    const ratio = Math.min(maxW / image.width, maxH / image.height)
    const w = image.width * ratio
    const h = image.height * ratio
    slide.addImage({
      data: `data:image/jpeg;base64,${bytesToBase64(image.bytes)}`,
      x: (slideW - w) / 2,
      y: (slideH - h) / 2,
      w,
      h
    })
    slide.addText(`${index + 1}`, {
      x: slideW - 0.55,
      y: slideH - 0.38,
      w: 0.4,
      h: 0.2,
      fontFace: 'Arial',
      fontSize: 9,
      color: '9AA39A',
      align: 'right'
    })
    onProgress?.(0.75 + ((index + 1) / images.length) * 0.15, `正在排版第 ${index + 1} 页`)
  })
  onProgress?.(0.92, '正在写入演示文稿')
  const data = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer
  return {
    bytes: new Uint8Array(data),
    fileName: `${stemOf(file.name)}.pptx`,
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    summary: `已将 ${images.length} 页转为幻灯片`,
    notes: ['每页以高清图像放置，适合汇报展示；文字不可在 PPT 中直接编辑']
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function pdfToJpg(
  file: WorkFile,
  options: { dpi: number; format: 'jpeg' | 'png'; quality: number; pages?: string },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  const docJs = await loadPdfJs(file.bytes)
  const indices = options.pages?.trim()
    ? parsePageRanges(options.pages, docJs.numPages)
    : Array.from({ length: docJs.numPages }, (_, i) => i)
  await docJs.destroy()
  const images = await renderPdfToImages(
    file.bytes,
    { dpi: options.dpi, format: options.format, quality: options.quality, pages: indices },
    (done, total) => onProgress?.(done / total, `正在导出第 ${done} / ${total} 页`)
  )
  if (images.length === 1) {
    return {
      bytes: images[0].bytes,
      fileName: `${stemOf(file.name)}.${options.format === 'png' ? 'png' : 'jpg'}`,
      mime: options.format === 'png' ? 'image/png' : 'image/jpeg',
      summary: '已导出 1 张图片',
      notes: [`分辨率 ${options.dpi} DPI`]
    }
  }
  const zip = new JSZip()
  images.forEach((image) => zip.file(image.name, image.bytes))
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
  return {
    bytes,
    fileName: `${stemOf(file.name)}-图片.zip`,
    mime: 'application/zip',
    summary: `已导出 ${images.length} 张图片`,
    notes: [`分辨率 ${options.dpi} DPI`]
  }
}

export async function pdfToMarkdown(file: WorkFile, onProgress?: ProgressFn): Promise<OpOutput> {
  const extracted = await extractPdfText(file.bytes, onProgress)
  const allSizes = extracted.pages.flatMap((p) => p.lines.map((l) => l.fontSize)).sort((a, b) => a - b)
  const body = allSizes[Math.floor(allSizes.length / 2)] || 10
  const lines: string[] = [`# ${stemOf(file.name)}`, '']
  for (const page of extracted.pages) {
    if (extracted.pages.length > 1) lines.push(`<!-- 第 ${page.page} 页 -->`, '')
    for (const line of page.lines) {
      if (line.fontSize > body * 1.55 && line.text.length < 60) lines.push(`## ${line.text}`, '')
      else if (line.fontSize > body * 1.25 && line.text.length < 80) lines.push(`### ${line.text}`, '')
      else lines.push(line.text, '')
    }
  }
  const bytes = new TextEncoder().encode(lines.join('\n'))
  return {
    bytes,
    fileName: `${stemOf(file.name)}.md`,
    mime: 'text/markdown',
    summary: `已提取 ${extracted.pages.length} 页文字`,
    notes: ['标题层级按字号推断，图片与表格不会保留']
  }
}

export function wrapHtmlDocument(body: string, title: string, extraCss = ''): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Microsoft YaHei", "Segoe UI", sans-serif; color: #242a24; background: #fff; font-size: 11pt; line-height: 1.65; }
  h1, h2, h3, h4 { color: #203027; font-weight: 600; line-height: 1.3; }
  h1 { font-size: 22pt; margin: 0 0 12pt; }
  h2 { font-size: 16pt; margin: 18pt 0 8pt; }
  h3 { font-size: 13pt; margin: 14pt 0 6pt; }
  p { margin: 0 0 8pt; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0 14pt; font-size: 9pt; }
  td, th { border: 1px solid #d8d2c3; padding: 5pt 7pt; text-align: left; vertical-align: top; }
  th { background: #f0eee4; font-weight: 600; }
  tr { page-break-inside: avoid; }
  .sheet-title { font-size: 15pt; font-weight: 600; margin: 0 0 10pt; color: #31553e; }
  .sheet { page-break-after: always; }
  .slide { page-break-after: always; padding: 0; display: flex; flex-direction: column; justify-content: center; }
  .slide:last-child, .sheet:last-child { page-break-after: auto; }
  ${extraCss}
</style></head><body>${body}</body></html>`
}

export async function officeToHtml(file: WorkFile, onProgress?: ProgressFn): Promise<{ html: string; title: string; notes: string[] }> {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  onProgress?.(0.2, '正在解析文档')
  if (ext === 'docx' || ext === 'doc') {
    if (ext === 'doc') throw new Error('暂不支持旧版 .doc，请先另存为 .docx')
    const result = await mammoth.convertToHtml(
      { arrayBuffer: arrayBufferOf(file.bytes) },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh"
        ]
      }
    )
    onProgress?.(0.8, '正在排版 Word')
    return {
      html: wrapHtmlDocument(result.value, stemOf(file.name)),
      title: stemOf(file.name),
      notes: ['Word 文档已按标题与段落重排，复杂浮动版式可能与原文件略有差异']
    }
  }
  if (ext === 'xlsx' || ext === 'xls') {
    if (ext === 'xls') throw new Error('暂不支持旧版 .xls，请先另存为 .xlsx')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBufferOf(file.bytes))
    const parts: string[] = []
    workbook.eachSheet((sheet) => {
      const rows: string[] = []
      const maxRows = Math.min(sheet.rowCount, 1600)
      const maxCols = Math.min(sheet.columnCount, 30)
      for (let r = 1; r <= maxRows; r += 1) {
        const row = sheet.getRow(r)
        const cells: string[] = []
        for (let c = 1; c <= maxCols; c += 1) {
          const cell = row.getCell(c)
          const value = cell.value
          let display = ''
          if (value == null) display = ''
          else if (typeof value === 'object' && 'formula' in (value as object)) {
            display = String((value as { result?: unknown }).result ?? '')
          } else if (typeof value === 'object' && 'text' in (value as object)) {
            display = String((value as { text?: unknown }).text ?? '')
          } else display = String(value)
          cells.push(`<td>${escapeHtml(display).replace(/\n/g, '<br>')}</td>`)
        }
        rows.push(`<tr>${cells.join('')}</tr>`)
      }
      parts.push(
        `<section class="sheet"><div class="sheet-title">${escapeHtml(sheet.name)}</div><table>${rows.join('')}</table></section>`
      )
      onProgress?.(0.8, '正在排版工作表')
    })
    const body = parts.join('')
    return {
      html: wrapHtmlDocument(body, stemOf(file.name)),
      title: stemOf(file.name),
      notes: [
        '表格按工作簿原值输出；公式显示为计算结果',
        workbook.worksheets.some((s) => s.rowCount > 1600) ? '超长工作表仅输出前 1600 行' : '各工作表依次分页'
      ]
    }
  }
  if (ext === 'pptx' || ext === 'ppt') {
    if (ext === 'ppt') throw new Error('暂不支持旧版 .ppt，请先另存为 .pptx')
    return pptxToHtml(file, onProgress)
  }
  throw new Error('请选择 Word、Excel 或 PowerPoint 文件')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function pptxToHtml(
  file: WorkFile,
  onProgress?: ProgressFn
): Promise<{ html: string; title: string; notes: string[] }> {
  const zip = await JSZip.loadAsync(file.bytes)
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/)?.[1] || 0)
      const nb = Number(b.match(/slide(\d+)/)?.[1] || 0)
      return na - nb
    })
  if (!slideNames.length) throw new Error('未找到幻灯片内容')
  const presentation = await zip.file('ppt/presentation.xml')?.async('string')
  const sizeMatch = presentation?.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/)
  const ratio = sizeMatch ? Number(sizeMatch[1]) / Number(sizeMatch[2]) : 16 / 9

  const slides: string[] = []
  for (let i = 0; i < slideNames.length; i += 1) {
    const xml = (await zip.file(slideNames[i])?.async('string')) || ''
    const paragraphs = [...xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
      .map((m) =>
        [...m[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
          .map((t) => decodeXml(t[1]))
          .join('')
          .trim()
      )
      .filter(Boolean)
    const relsName = slideNames[i].replace('slides/', 'slides/_rels/') + '.rels'
    const relsXml = (await zip.file(relsName)?.async('string')) || ''
    const relMap = new Map<string, string>()
    for (const rel of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
      const id = rel[1].match(/Id="([^"]+)"/)?.[1]
      const target = rel[1].match(/Target="([^"]+)"/)?.[1]
      if (id && target) relMap.set(id, target)
    }
    const images: string[] = []
    for (const pic of xml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)) {
      const embed = pic[0].match(/r:embed="([^"]+)"/)?.[1]
      if (!embed) continue
      const target = relMap.get(embed)
      if (!target) continue
      const path = target.startsWith('../') ? `ppt/${target.slice(3)}` : `ppt/slides/${target}`
      const media = zip.file(path)
      if (!media) continue
      const ext = path.split('.').pop()?.toLowerCase() || 'png'
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
      const b64 = await media.async('base64')
      images.push(`<img src="data:${mime};base64,${b64}" alt="">`)
    }
    const title = paragraphs[0] || ''
    const rest = paragraphs.slice(1)
    slides.push(`<section class="slide" style="width:100%;aspect-ratio:${ratio.toFixed(3)};padding:12mm 14mm;">
      <div style="display:flex;gap:12mm;align-items:center;height:100%;">
        <div style="flex:1;min-width:0;">
          ${title ? `<h1 style="font-size:24pt;margin-bottom:8mm;">${escapeHtml(title)}</h1>` : ''}
          ${rest.map((p) => `<p style="font-size:13pt;margin:0 0 3.5mm;">${escapeHtml(p)}</p>`).join('')}
        </div>
        ${images.length ? `<div style="width:42%;display:flex;flex-wrap:wrap;gap:5mm;">${images.map((img) => `<div style="width:100%;">${img.replace('<img ', '<img style="max-height:55mm;width:100%;object-fit:contain;" ')}</div>`).join('')}</div>` : ''}
      </div>
    </section>`)
    onProgress?.(0.2 + ((i + 1) / slideNames.length) * 0.6, `正在重排第 ${i + 1} / ${slideNames.length} 张幻灯片`)
  }
  return {
    html: wrapHtmlDocument(slides.join(''), stemOf(file.name), 'body { background:#fff; }'),
    title: stemOf(file.name),
    notes: ['PowerPoint 采用简洁重排，提取文字与图片；动画、图表和精确坐标不会保留']
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
}

export async function comparePdfs(
  left: WorkFile,
  right: WorkFile,
  onProgress?: ProgressFn
): Promise<{
  pages: { index: number; ratio: number; changed: boolean; leftText: string; rightText: string; diff: string }[]
  leftPages: number
  rightPages: number
  different: number
}> {
  const leftText = await extractPdfText(left.bytes)
  const rightText = await extractPdfText(right.bytes)
  const leftDoc = await loadPdfJs(left.bytes)
  const rightDoc = await loadPdfJs(right.bytes)
  const max = Math.max(leftDoc.numPages, rightDoc.numPages)
  const pages: { index: number; ratio: number; changed: boolean; leftText: string; rightText: string; diff: string }[] = []
  const size = { w: 420, h: 560 }
  for (let i = 0; i < max; i += 1) {
    const lCanvas = document.createElement('canvas')
    const rCanvas = document.createElement('canvas')
    lCanvas.width = size.w
    lCanvas.height = size.h
    rCanvas.width = size.w
    rCanvas.height = size.h
    const lctx = lCanvas.getContext('2d')!
    const rctx = rCanvas.getContext('2d')!
    lctx.fillStyle = '#fff'
    rctx.fillStyle = '#fff'
    lctx.fillRect(0, 0, size.w, size.h)
    rctx.fillRect(0, 0, size.w, size.h)
    if (i < leftDoc.numPages) {
      const p = await leftDoc.getPage(i + 1)
      const vp = p.getViewport({ scale: 1 })
      const scale = Math.min(size.w / vp.width, size.h / vp.height)
      await p.render({ canvasContext: lctx, viewport: p.getViewport({ scale }) }).promise
    }
    if (i < rightDoc.numPages) {
      const p = await rightDoc.getPage(i + 1)
      const vp = p.getViewport({ scale: 1 })
      const scale = Math.min(size.w / vp.width, size.h / vp.height)
      await p.render({ canvasContext: rctx, viewport: p.getViewport({ scale }) }).promise
    }
    const lData = lctx.getImageData(0, 0, size.w, size.h).data
    const rData = rctx.getImageData(0, 0, size.w, size.h).data
    let changedPixels = 0
    for (let p = 0; p < lData.length; p += 4) {
      const delta =
        Math.abs(lData[p] - rData[p]) +
        Math.abs(lData[p + 1] - rData[p + 1]) +
        Math.abs(lData[p + 2] - rData[p + 2])
      if (delta > 48) changedPixels += 1
    }
    const ratio = changedPixels / (size.w * size.h)
    const lt = leftText.pages[i]?.text || ''
    const rt = rightText.pages[i]?.text || ''
    const diffSummary = textDiffSummary(lt, rt)
    pages.push({
      index: i,
      ratio,
      changed: ratio > 0.001 || lt.trim() !== rt.trim() || i >= leftDoc.numPages || i >= rightDoc.numPages,
      leftText: lt,
      rightText: rt,
      diff: diffSummary
    })
    onProgress?.((i + 1) / max, `正在比对第 ${i + 1} / ${max} 页`)
  }
  await leftDoc.destroy()
  await rightDoc.destroy()
  return {
    pages,
    leftPages: leftText.pages.length,
    rightPages: rightText.pages.length,
    different: pages.filter((p) => p.changed).length
  }
}

function textDiffSummary(left: string, right: string): string {
  if (left === right) return '文字内容一致'
  const l = left.split(/\n/).filter(Boolean)
  const r = right.split(/\n/).filter(Boolean)
  const removed: string[] = []
  const added: string[] = []
  const max = Math.max(l.length, r.length)
  for (let i = 0; i < max; i += 1) {
    if (l[i] !== r[i]) {
      if (l[i]) removed.push(l[i])
      if (r[i]) added.push(r[i])
    }
    if (removed.length + added.length > 12) break
  }
  return `− ${removed.slice(0, 6).join(' / ') || '—'}\n+ ${added.slice(0, 6).join(' / ') || '—'}`
}

export function safeOutputName(name: string): string {
  return sanitizeFileName(name)
}
