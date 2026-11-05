import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument } from '@cantoo/pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const out = path.join(process.cwd(), 'artifacts', 'outputs')
async function inspect(name, { password } = {}) {
  const bytes = await readFile(path.join(out, name))
  let doc
  try {
    doc = await PDFDocument.load(bytes, password ? { password } : {})
  } catch (error) {
    return { name, error: error.message }
  }
  let text = ''
  let pdfjsError = null
  try {
    const js = await pdfjs.getDocument({ data: new Uint8Array(bytes), useWorkerFetch: false, isEvalSupported: false }).promise
    for (let i = 1; i <= js.numPages; i += 1) {
      const p = await js.getPage(i)
      const content = await p.getTextContent()
      text += content.items.map((item) => item.str || '').join(' ') + '\n'
    }
    await js.destroy()
  } catch (error) {
    pdfjsError = error.message
  }
  const pages = doc.getPages()
  return {
    name,
    pageCount: doc.getPageCount(),
    encrypted: doc.isEncrypted,
    sizes: pages.map((p) => {
      const { width, height } = p.getSize()
      return [Math.round(width), Math.round(height)]
    }),
    rotations: pages.map((p) => p.getRotation().angle),
    text: text.slice(0, 320),
    pdfjsError
  }
}

console.log(
  JSON.stringify(
    [
      await inspect('organized.pdf'),
      await inspect('cropped.pdf'),
      await inspect('edited.pdf'),
      await inspect('signed.pdf'),
      await inspect('redacted.pdf'),
      await inspect('scanned.pdf'),
      await inspect('web.pdf'),
      await inspect('office.pdf'),
      await inspect('images.pdf'),
      await inspect('ocr.pdf'),
      await inspect('unlocked.pdf'),
      await inspect('repaired.pdf')
    ],
    null,
    2
  )
)
