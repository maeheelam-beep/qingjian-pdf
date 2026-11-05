import { _electron as electron } from 'playwright-core'
import { mkdir, stat, readFile } from 'node:fs/promises'
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
await page.waitForTimeout(600)

async function mockDialog(openFiles, savePath) {
  await app.evaluate(
    ({ dialog }, payload) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: payload.openFiles })
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: payload.savePath })
    },
    { openFiles, savePath }
  )
}

async function gotoAllTools() {
  await page.getByRole('button', { name: '全部工具' }).click()
  await page.waitForTimeout(300)
}

async function openTool(name) {
  await gotoAllTools()
  await page.getByRole('button', { name: new RegExp(name) }).first().click()
  await page.waitForTimeout(300)
}

async function selectFile(buttonName = '选择文件') {
  await page.getByRole('button', { name: buttonName }).first().click()
  await page.waitForTimeout(450)
}

async function waitResult(timeout = 120000) {
  await page.getByText('处理完成', { exact: true }).waitFor({ timeout })
  const summary = await page.locator('.result-summary').innerText()
  return summary
}

async function saveAndVerify(fileName) {
  await page.getByRole('button', { name: '保存文件' }).click()
  await page.waitForTimeout(500)
  const savedPath = path.join(outDir, fileName)
  const info = await stat(savedPath)
  if (!info.isFile() || info.size < 20) throw new Error(`invalid output ${savedPath}`)
  await page.getByText('文件已妥帖保存').waitFor({ timeout: 5000 })
  console.log(`OK ${fileName} (${info.size} bytes)`)
  return info
}

async function testCompress() {
  await openTool('压缩 PDF')
  await mockDialog([path.join(samples, 'sample-a.pdf')], path.join(outDir, 'compressed.pdf'))
  await selectFile()
  await page.getByText('sample-a.pdf').first().waitFor()
  await page.getByRole('button', { name: /开始压缩/ }).click()
  const summary = await waitResult()
  console.log('compress:', summary)
  await saveAndVerify('compressed.pdf')
}

async function testMerge() {
  await openTool('合并 PDF')
  await mockDialog(
    [path.join(samples, 'sample-a.pdf'), path.join(samples, 'sample-b.pdf')],
    path.join(outDir, 'merged.pdf')
  )
  await selectFile()
  await page.getByText('sample-b.pdf').first().waitFor()
  await page.getByRole('button', { name: /开始合并/ }).click()
  const summary = await waitResult()
  console.log('merge:', summary)
  await saveAndVerify('merged.pdf')
}

async function testSplit() {
  await openTool('拆分 PDF')
  await mockDialog([path.join(samples, 'sample-a.pdf')], path.join(outDir, 'split.zip'))
  await selectFile()
  await page.getByText('sample-a.pdf').first().waitFor()
  await page.getByRole('button', { name: /拆分 PDF/ }).last().click()
  const summary = await waitResult()
  console.log('split:', summary)
  await saveAndVerify('split.zip')
}

try {
  await testCompress()
  await testMerge()
  await testSplit()
} finally {
  console.log('ERRORS', errors.join('\n'))
  await app.close()
}
