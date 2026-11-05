import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, HtmlPrintOptions, OpenDialogOptions, SaveDialogOptions } from '../shared/types'

const api: DesktopApi = {
  platform: process.platform,
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('window:maximized-changed', listener)
    return () => ipcRenderer.removeListener('window:maximized-changed', listener)
  },
  openFiles: (options?: OpenDialogOptions) => ipcRenderer.invoke('dialog:open-files', options),
  openPath: (path: string) => ipcRenderer.invoke('dialog:open-path', path),
  saveFile: (options: SaveDialogOptions, data: ArrayBuffer) =>
    ipcRenderer.invoke('dialog:save-file', options, data),
  revealPath: (path: string) => ipcRenderer.invoke('shell:reveal', path),
  openLocalFile: (path: string) => ipcRenderer.invoke('shell:open-local-file', path),
  getFontData: () => ipcRenderer.invoke('app:font-data'),
  htmlToPdf: (options: HtmlPrintOptions) => ipcRenderer.invoke('app:html-to-pdf', options),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url)
}

contextBridge.exposeInMainWorld('desktop', api)
