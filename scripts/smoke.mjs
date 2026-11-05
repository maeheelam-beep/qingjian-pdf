import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
await mkdir(path.join(root, 'artifacts'), { recursive: true })
const env = { ...process.env, NODE_ENV: 'production' }
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({
  args: ['.'],
  cwd: root,
  env
})
const page = await app.firstWindow()
const logs = []
page.on('console', (message) => logs.push(`[${message.type()}] ${message.text()}`))
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`))
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(1800)
await page.screenshot({ path: path.join(root, 'artifacts', 'home.png'), fullPage: false })
console.log('TITLE', await page.title())
console.log('BODY', (await page.locator('body').innerText()).slice(0, 600))
console.log('LOGS', logs.join('\n'))
await app.close()
