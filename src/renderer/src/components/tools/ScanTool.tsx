import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Loader2,
  ScanLine,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import type { WorkFile } from '../../lib/files'
import { formatBytes, imageFileToDataUrl, kindOf } from '../../lib/files'
import type { ToolDef } from '../../lib/tools'
import { canvasToBytes } from '../../lib/pdf'
import { makePdfFromImages } from '../../lib/pdfOps'
import type { RunTask } from '../ToolPage'
import { DropZone } from '../FilePicker'
import { Button, Field, RangeField, SectionTitle, Segmented, Select } from '../ui'

type ScanFilter = 'original' | 'gray' | 'bw' | 'enhance'

const FILTER_CSS: Record<ScanFilter, string> = {
  original: 'none',
  gray: 'grayscale(1) contrast(1.02)',
  bw: 'grayscale(1) contrast(1.65) brightness(1.06)',
  enhance: 'grayscale(.45) contrast(1.18) brightness(1.04) saturate(.85)'
}

export function ScanTool({
  tool,
  initialFiles,
  run,
  notify
}: {
  tool: ToolDef
  initialFiles?: WorkFile[]
  run: RunTask
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void
}): React.JSX.Element {
  const [images, setImages] = useState<WorkFile[]>(initialFiles ?? [])
  const [filter, setFilter] = useState<ScanFilter>('enhance')
  const [pageSize, setPageSize] = useState<'a4' | 'fit'>('a4')
  const [marginMm, setMarginMm] = useState(6)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraBusy, setCameraBusy] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      for (const file of images) {
        if (thumbs[file.id]) continue
        try {
          const url = await imageFileToDataUrl(file)
          if (alive) setThumbs((current) => ({ ...current, [file.id]: url }))
        } catch {
          /* ignore preview errors */
        }
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images])

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !streamRef.current) return
    videoRef.current.srcObject = streamRef.current
    void videoRef.current.play()
  }, [cameraOpen])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const addFiles = (incoming: WorkFile[]): void => {
    const accepted = incoming.filter((file) => file.kind === 'image')
    if (!accepted.length) {
      notify('请选择图片文件', 'error')
      return
    }
    setImages((current) => [...current, ...accepted])
  }

  const pickImages = async (): Promise<void> => {
    const opened = await window.desktop.openFiles({
      title: '选择扫描图片',
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }],
      multiple: true
    })
    if (!opened.length) return
    addFiles(
      opened.map((item) => ({
        id: `scan_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: item.name,
        size: item.size,
        bytes: new Uint8Array(item.data),
        path: item.path,
        kind: kindOf(item.name)
      }))
    )
  }

  const openCamera = async (): Promise<void> => {
    setCameraBusy(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      })
      streamRef.current = stream
      setCameraOpen(true)
    } catch {
      notify('无法打开摄像头，请检查系统权限或直接导入图片', 'error')
    } finally {
      setCameraBusy(false)
    }
  }

  const closeCamera = (): void => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOpen(false)
  }

  const capture = async (): Promise<void> => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1600
    canvas.height = video.videoHeight || 1200
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) return
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const file: WorkFile = {
      id: `capture_${Date.now()}`,
      name: `扫描-${new Date().toLocaleTimeString('zh-CN', { hour12: false }).replace(/:/g, '')}.jpg`,
      size: bytes.byteLength,
      bytes,
      kind: 'image'
    }
    setImages((current) => [...current, file])
    closeCamera()
  }

  const move = (id: string, direction: -1 | 1): void => {
    setImages((current) => {
      const index = current.findIndex((file) => file.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const processImage = async (file: WorkFile): Promise<WorkFile> => {
    if (filter === 'original') return file
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(file.bytes).buffer]), {
      imageOrientation: 'from-image'
    })
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法读取图片')
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      if (filter === 'gray') {
        data[i] = gray
        data[i + 1] = gray
        data[i + 2] = gray
      } else if (filter === 'bw') {
        const value = gray > 158 ? 255 : 24
        data[i] = value
        data[i + 1] = value
        data[i + 2] = value
      } else {
        const value = Math.max(0, Math.min(255, (gray - 128) * 1.2 + 137))
        data[i] = value * 0.98
        data[i + 1] = value
        data[i + 2] = value * 0.96
      }
    }
    ctx.putImageData(imageData, 0, 0)
    const bytes = await canvasToBytes(canvas, 'image/jpeg', 0.9)
    return {
      ...file,
      name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
      size: bytes.byteLength,
      bytes,
      kind: 'image'
    }
  }

  const start = async (): Promise<void> => {
    if (!images.length) {
      notify('请先添加图片或拍摄扫描件', 'error')
      return
    }
    await run(async (progress) => {
      const processed: WorkFile[] = []
      for (let i = 0; i < images.length; i += 1) {
        progress((i / images.length) * 0.45, `正在优化第 ${i + 1} / ${images.length} 张`)
        processed.push(await processImage(images[i]))
      }
      return makePdfFromImages(
        processed,
        { pageSize, orientation: 'auto', marginMm: pageSize === 'fit' ? 0 : marginMm },
        (ratio, label) => progress(0.45 + ratio * 0.55, label)
      )
    }, images[0].name)
  }

  return (
    <div className="generic-layout">
      <div className="tool-main">
        <section className="panel">
          <SectionTitle hint="导入照片，或直接用摄像头拍摄">
            <span className="step-number">01</span> 添加扫描页
          </SectionTitle>
          <div className="scan-actions">
            <button type="button" className="scan-action-card" onClick={() => void pickImages()}>
              <span className="scan-action-icon">
                <ImagePlus size={21} />
              </span>
              <div>
                <strong>导入图片</strong>
                <span>JPG、PNG、WebP</span>
              </div>
            </button>
            <button type="button" className="scan-action-card" onClick={() => void openCamera()}>
              <span className="scan-action-icon">
                {cameraBusy ? <Loader2 size={21} className="spin" /> : <Camera size={21} />}
              </span>
              <div>
                <strong>打开摄像头</strong>
                <span>拍摄纸质文件</span>
              </div>
            </button>
            <DropZone
              tool={tool}
              compact
              label="也可以拖入图片"
              onFiles={addFiles}
              onError={notify}
            />
          </div>
        </section>

        {images.length > 0 && (
          <section className="panel">
            <div className="scan-list-head">
              <SectionTitle hint={`${images.length} 张 · 按列表顺序装订`}>
                <span className="step-number">02</span> 检查与排序
              </SectionTitle>
              <Segmented
                compact
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'original', label: '原色' },
                  { value: 'enhance', label: '增强' },
                  { value: 'gray', label: '灰度' },
                  { value: 'bw', label: '黑白' }
                ]}
              />
            </div>
            <div className="scan-grid">
              {images.map((file, index) => (
                <div className="scan-card" key={file.id}>
                  <div className="scan-card-image">
                    {thumbs[file.id] ? (
                      <img src={thumbs[file.id]} alt={file.name} style={{ filter: FILTER_CSS[filter] }} />
                    ) : (
                      <Loader2 size={16} className="spin" />
                    )}
                    <span className="scan-page-number">{String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <div className="scan-card-meta">
                    <strong title={file.name}>{file.name}</strong>
                    <span>{formatBytes(file.size)}</span>
                  </div>
                  <div className="scan-card-actions">
                    <button type="button" onClick={() => move(file.id, -1)} disabled={index === 0} title="前移">
                      <ChevronUp size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(file.id, 1)}
                      disabled={index === images.length - 1}
                      title="后移"
                    >
                      <ChevronDown size={13} />
                    </button>
                    <button
                      type="button"
                      className="scan-remove"
                      onClick={() => setImages((current) => current.filter((item) => item.id !== file.id))}
                      title="移除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {images.length > 0 && (
          <section className="panel">
            <SectionTitle hint="决定装订后的纸张与留白">
              <span className="step-number">03</span> 装订设置
            </SectionTitle>
            <div className="scan-settings">
              <Field label="页面尺寸">
                <Select
                  value={pageSize}
                  onChange={setPageSize}
                  options={[
                    { value: 'a4', label: 'A4 纸张' },
                    { value: 'fit', label: '跟随图片' }
                  ]}
                />
              </Field>
              <Field label="页边距">
                <RangeField
                  value={marginMm}
                  min={0}
                  max={24}
                  step={1}
                  onChange={setMarginMm}
                  valueLabel={`${marginMm} mm`}
                />
              </Field>
            </div>
          </section>
        )}
      </div>

      <aside className="tool-rail">
        <div className="rail-card">
          <span className="rail-kicker">SCAN</span>
          <h3>{images.length ? `${images.length} 张待装订` : '等待扫描页'}</h3>
          <div className="rail-summary">
            <div>
              <span>色彩</span>
              <strong>
                {filter === 'original' ? '原色' : filter === 'enhance' ? '增强' : filter === 'gray' ? '灰度' : '黑白'}
              </strong>
            </div>
            <div>
              <span>纸张</span>
              <strong>{pageSize === 'a4' ? 'A4' : '跟随图片'}</strong>
            </div>
            <div>
              <span>留白</span>
              <strong>{pageSize === 'a4' ? `${marginMm} mm` : '无'}</strong>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="rail-action"
            disabled={!images.length}
            icon={<Sparkles size={17} />}
            onClick={() => void start()}
          >
            生成扫描 PDF
          </Button>
          <span className="rail-foot">
            <ScanLine size={12} /> 图片会按顺序装订
          </span>
        </div>
      </aside>

      {cameraOpen && (
        <div className="camera-overlay">
          <div className="camera-modal">
            <div className="camera-head">
              <div>
                <span className="section-kicker">CAMERA</span>
                <h3>拍摄扫描页</h3>
              </div>
              <button type="button" className="camera-close" onClick={closeCamera} aria-label="关闭摄像头">
                <X size={17} />
              </button>
            </div>
            <div className="camera-frame">
              <video ref={videoRef} playsInline muted />
              <span className="camera-guide tl" />
              <span className="camera-guide tr" />
              <span className="camera-guide bl" />
              <span className="camera-guide br" />
            </div>
            <div className="camera-actions">
              <span>尽量让纸张填满画面，光线均匀</span>
              <Button variant="primary" icon={<Camera size={16} />} onClick={() => void capture()}>
                拍下这一页
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
