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
await app.evaluate(
  ({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p.openFiles })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p.savePath })
  },
  { openFiles: [path.join(samples, 'sample-a.pdf')], savePath: path.join(outDir, 'recent-test.pdf') }
)

await page.getByRole('button', { name: '全部工具' }).click()
await page.waitForTimeout(250)
await page.locator('.tool-card').filter({ hasText: '压缩 PDF' }).click()
await page.waitForTimeout(250)
await page.getByRole('button', { name: '选择文件' }).first().click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: /开始压缩/ }).click()
await page.getByText('处理完成', { exact: true }).waitFor({ timeout: 60000 })
await page.getByRole('button', { name: '保存文件' }).click()
await page.waitForTimeout(600)
console.log('SAVED', (await stat(path.join(outDir, 'recent-test.pdf'))).size)

await page.getByRole('button', { name: '工作台', exact: true }).click()
await page.waitForTimeout(600)
const recentText = await page.locator('.recent-card').innerText()
console.log('RECENT CARD', recentText.replace(/\n/g, ' | '))
await page.screenshot({ path: path.join(root, 'artifacts', 'home-recent.png') })
await page.locator('.recent-row').first().click()
await page.waitForTimeout(700)
const body = await page.locator('body').innerText()
console.log('REOPENED', body.includes('recent-test.pdf'), body.includes('开始压缩'))
await page.screenshot({ path: path.join(root, 'artifacts', 'reopened-recent.png') })
console.log('LOGS', logs.join('\n'))
await app.close()
