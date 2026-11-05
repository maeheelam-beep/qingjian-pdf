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
page.on('console', (message) => logs.push(`[${message.type()}] ${message.text()}`))
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`))
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(500)

await app.evaluate(
  ({ dialog }, payload) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: payload.openFiles })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: payload.savePath })
  },
  {
    openFiles: [path.join(samples, 'scan-1.pdf')],
    savePath: path.join(outDir, 'ocr.pdf')
  }
)

await page.getByRole('button', { name: '全部工具' }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: /OCR 文字识别/ }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: '选择文件' }).first().click()
await page.waitForTimeout(700)
await page.screenshot({ path: path.join(root, 'artifacts', 'tool-ocr.png') })
await page.getByRole('button', { name: /开始识别/ }).click()
try {
  await page.getByText('处理完成', { exact: true }).waitFor({ timeout: 300000 })
  const summary = await page.locator('.result-summary').innerText()
  console.log('OCR SUMMARY', summary)
  await page.getByRole('button', { name: '保存文件' }).click()
  await page.waitForTimeout(500)
  const info = await stat(path.join(outDir, 'ocr.pdf'))
  console.log('SAVED ocr.pdf', info.size)
} catch (error) {
  console.log('OCR FAILED', error.message)
  console.log('BODY', (await page.locator('body').innerText()).slice(-1000))
  await page.screenshot({ path: path.join(root, 'artifacts', 'ocr-failed.png') })
}
console.log('LOGS', logs.join('\n'))
await app.close()
