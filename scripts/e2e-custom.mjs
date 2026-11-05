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
  await page.locator('.tool-card').filter({ hasText: name }).first().click()
  await page.waitForTimeout(350)
}

async function choose(file, saveName) {
  await mock([path.join(samples, file)], saveName)
  await page.getByRole('button', { name: '选择文件' }).first().click()
  await page.waitForTimeout(650)
}

async function waitDone() {
  await page.getByText('处理完成', { exact: true }).waitFor({ timeout: 180000 })
  const summary = await page.locator('.result-summary').innerText()
  return summary
}

async function save(name) {
  await page.getByRole('button', { name: '保存文件' }).click()
  await page.waitForTimeout(500)
  const info = await stat(path.join(outDir, name))
  if (info.size < 30) throw new Error('invalid output')
  return info.size
}

const results = []
async function test(name, fn) {
  try {
    await fn()
    results.push(`OK ${name}`)
    console.log(`OK ${name}`)
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`)
    console.log(`FAIL ${name}: ${error.message}`)
    await page.screenshot({ path: path.join(root, 'artifacts', `fail-${name}.png`) }).catch(() => {})
    await page.getByRole('button', { name: '全部工具' }).click().catch(() => {})
    await page.waitForTimeout(300)
  }
}

await test('organize', async () => {
  await openTool('整理页面')
  await choose('sample-a.pdf', 'organized.pdf')
  await page.locator('.page-card').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1200)
  const count = await page.locator('.page-card').count()
  if (count !== 3) throw new Error(`page cards ${count}`)
  await page.locator('.page-card').first().getByTitle('顺时针旋转').click()
  await page.locator('.page-card').nth(2).getByTitle('删除页面').click()
  await page.getByRole('button', { name: '保存整理结果' }).click()
  console.log('organize:', await waitDone())
  console.log('saved', await save('organized.pdf'))
})

await test('crop', async () => {
  await openTool('裁切页面')
  await choose('sample-a.pdf', 'cropped.pdf')
  await page.locator('.crop-canvas img').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: '裁切并保存' }).click()
  console.log('crop:', await waitDone())
  console.log('saved', await save('cropped.pdf'))
})

await test('edit', async () => {
  await openTool('编辑 PDF')
  await choose('sample-a.pdf', 'edited.pdf')
  await page.locator('.edit-canvas img').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: '添加文字' }).click()
  const textarea = page.locator('.inspector-textarea')
  await textarea.waitFor()
  await textarea.fill('测试编辑：这是一段新增文字。')
  await page.getByRole('button', { name: '导出编辑结果' }).click()
  console.log('edit:', await waitDone())
  console.log('saved', await save('edited.pdf'))
})

await test('sign', async () => {
  await openTool('签署 PDF')
  await choose('sample-a.pdf', 'signed.pdf')
  await page.locator('.sign-page img').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: /输入/ }).click()
  await page.getByPlaceholder('输入姓名或称谓').fill('林澄')
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: '签署并保存' }).click()
  console.log('sign:', await waitDone())
  console.log('saved', await save('signed.pdf'))
})

await test('redact', async () => {
  await openTool('涂黑脱敏')
  await choose('sample-a.pdf', 'redacted.pdf')
  const area = page.locator('.redact-page')
  await area.waitFor({ timeout: 30000 })
  const box = await area.boundingBox()
  if (!box) throw new Error('no redact box')
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.28, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '永久遮盖并导出' }).click()
  console.log('redact:', await waitDone())
  console.log('saved', await save('redacted.pdf'))
})

await test('scan', async () => {
  await openTool('扫描成 PDF')
  await mock([path.join(samples, 'scan-1.jpg'), path.join(samples, 'scan-2.jpg')], 'scanned.pdf')
  await page.getByRole('button', { name: /导入图片/ }).click()
  await page.waitForTimeout(600)
  await page.locator('.scan-card').first().waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: '生成扫描 PDF' }).click()
  console.log('scan:', await waitDone())
  console.log('saved', await save('scanned.pdf'))
})

await test('compare', async () => {
  await openTool('对比文档')
  await mock([path.join(samples, 'sample-a.pdf')], 'unused.pdf')
  await page.getByRole('button', { name: /放入旧版本/ }).click()
  await page.waitForTimeout(500)
  await mock([path.join(samples, 'sample-b.pdf')], 'unused.pdf')
  await page.getByRole('button', { name: /放入新版本/ }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '开始对比' }).click()
  await page.getByText(/发现 \d+ 页存在差异|两个版本内容一致/).waitFor({ timeout: 120000 })
  const heading = await page.locator('.compare-summary h3').innerText()
  console.log('compare:', heading)
  await page.screenshot({ path: path.join(root, 'artifacts', 'compare-result.png') })
})

await test('html', async () => {
  await openTool('HTML 转 PDF')
  await page.getByRole('tab', { name: /本地文件/ }).click()
  await mock([path.join(samples, 'sample.html')], 'web.pdf')
  await page.getByRole('button', { name: /选择本地 HTML 文件/ }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '生成 PDF' }).click()
  console.log('html:', await waitDone())
  console.log('saved', await save('web.pdf'))
})

await test('office', async () => {
  await openTool('Office 转 PDF')
  await choose('sample.docx', 'office.pdf')
  await page.getByRole('button', { name: '转换为 PDF' }).click()
  console.log('office:', await waitDone())
  console.log('saved', await save('office.pdf'))
})

await test('images', async () => {
  await openTool('图片转 PDF')
  await mock([path.join(samples, 'scan-1.jpg'), path.join(samples, 'scan-2.jpg')], 'images.pdf')
  await page.getByRole('button', { name: '选择文件' }).first().click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '生成 PDF' }).click()
  console.log('images:', await waitDone())
  console.log('saved', await save('images.pdf'))
})

console.log('\nRESULTS\n' + results.join('\n'))
console.log('\nLOGS\n' + logs.join('\n'))
await app.close()
