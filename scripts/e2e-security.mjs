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
page.on('console', (message) => {
  if (message.type() === 'error') logs.push(`[console] ${message.text()}`)
})
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`))
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(400)

async function mock(openFile, saveName) {
  await app.evaluate(
    ({ dialog }, payload) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [payload.openFile] })
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: payload.savePath })
    },
    { openFile: path.join(samples, openFile), savePath: path.join(outDir, saveName) }
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

await openTool('解除密码')
await mock('sample-encrypted.pdf', 'unlocked.pdf')
await page.getByRole('button', { name: '选择文件' }).first().click()
await page.waitForTimeout(500)
await page.locator('.password-wrap input').fill('1234')
await page.getByRole('button', { name: '解除密码' }).last().click()
await page.getByText('处理完成', { exact: true }).waitFor({ timeout: 60000 })
console.log('unlock', await page.locator('.result-summary').innerText())
await save('unlocked.pdf')

await openTool('修复 PDF')
await mock('sample-broken.pdf', 'repaired.pdf')
await page.getByRole('button', { name: '选择文件' }).first().click()
await page.waitForTimeout(500)
await page.getByRole('button', { name: '尝试修复' }).click()
await page.getByText('处理完成', { exact: true }).waitFor({ timeout: 120000 })
console.log('repair', await page.locator('.result-summary').innerText())
console.log('notes', await page.locator('.result-notes').innerText())
await save('repaired.pdf')

console.log('LOGS', logs.join('\n'))
await app.close()
