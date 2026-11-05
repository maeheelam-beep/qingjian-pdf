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
const logs = []
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()) })
page.on('pageerror', (e) => logs.push(e.message))
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(400)

async function mock(openFiles, saveName) {
  await app.evaluate(
    ({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p.openFiles })
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p.savePath })
    },
    { openFiles: openFiles.map((f) => path.join(samples, f)), savePath: path.join(outDir, saveName) }
  )
}
async function openTool(name) {
  await page.getByRole('button', { name: '全部工具' }).click()
  await page.waitForTimeout(200)
  await page.locator('.tool-card').filter({ hasText: name }).first().click()
  await page.waitForTimeout(300)
}
async function save(name) {
  await page.getByRole('button', { name: '保存文件' }).click()
  await page.waitForTimeout(500)
  const info = await stat(path.join(outDir, name))
  console.log('SAVED', name, info.size)
  if (info.size < 30) throw new Error('bad output')
}
async function choose(files, saveName) {
  await mock(files, saveName)
  await page.getByRole('button', { name: '选择文件' }).first().click()
  await page.waitForTimeout(500)
}
async function done() {
  await page.getByText('处理完成', { exact: true }).waitFor({ timeout: 180000 })
  console.log(await page.locator('.result-summary').innerText())
}

for (const [label, file, output] of [
  ['Office 转 PDF', 'sample.xlsx', 'office-xlsx.pdf'],
  ['Office 转 PDF', 'sample.pptx', 'office-pptx.pdf']
]) {
  await openTool(label)
  await choose([file], output)
  await page.getByRole('button', { name: '转换为 PDF' }).click()
  await done()
  await save(output)
}

await openTool('页眉页脚')
await choose(['sample-a.pdf'], 'header-footer.pdf')
await page.getByRole('button', { name: '写入页眉页脚' }).click()
await done()
await save('header-footer.pdf')

await openTool('旋转页面')
await choose(['sample-a.pdf'], 'rotated.pdf')
await page.getByRole('tab', { name: /旋转 180/ }).click()
await page.getByRole('button', { name: '旋转页面' }).last().click()
await done()
await save('rotated.pdf')

await openTool('PDF 转 Word')
await choose(['sample-a.pdf'], 'layout.docx')
await page.getByRole('button', { name: /保留版式/ }).click()
await page.getByRole('button', { name: '转换为 Word' }).click()
await done()
await save('layout.docx')

console.log('LOGS', logs.join('\n'))
await app.close()
