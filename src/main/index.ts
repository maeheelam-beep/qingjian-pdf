import { app, BrowserWindow, dialog, ipcMain, nativeTheme, protocol, screen, session, shell } from 'electron'
import { join, normalize, resolve, sep } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import type {
  AppInfo,
  HtmlPrintOptions,
  OpenDialogOptions,
  OpenedFile,
  SaveDialogOptions,
  SaveResult
} from '../shared/types'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

app.setName('青笺 PDF')
app.setPath('userData', join(app.getPath('appData'), 'QingjianPDF'))

let mainWindow: BrowserWindow | null = null

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.traineddata': 'application/octet-stream',
  '.gz': 'application/gzip',
  '.pdf': 'application/pdf'
}

function resourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
}

function rendererRoot(): string {
  return join(__dirname, '../renderer')
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

async function readPdfFile(path: string): Promise<OpenedFile> {
  const data = await readFile(path)
  return {
    name: path.split(/[\\/]/).pop() || 'document.pdf',
    path,
    size: data.byteLength,
    data: toArrayBuffer(data)
  }
}

function registerAppProtocol(): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    const rawPath = decodeURIComponent(url.pathname)
    const relative = rawPath === '/' || rawPath === '' ? 'index.html' : rawPath.replace(/^\/+/, '')
    const root = resolve(rendererRoot())
    const filePath = normalize(join(root, relative))
    if (!filePath.startsWith(root + sep) && filePath !== root) {
      return new Response('Forbidden', { status: 403 })
    }
    try {
      const body = await readFile(filePath)
      const bodyBuffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
      return new Response(bodyBuffer, {
        headers: {
          'content-type': MIME[ext] || 'application/octet-stream',
          'cache-control': app.isPackaged ? 'public, max-age=31536000, immutable' : 'no-store'
        }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function createWindow(): void {
  const icon = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'resources/icon.png')
  const workArea = screen.getPrimaryDisplay().workAreaSize
  const width = Math.max(1060, Math.min(1280, workArea.width - 48))
  const height = Math.max(690, Math.min(820, workArea.height - 48))
  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1060,
    minHeight: 690,
    center: true,
    show: false,
    frame: false,
    roundedCorners: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171914' : '#f6f3ea',
    title: '青笺 PDF',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  mainWindow.setMenu(null)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  const emitMaximized = (): void => {
    mainWindow?.webContents.send('window:maximized-changed', mainWindow.isMaximized())
  }
  mainWindow.on('maximize', emitMaximized)
  mainWindow.on('unmaximize', emitMaximized)
  mainWindow.on('enter-full-screen', emitMaximized)
  mainWindow.on('leave-full-screen', emitMaximized)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() || ''
    if (url !== current) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadURL('app://bundle/index.html')
  }
}

async function printHtml(options: HtmlPrintOptions): Promise<ArrayBuffer> {
  const printWindow = new BrowserWindow({
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      javascript: true
    }
  })

  try {
    if (options.filePath) {
      await printWindow.loadURL(pathToFileURL(options.filePath).toString())
    } else if (options.url) {
      await printWindow.loadURL(options.url)
    } else {
      const html = options.html || '<!doctype html><title>空白页</title>'
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    }
    await printWindow.webContents.executeJavaScript(
      'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true',
      true
    )
    await new Promise((r) => setTimeout(r, 350))
    const margin = ((options.marginMm ?? 12) / 25.4).toFixed(3)
    const data = await printWindow.webContents.printToPDF({
      printBackground: options.printBackground !== false,
      pageSize: options.pageSize || 'A4',
      landscape: Boolean(options.landscape),
      preferCSSPageSize: false,
      margins: {
        top: Number(margin),
        bottom: Number(margin),
        left: Number(margin),
        right: Number(margin)
      }
    })
    return toArrayBuffer(data)
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy()
  }
}

function registerIpc(): void {
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:toggle-maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('dialog:open-files', async (_event, options?: OpenDialogOptions): Promise<OpenedFile[]> => {
    if (!mainWindow) return []
    if (options?.directory) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: options?.title,
        properties: ['openDirectory']
      })
      if (result.canceled || !result.filePaths[0]) return []
      return [await readPdfFile(result.filePaths[0])]
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options?.title,
      filters: options?.filters ?? [{ name: 'PDF 文件', extensions: ['pdf'] }],
      properties: options?.multiple ? ['openFile', 'multiSelections'] : ['openFile']
    })
    if (result.canceled) return []
    return Promise.all(result.filePaths.map(readPdfFile))
  })

  ipcMain.handle('dialog:open-path', async (_event, path: string): Promise<OpenedFile> => {
    return readPdfFile(path)
  })

  ipcMain.handle(
    'dialog:save-file',
    async (_event, options: SaveDialogOptions, data: ArrayBuffer): Promise<SaveResult | null> => {
      if (!mainWindow) return null
      const result = await dialog.showSaveDialog(mainWindow, {
        title: options.title ?? '保存文件',
        defaultPath: options.defaultName,
        filters: options.filters
      })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, Buffer.from(data))
      const name = result.filePath.split(/[\\/]/).pop() || options.defaultName
      return { path: result.filePath, name }
    }
  )

  ipcMain.handle('shell:reveal', async (_event, path: string): Promise<boolean> => {
    if (!path) return false
    shell.showItemInFolder(path)
    return true
  })

  ipcMain.handle('shell:open-external', async (_event, url: string): Promise<void> => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  })

  ipcMain.handle('shell:open-local-file', async (_event, path: string): Promise<string> => {
    return shell.openPath(path)
  })

  ipcMain.handle('app:font-data', async (): Promise<ArrayBuffer> => {
    const path = join(resourcesRoot(), 'fonts', 'SourceHanSansSC-Regular.ttf')
    const data = await readFile(path)
    return toArrayBuffer(data)
  })

  ipcMain.handle('app:html-to-pdf', async (_event, options: HtmlPrintOptions): Promise<ArrayBuffer> => {
    return printHtml(options)
  })

  ipcMain.handle('app:info', (): AppInfo => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      resourcesPath: resourcesRoot()
    }
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.qingjian.pdf')
    registerAppProtocol()
    registerIpc()

    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media' || permission === 'clipboard-read')
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
