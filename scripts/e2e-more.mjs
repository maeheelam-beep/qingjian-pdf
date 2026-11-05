import { _electron as electron } from 'playwright-core'
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const samples = path.join(root, 'samples')
const outDir = path.join(root, 'artifacts', 'outputs')
await mkdir(outDir, { recursive: true })
const env = { ...process.env, NODE_ENV: 'production' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], cwd: root, env })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`[console] ${message.text()}`)
})
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(500)

async function mock(openFiles, saveName) {
  await app.evaluate(
    ({ dialog }, payload) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: payload.openFiles })
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: payload.savePath })
    },
    { openFiles, savePath: path.join(outDir, saveName) }
  )
}

async function openTool(name) {
  await page.getByRole('button', { name: '全部工具' }).click()
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: new RegExp(name) }).first().click()
  await page.waitForTimeout(300)
}

async function selectFile(file, saveName) {
  await mock([path.join(samples, file)], saveName)
  await page.getByRole('button', { name: '选择文件' }).first().click()
  await page.waitForTimeout(500)
}

async function run(label) {
  await page.getByRole('button', { name: new RegExp(label) }).last().click()
  await page.getByText('处理完成', { exact: true }).waitFor({ timeout: 180000 })
  const summary = await page.locator('.result-summary').innerText()
  console.log(`RUN ${label}: ${summary}`)
}

async function save(name) {
  await page.getByRole('button', { name: '保存文件' }).click()
  await page.waitForTimeout(500)
  const info = await stat(path.join(outDir, name))
  if (info.size < 30) throw new Error(`bad output ${name}`)
  console.log(`SAVED ${name} ${info.size}`)
}

async function convert(tool, action, output) {
  await openTool(tool)
  await selectFile('sample-a.pdf', output)
  await run(action)
  await save(output)
}

try {
  await convert('PDF 转 Word', '转换为 Word', 'sample.docx')
  await convert('PDF 转 Excel', '转换为 Excel', 'sample.xlsx')
  await convert('PDF 转 PPT', '转换为 PPT', 'sample.pptx')
  await convert('PDF 转图片', '导出图片', 'sample-images.zip')
  await convert('PDF 转 Markdown', '提取文字', 'sample.md')

  await openTool('添加页码')
  await selectFile('sample-a.pdf', 'numbering.pdf')
  await run('添加页码')
  await save('numbering.pdf')

  await openTool('添加水印')
  await selectFile('sample-a.pdf', 'watermark.pdf')
  await run('添加水印')
  await save('watermark.pdf')

  await openTool('加密保护')
  await selectFile('sample-a.pdf', 'protected.pdf')
  const passwords = page.locator('.password-section input')
  await passwords.nth(0).fill('test1234')
  await passwords.nth(1).fill('test1234')
  await run('加密文件')
  await save('protected.pdf')

  await openTool('解除密码')
  await selectFile('sample-encrypted.pdf', 'unlocked.pdf')
  await page.locator('.password-wrap input').fill('1234')
  await run('解除密码')
  await save('unlocked.pdf')

  await openTool('PDF/A 归档')
  await selectFile('sample-a.pdf', 'archive.pdf')
  await run('转换为 PDF/A')
  await save('archive.pdf')

  await openTool('修复 PDF')
  await selectFile('sample-broken.pdf', 'repaired.pdf')
  await run('尝试修复')
  await save('repaired.pdf')
} finally {
  console.log('ERRORS', errors.join('\n'))
  await app.close()
}
