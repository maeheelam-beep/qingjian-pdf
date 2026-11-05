import {
  Archive,
  Code2,
  Combine,
  Crop,
  Droplets,
  Eraser,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  Hash,
  Image as ImageIcon,
  Images,
  LayoutGrid,
  Lock,
  LockOpen,
  Minimize2,
  PanelTop,
  PenLine,
  Presentation,
  RotateCw,
  ScanLine,
  ScanText,
  Scissors,
  Signature,
  Table2,
  TextCursorInput,
  Wrench,
  type LucideIcon
} from 'lucide-react'

const MAP: Record<string, LucideIcon> = {
  combine: Combine,
  scissors: Scissors,
  layout: LayoutGrid,
  rotate: RotateCw,
  crop: Crop,
  hash: Hash,
  panelTop: PanelTop,
  droplets: Droplets,
  fileText: FileText,
  table: Table2,
  presentation: Presentation,
  image: ImageIcon,
  images: Images,
  fileSpreadsheet: FileSpreadsheet,
  code: Code2,
  text: TextCursorInput,
  penLine: PenLine,
  signature: Signature,
  eraser: Eraser,
  scanLine: ScanLine,
  lock: Lock,
  lockOpen: LockOpen,
  archive: Archive,
  wrench: Wrench,
  minimize: Minimize2,
  scanText: ScanText,
  compare: GitCompareArrows
}

export function ToolGlyph({
  name,
  size = 20,
  strokeWidth = 1.7
}: {
  name: string
  size?: number
  strokeWidth?: number
}): React.JSX.Element {
  const Icon = MAP[name] || FileText
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" />
}
