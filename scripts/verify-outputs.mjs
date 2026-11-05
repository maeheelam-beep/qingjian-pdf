import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import JSZip from 'jszip'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const root = process.cwd()
const out = path.join(root, 'artifacts', 'outputs')
const results = []

async function checkPdf(name, password) {
  try {
    const bytes = await readFile(path.join(out, name))
    const doc = await PDFDocument.load(bytes, password ? { password } : {})
    const pages = doc.getPageCount()
    const encrypted = doc.isEncrypted
    let text = ''
    try {
      const js = await pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false }).promise
      for (let i = 1; i <= Math.min(js.numPages, 3); i++) {
        const p = await js.getPage(i)
        const content = await p.getTextContent()
        text += content.items.map((item) => item.str || '').join(' ')
      }
      await js.destroy()
    } catch (error) {
      text = `[pdfjs error] ${error.message}`
    }
    results.push({ name, pages, encrypted, text: text.slice(0, 220) })
  } catch (error) {
    results.push({ name, error: error.message })
  }
}

await checkPdf('compressed.pdf')
await checkPdf('merged.pdf')
await checkPdf('numbering.pdf')
await checkPdf('watermark.pdf')
await checkPdf('protected.pdf')
await checkPdf('protected.pdf', 'test1234')
await checkPdf('unlocked.pdf')
await checkPdf('archive.pdf')
await checkPdf('repaired.pdf')

for (const [name, entry] of [
  ['sample.docx', 'word/document.xml'],
  ['sample.xlsx', 'xl/workbook.xml'],
  ['sample.pptx', 'ppt/presentation.xml']
]) {
  try {
    const zip = await JSZip.loadAsync(await readFile(path.join(out, name)))
    const file = zip.file(entry)
    results.push({ name, entries: Object.keys(zip.files).length, main: Boolean(file) })
  } catch (error) {
    results.push({ name, error: error.message })
  }
}

for (const name of ['sample-images.zip', 'split.zip']) {
  try {
    const zip = await JSZip.loadAsync(await readFile(path.join(out, name)))
    results.push({ name, files: Object.keys(zip.files) })
  } catch (error) {
    results.push({ name, error: error.message })
  }
}

const md = await readFile(path.join(out, 'sample.md'), 'utf8')
results.push({ name: 'sample.md', content: md.slice(0, 120) })

console.log(JSON.stringify(results, null, 2))
