import {
  degrees,
  PDFDocument as PDFLibDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  StandardFonts
} from '@cantoo/pdf-lib'
import fontkit from '@cantoo/fontkit'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { extensionOf } from './files'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export { PDFLibDocument, rgb, StandardFonts }
export type { PDFFont, PDFImage, PDFPage }

export interface RenderOptions {
  dpi?: number
  maxWidth?: number
  background?: string
}

export interface RenderedPage {
  dataUrl: string
  width: number
  height: number
}

export interface PageImage {
  name: string
  bytes: Uint8Array
  width: number
  height: number
}

const fontDataPromise = (() => {
  let cached: Promise<ArrayBuffer> | null = null
  return (): Promise<ArrayBuffer> => {
    if (!cached) cached = window.desktop.getFontData()
    return cached
  }
})()

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(width))
  canvas.height = Math.max(1, Math.floor(height))
  return canvas
}

export function canvasToBytes(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.86): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('图片生成失败'))
          return
        }
        resolve(new Uint8Array(await blob.arrayBuffer()))
      },
      type,
      quality
    )
  })
}

export async function loadPdfJs(bytes: Uint8Array, password?: string): Promise<pdfjs.PDFDocumentProxy> {
  const data = bytes.slice()
  return pdfjs.getDocument({
    data,
    password,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true
  }).promise
}

export async function getPdfPageCount(bytes: Uint8Array, password?: string): Promise<number> {
  const doc = await loadPdfJs(bytes, password)
  const count = doc.numPages
  await doc.destroy()
  return count
}

export async function renderPdfPage(
  doc: pdfjs.PDFDocumentProxy,
  pageNumber: number,
  options: RenderOptions = {}
): Promise<RenderedPage> {
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  let scale = (options.dpi ?? 144) / 72
  if (options.maxWidth && base.width * scale > options.maxWidth) {
    scale = options.maxWidth / base.width
  }
  const viewport = page.getViewport({ scale })
  const canvas = createCanvas(viewport.width, viewport.height)
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('无法创建画布')
  context.fillStyle = options.background ?? '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: context, viewport }).promise
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.86),
    width: canvas.width,
    height: canvas.height
  }
}

export async function renderPdfPageToCanvas(
  doc: pdfjs.PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  background = '#ffffff'
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = createCanvas(viewport.width, viewport.height)
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('无法创建画布')
  context.fillStyle = background
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: context, viewport }).promise
  return canvas
}

export async function renderFirstPage(bytes: Uint8Array, maxWidth = 320): Promise<string | null> {
  try {
    const doc = await loadPdfJs(bytes)
    const image = await renderPdfPage(doc, 1, { maxWidth })
    await doc.destroy()
    return image.dataUrl
  } catch {
    return null
  }
}

export async function renderPdfToImages(
  bytes: Uint8Array,
  options: { dpi?: number; format?: 'jpeg' | 'png'; quality?: number; pages?: number[]; password?: string } = {},
  onProgress?: (done: number, total: number) => void
): Promise<PageImage[]> {
  const doc = await loadPdfJs(bytes, options.password)
  const pages = options.pages?.length ? options.pages : Array.from({ length: doc.numPages }, (_, i) => i)
  const images: PageImage[] = []
  for (let i = 0; i < pages.length; i += 1) {
    const pageIndex = pages[i]
    const page = await doc.getPage(pageIndex + 1)
    const viewport = page.getViewport({ scale: (options.dpi ?? 150) / 72 })
    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('无法创建画布')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: context, viewport }).promise
    const mime = options.format === 'png' ? 'image/png' : 'image/jpeg'
    const imageBytes = await canvasToBytes(canvas, mime, options.quality ?? 0.86)
    images.push({
      name: `page-${String(pageIndex + 1).padStart(3, '0')}.${options.format === 'png' ? 'png' : 'jpg'}`,
      bytes: imageBytes,
      width: canvas.width,
      height: canvas.height
    })
    onProgress?.(i + 1, pages.length)
    await new Promise((r) => setTimeout(r, 0))
  }
  await doc.destroy()
  return images
}

export function parsePageRanges(input: string, total: number): number[] {
  const text = input.trim().toLowerCase()
  if (!text || text === 'all' || text === '全部') {
    return Array.from({ length: total }, (_, i) => i)
  }
  const result = new Set<number>()
  for (const rawPart of text.split(/[,，;；\s]+/)) {
    const part = rawPart.trim()
    if (!part) continue
    if (part === 'all' || part === '全部') {
      for (let i = 1; i <= total; i += 1) result.add(i)
      continue
    }
    const match = part.match(/^(\d+)?\s*[-–~]\s*(\d+)?$/)
    if (match) {
      const start = match[1] ? Number(match[1]) : 1
      const end = match[2] ? Number(match[2]) : total
      if (start <= end) {
        for (let i = Math.max(1, start); i <= Math.min(total, end); i += 1) result.add(i)
      }
      continue
    }
    if (/^\d+$/.test(part)) {
      const value = Number(part)
      if (value >= 1 && value <= total) result.add(value)
    }
  }
  return [...result].sort((a, b) => a - b).map((n) => n - 1)
}

export function describePageSelection(pages: number[], total: number): string {
  if (pages.length === total) return `全部 ${total} 页`
  if (pages.length === 1) return `第 ${pages[0] + 1} 页`
  return `${pages.length} 页 · ${pages.map((p) => p + 1).join(', ')}`
}

export function formatRangeIndices(pages: number[]): string {
  if (!pages.length) return '—'
  const sorted = [...pages].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0]
  let prev = start
  for (let i = 1; i <= sorted.length; i += 1) {
    const current = sorted[i]
    if (current !== prev + 1) {
      parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`)
      start = current
    }
    prev = current
  }
  return parts.join(', ')
}

export async function loadPdf(bytes: Uint8Array, password?: string): Promise<PDFLibDocument> {
  return PDFLibDocument.load(bytes, {
    password,
    updateMetadata: false,
    throwOnInvalidObject: false
  })
}

export async function embedCjkFont(doc: PDFLibDocument): Promise<PDFFont> {
  const cached = (doc as unknown as { __cjkFont?: PDFFont }).__cjkFont
  if (cached) return cached
  doc.registerFontkit(fontkit as never)
  const bytes = await fontDataPromise()
  const font = await doc.embedFont(new Uint8Array(bytes), { subset: true })
  ;(doc as unknown as { __cjkFont?: PDFFont }).__cjkFont = font
  return font
}

export function drawSafeText(
  page: PDFPage,
  text: string,
  options: {
    x: number
    y: number
    size: number
    font: PDFFont
    color?: ReturnType<typeof rgb>
    opacity?: number
    rotate?: number
    maxWidth?: number
  }
): void {
  let content = text
  if (options.maxWidth && options.font.widthOfTextAtSize(content, options.size) > options.maxWidth) {
    while (content.length > 1 && options.font.widthOfTextAtSize(`${content}…`, options.size) > options.maxWidth) {
      content = content.slice(0, -1)
    }
    content = `${content}…`
  }
  page.drawText(content, {
    x: options.x,
    y: options.y,
    size: options.size,
    font: options.font,
    color: options.color ?? rgb(0.15, 0.17, 0.15),
    opacity: options.opacity ?? 1,
    rotate: options.rotate !== undefined ? degrees(options.rotate) : undefined
  })
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph) {
      lines.push('')
      continue
    }
    let line = ''
    for (const char of paragraph) {
      const next = line + char
      if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(line)
        line = char
      } else {
        line = next
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

export async function embedImageAuto(doc: PDFLibDocument, bytes: Uint8Array, name: string): Promise<PDFImage> {
  const ext = extensionOf(name)
  if (ext === 'jpg' || ext === 'jpeg') return doc.embedJpg(bytes)
  if (ext === 'png') return doc.embedPng(bytes)
  const blob = new Blob([new Uint8Array(bytes).buffer])
  const bitmap = await createImageBitmap(blob)
  const canvas = createCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法读取图片')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const png = await canvasToBytes(canvas, 'image/png')
  return doc.embedPng(png)
}

export function imageFit(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number
): { width: number; height: number } {
  const ratio = Math.min(boxWidth / imageWidth, boxHeight / imageHeight)
  return { width: imageWidth * ratio, height: imageHeight * ratio }
}

export async function getPageThumbnails(
  bytes: Uint8Array,
  maxWidth = 170,
  limit = 60,
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const doc = await loadPdfJs(bytes)
  const total = Math.min(doc.numPages, limit)
  const result: string[] = []
  for (let i = 0; i < total; i += 1) {
    const image = await renderPdfPage(doc, i + 1, { maxWidth })
    result.push(image.dataUrl)
    onProgress?.(i + 1, total)
  }
  await doc.destroy()
  return result
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'document'
}

export function todayStamp(): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
}

export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}
