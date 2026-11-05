import { useEffect, useState } from 'react'

export function BlobImage({
  bytes,
  type,
  name,
  alt = '',
  className,
  style,
  draggable = false
}: {
  bytes: Uint8Array | undefined
  type?: string
  name?: string
  alt?: string
  className?: string
  style?: React.CSSProperties
  draggable?: boolean
}): React.JSX.Element | null {
  const [url, setUrl] = useState<string | null>(null)
  const extension = name?.split('.').pop()?.toLowerCase()
  const mime =
    type ||
    (extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'webp'
        ? 'image/webp'
        : extension === 'gif'
          ? 'image/gif'
          : 'image/png')

  useEffect(() => {
    if (!bytes) {
      setUrl(null)
      return
    }
    const blob = new Blob([new Uint8Array(bytes).buffer], { type: mime })
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [bytes, mime])

  if (!url) return null
  return <img src={url} alt={alt} className={className} style={style} draggable={draggable} />
}
