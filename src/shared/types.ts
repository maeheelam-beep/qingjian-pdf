export interface OpenedFile {
  name: string
  path: string
  size: number
  data: ArrayBuffer
}

export interface SaveResult {
  path: string
  name: string
}

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface OpenDialogOptions {
  title?: string
  filters?: FileFilter[]
  multiple?: boolean
  directory?: boolean
}

export interface SaveDialogOptions {
  title?: string
  defaultName: string
  filters?: FileFilter[]
}

export interface HtmlPrintOptions {
  html?: string
  url?: string
  filePath?: string
  pageSize?: 'A4' | 'A3' | 'Letter' | 'Legal'
  landscape?: boolean
  marginMm?: number
  printBackground?: boolean
}

export interface AppInfo {
  version: string
  electron: string
  platform: string
  resourcesPath: string
}

export interface RecentFile {
  path: string
  name: string
  size: number
  toolId?: string
  at: number
}

export interface DesktopApi {
  platform: string
  windowMinimize: () => void
  windowToggleMaximize: () => void
  windowClose: () => void
  windowIsMaximized: () => Promise<boolean>
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void
  openFiles: (options?: OpenDialogOptions) => Promise<OpenedFile[]>
  openPath: (path: string) => Promise<OpenedFile>
  saveFile: (options: SaveDialogOptions, data: ArrayBuffer) => Promise<SaveResult | null>
  revealPath: (path: string) => Promise<boolean>
  openLocalFile: (path: string) => Promise<string>
  getFontData: () => Promise<ArrayBuffer>
  htmlToPdf: (options: HtmlPrintOptions) => Promise<ArrayBuffer>
  getAppInfo: () => Promise<AppInfo>
  openExternal: (url: string) => Promise<void>
}
