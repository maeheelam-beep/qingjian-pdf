export type FileKind = 'pdf' | 'image' | 'office' | 'html' | 'text' | 'other'

export interface WorkFile {
  id: string
  name: string
  size: number
  bytes: Uint8Array
  path?: string
  kind: FileKind
  pageCount?: number
  previewUrl?: string
}

let counter = 0
export function uid(prefix = 'f'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter}`
}

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(digits)} ${units[index]}`
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function stemOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

export function kindOf(name: string): FileKind {
  const ext = extensionOf(name)
  if (ext === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff'].includes(ext)) return 'image'
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'office'
  if (['html', 'htm'].includes(ext)) return 'html'
  if (['txt', 'md', 'markdown'].includes(ext)) return 'text'
  return 'other'
}

export function asWorkFile(data: ArrayBuffer | Uint8Array, name: string, path?: string): WorkFile {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return {
    id: uid(),
    name,
    size: bytes.byteLength,
    bytes,
    path,
    kind: kindOf(name)
  }
}

export async function fileToWorkFile(file: File): Promise<WorkFile> {
  const buffer = await file.arrayBuffer()
  return asWorkFile(buffer, file.name)
}

export function downloadName(name: string, suffix: string, ext: string): string {
  return `${stemOf(name)}${suffix}.${ext}`
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'document'
}

export function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes)
  return new Blob([copy.buffer], { type })
}

export function makeObjectUrl(bytes: Uint8Array, type = 'application/pdf'): string {
  return URL.createObjectURL(bytesToBlob(bytes, type))
}

export function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function imageFileToDataUrl(file: WorkFile): Promise<string> {
  const ext = extensionOf(file.name)
  const mime =
    ext === 'png'
      ? 'image/png'
      : ext === 'webp'
        ? 'image/webp'
        : ext === 'gif'
          ? 'image/gif'
          : 'image/jpeg'
  return readAsDataUrl(bytesToBlob(file.bytes, mime))
}
