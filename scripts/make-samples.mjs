import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@cantoo/fontkit'
import { PDFDocument, rgb } from '@cantoo/pdf-lib'

const root = process.cwd()
const outDir = path.join(root, 'samples')
await mkdir(outDir, { recursive: true })
const fontBytes = await readFile(path.join(root, 'resources/fonts/SourceHanSansSC-Regular.ttf'))

async function makeDoc(fileName, pages, meta = {}) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(fontBytes, { subset: true })
  const bold = await pdf.embedFont(fontBytes, { subset: true })
  pdf.setTitle(pages[0][0])
  pdf.setAuthor('青笺测试')
  for (const lines of pages) {
    const page = pdf.addPage([595.28, 841.89])
    page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(0.995, 0.992, 0.98) })
    page.drawRectangle({ x: 48, y: 760, width: 6, height: 34, color: rgb(0.247, 0.42, 0.322) })
    let y = 790
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      const isTitle = i === 0
      page.drawText(line, {
        x: 64,
        y,
        size: isTitle ? 23 : 11.5,
        font: isTitle ? bold : font,
        color: isTitle ? rgb(0.15, 0.19, 0.16) : rgb(0.28, 0.31, 0.28)
      })
      y -= isTitle ? 36 : 21
    }
    page.drawLine({
      start: { x: 48, y: 55 },
      end: { x: 547, y: 55 },
      thickness: 0.6,
      color: rgb(0.82, 0.8, 0.74)
    })
    page.drawText(meta.footer || '青笺 PDF · 测试文档', {
      x: 48,
      y: 37,
      size: 8,
      font,
      color: rgb(0.55, 0.56, 0.52)
    })
  }
  const bytes = await pdf.save()
  await writeFile(path.join(outDir, fileName), bytes)
  return bytes
}

const a = await makeDoc('sample-a.pdf', [
  [
    '项目季度报告',
    '2026 年第三季度 · 产品与设计',
    '',
    '一、整体进展',
    '本季度完成了桌面端 PDF 工具的第一轮设计与开发。',
    '核心能力包括页面整理、格式转换、编辑签署与安全保护。',
    '',
    '二、关键指标',
    '指标          目标        实际        状态',
    '周活跃用户    1,200       1,486       达成',
    '平均处理时长  18 秒       12 秒       优于目标',
    '用户满意度    4.5 / 5     4.7 / 5     达成',
    '',
    '三、下一步',
    '继续完善 OCR 识别质量，并补充批量处理能力。'
  ],
  [
    '附录 A · 页面整理',
    '一、合并与拆分',
    '合并支持多个 PDF 按顺序拼接；拆分支持逐页、范围和固定份数。',
    '',
    '二、旋转与裁切',
    '旋转可以校正扫描方向，裁切用于去掉多余白边。',
    '所有操作都会生成新文件，不覆盖原始文档。',
    '',
    '三、页码与页眉页脚',
    '页码支持起始页、格式和位置设置；页眉页脚支持占位符。'
  ],
  [
    '附录 B · 隐私说明',
    '一、本地处理',
    '所有文件都在本机内存中处理，不上传到任何服务器。',
    '',
    '二、临时文件',
    '关闭窗口后，内存中的文件与预览会一并释放。',
    '',
    '三、密码',
    '加密密码不会保存。忘记密码后无法恢复文件内容。'
  ]
])

await makeDoc('sample-b.pdf', [
  [
    '项目季度报告',
    '2026 年第三季度 · 产品与设计（修订版）',
    '',
    '一、整体进展',
    '本季度完成了桌面端 PDF 工具的设计、开发与首轮测试。',
    '核心能力已覆盖页面整理、格式转换、编辑签署与安全保护。',
    '',
    '二、关键指标',
    '指标          目标        实际        状态',
    '周活跃用户    1,200       1,642       超额达成',
    '平均处理时长  18 秒       11 秒       优于目标',
    '用户满意度    4.5 / 5     4.8 / 5     达成',
    '',
    '三、下一步',
    '继续完善 OCR 识别质量，并补充批量处理与快捷键。'
  ],
  [
    '附录 A · 页面整理',
    '一、合并与拆分',
    '合并支持多个 PDF 按顺序拼接；拆分支持逐页、范围和固定份数。',
    '',
    '二、旋转与裁切',
    '旋转可以校正扫描方向，裁切用于去掉多余白边。',
    '所有操作都会生成新文件，不覆盖原始文档。',
    '',
    '三、页码与页眉页脚',
    '页码支持起始页、格式和位置设置；页眉页脚支持占位符。',
    '',
    '四、新增：对比文档',
    '可以逐页比较两个版本的图像与文字差异。'
  ]
])

const encrypted = await PDFDocument.load(a)
encrypted.encrypt({
  userPassword: '1234',
  ownerPassword: 'owner-1234',
  algorithm: 'AES-256',
  permissions: { printing: 'highResolution', copying: false, modifying: false }
})
await writeFile(path.join(outDir, 'sample-encrypted.pdf'), await encrypted.save())

await writeFile(path.join(outDir, 'sample-broken.pdf'), a.subarray(0, Math.floor(a.length * 0.72)))

console.log('samples generated')
