import { createWorker } from 'tesseract.js'
import { PDFLibDocument, embedCjkFont, loadPdfJs, renderPdfPageToCanvas } from './pdf'
import type { ProgressFn, OpOutput } from './pdfOps'
import type { WorkFile } from './files'
import { stemOf } from './files'

type OcrLine = {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

function assetUrl(path: string): string {
  return new URL(path, window.location.href).href
}

function collectLines(blocks: unknown): OcrLine[] {
  type Node = {
    text?: string
    bbox?: OcrLine['bbox']
    paragraphs?: Node[]
    lines?: Node[]
  }
  const lines: OcrLine[] = []
  const blockList = Array.isArray(blocks) ? (blocks as Node[]) : []
  for (const block of blockList) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        if (!line.text?.trim() || !line.bbox) continue
        const bbox = line.bbox
        if (typeof bbox.x0 === 'number' && typeof bbox.y1 === 'number') {
          lines.push({ text: line.text.trim().replace(/\s+/g, ' '), bbox })
        }
      }
    }
  }
  return lines
}

export async function ocrPdf(
  file: WorkFile,
  options: { language: 'chi_sim+eng' | 'chi_sim' | 'eng'; pages?: string; output: 'pdf' | 'txt' },
  onProgress?: ProgressFn
): Promise<OpOutput> {
  onProgress?.(0.02, '正在准备 OCR 引擎')
  const source = await loadPdfJs(file.bytes)
  const totalPages = source.numPages
  let indices = Array.from({ length: totalPages }, (_, i) => i)
  if (options.pages?.trim() && options.pages.trim() !== '全部') {
    const selected = new Set<number>()
    options.pages.split(/[,，\s]+/).forEach((part) => {
      const range = part.match(/^(\d+)-(\d+)$/)
      if (range) {
        for (let n = Number(range[1]); n <= Number(range[2]); n += 1) {
          if (n >= 1 && n <= totalPages) selected.add(n - 1)
        }
      } else if (/^\d+$/.test(part)) {
        const n = Number(part)
        if (n >= 1 && n <= totalPages) selected.add(n - 1)
      }
    })
    if (selected.size) indices = [...selected].sort((a, b) => a - b)
  }

  const worker = await createWorker(options.language, 1, {
    langPath: assetUrl('tessdata'),
    gzip: false,
    workerPath: assetUrl('tesseract/worker.min.js'),
    corePath: assetUrl('tesseract'),
    workerBlobURL: false,
    logger: (message) => {
      if (message.status === 'recognizing text') {
        onProgress?.(0.08 + message.progress * 0.04, '正在识别文字')
      }
    }
  })

  const out = await PDFLibDocument.create()
  const allText: string[] = []
  let font: Awaited<ReturnType<typeof embedCjkFont>> | null = null
  try {
    for (let order = 0; order < indices.length; order += 1) {
      const pageIndex = indices[order]
      const canvas = await renderPdfPageToCanvas(source, pageIndex + 1, 210 / 72)
      onProgress?.(
        0.08 + (order / indices.length) * 0.08,
        `正在识别第 ${pageIndex + 1} 页 · ${order + 1} / ${indices.length}`
      )
      const result = await worker.recognize(canvas, {}, { text: true, blocks: true })
      const text = result.data.text.trim()
      allText.push(`第 ${pageIndex + 1} 页\n${text}`)
      if (options.output === 'pdf') {
        const lines = collectLines(result.data.blocks)
        const jpeg = await new Promise<Uint8Array>((resolve, reject) => {
          canvas.toBlob(
            async (blob) => {
              if (!blob) reject(new Error('页面图像生成失败'))
              else resolve(new Uint8Array(await blob.arrayBuffer()))
            },
            'image/jpeg',
            0.88
          )
        })
        const image = await out.embedJpg(jpeg)
        const pw = canvas.width / (210 / 72)
        const ph = canvas.height / (210 / 72)
        const page = out.addPage([pw, ph])
        page.drawImage(image, { x: 0, y: 0, width: pw, height: ph })
        if (!font) font = await embedCjkFont(out)
        for (const line of lines) {
          if (!line.text) continue
          const x = (line.bbox.x0 / canvas.width) * pw
          const yTop = (line.bbox.y0 / canvas.height) * ph
          const h = ((line.bbox.y1 - line.bbox.y0) / canvas.height) * ph
          const size = Math.max(3, Math.min(30, h * 0.92))
          page.drawText(line.text, {
            x,
            y: ph - yTop - size,
            size,
            font,
            opacity: 0
          })
        }
      }
      onProgress?.(
        0.16 + ((order + 1) / indices.length) * 0.78,
        `已识别 ${order + 1} / ${indices.length} 页`
      )
      await new Promise((r) => setTimeout(r, 0))
    }
  } finally {
    await worker.terminate()
    await source.destroy()
  }

  if (options.output === 'txt') {
    return {
      bytes: new TextEncoder().encode(allText.join('\n\n')),
      fileName: `${stemOf(file.name)}-OCR.txt`,
      mime: 'text/plain',
      summary: `已识别 ${indices.length} 页文字`,
      notes: ['纯文本结果不含版面；可在任意编辑器中校对']
    }
  }

  out.setTitle(`${stemOf(file.name)} · OCR`)
  out.setProducer('青笺 PDF + Tesseract')
  out.setCreator('青笺 PDF')
  out.setCreationDate(new Date())
  out.setModificationDate(new Date())
  const bytes = await out.save({ useObjectStreams: true })
  onProgress?.(1, 'OCR 完成')
  return {
    bytes,
    fileName: `${stemOf(file.name)}-OCR.pdf`,
    mime: 'application/pdf',
    summary: `已生成 ${indices.length} 页可搜索 PDF`,
    notes: ['页面图像保持原样，透明文字层使内容可搜索、可复制', '首次 OCR 需要加载语言模型，之后会更快']
  }
}
