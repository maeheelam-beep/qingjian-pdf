export type ToolGroupId = 'organize' | 'convert' | 'edit' | 'secure' | 'review'

export type ToolId =
  | 'merge'
  | 'split'
  | 'compress'
  | 'organize'
  | 'rotate'
  | 'crop'
  | 'pageNumbers'
  | 'headerFooter'
  | 'watermark'
  | 'pdfToWord'
  | 'pdfToExcel'
  | 'pdfToPpt'
  | 'pdfToJpg'
  | 'jpgToPdf'
  | 'officeToPdf'
  | 'htmlToPdf'
  | 'pdfToMarkdown'
  | 'edit'
  | 'sign'
  | 'redact'
  | 'scan'
  | 'protect'
  | 'unlock'
  | 'pdfa'
  | 'repair'
  | 'ocr'
  | 'compare'

export interface ToolDef {
  id: ToolId
  title: string
  subtitle: string
  group: ToolGroupId
  icon: string
  keywords: string[]
  accepts: ('pdf' | 'image' | 'office' | 'html')[]
  multiple: boolean
  time: string
}

export interface ToolGroup {
  id: ToolGroupId
  title: string
  eyebrow: string
  description: string
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'organize',
    title: '整理页面',
    eyebrow: 'ARRANGE',
    description: '合并、拆分与重排，让文档回到秩序里。'
  },
  {
    id: 'convert',
    title: '转换格式',
    eyebrow: 'CONVERT',
    description: '在 PDF、Office 与图片之间从容流转。'
  },
  {
    id: 'edit',
    title: '编辑与签署',
    eyebrow: 'EDIT',
    description: '补上文字、签名与水印，完成最后一公里。'
  },
  {
    id: 'secure',
    title: '安全与优化',
    eyebrow: 'SECURE',
    description: '加密、修复、归档，把重要文件照看妥当。'
  },
  {
    id: 'review',
    title: '审阅',
    eyebrow: 'REVIEW',
    description: '把两个版本放在一起，变化一目了然。'
  }
]

export const TOOLS: ToolDef[] = [
  {
    id: 'merge',
    title: '合并 PDF',
    subtitle: '把多个文件按顺序合成一份',
    group: 'organize',
    icon: 'combine',
    keywords: ['合并', 'merge', '拼接'],
    accepts: ['pdf'],
    multiple: true,
    time: '几秒'
  },
  {
    id: 'split',
    title: '拆分 PDF',
    subtitle: '按页、范围或份数拆开',
    group: 'organize',
    icon: 'scissors',
    keywords: ['拆分', 'split', '分割'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'organize',
    title: '整理页面',
    subtitle: '拖拽重排、旋转与删除页面',
    group: 'organize',
    icon: 'layout',
    keywords: ['排序', '删除', '重排', 'organize'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'rotate',
    title: '旋转页面',
    subtitle: '批量校正横竖方向',
    group: 'organize',
    icon: 'rotate',
    keywords: ['旋转', 'rotate', '方向'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'crop',
    title: '裁切页面',
    subtitle: '去掉多余白边与边距',
    group: 'organize',
    icon: 'crop',
    keywords: ['裁切', '裁剪', 'crop', '白边'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'pageNumbers',
    title: '添加页码',
    subtitle: '位置、格式与起始页自由设置',
    group: 'organize',
    icon: 'hash',
    keywords: ['页码', '编号', 'page number'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'headerFooter',
    title: '页眉页脚',
    subtitle: '加入标题、日期与页码',
    group: 'organize',
    icon: 'panelTop',
    keywords: ['页眉', '页脚', 'header', 'footer'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'watermark',
    title: '添加水印',
    subtitle: '文字或图片，轻轻叠在页面上',
    group: 'edit',
    icon: 'droplets',
    keywords: ['水印', 'watermark', '版权'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'pdfToWord',
    title: 'PDF 转 Word',
    subtitle: '可编辑文字，或保留原版式',
    group: 'convert',
    icon: 'fileText',
    keywords: ['word', 'docx', '转换'],
    accepts: ['pdf'],
    multiple: false,
    time: '十几秒'
  },
  {
    id: 'pdfToExcel',
    title: 'PDF 转 Excel',
    subtitle: '按坐标提取文字与表格',
    group: 'convert',
    icon: 'table',
    keywords: ['excel', 'xlsx', '表格', '转换'],
    accepts: ['pdf'],
    multiple: false,
    time: '十几秒'
  },
  {
    id: 'pdfToPpt',
    title: 'PDF 转 PPT',
    subtitle: '每页变成一张高清幻灯片',
    group: 'convert',
    icon: 'presentation',
    keywords: ['ppt', 'pptx', '幻灯片', '转换'],
    accepts: ['pdf'],
    multiple: false,
    time: '十几秒'
  },
  {
    id: 'pdfToJpg',
    title: 'PDF 转图片',
    subtitle: '逐页导出 JPG 或 PNG',
    group: 'convert',
    icon: 'image',
    keywords: ['jpg', '图片', '导出', 'png'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'jpgToPdf',
    title: '图片转 PDF',
    subtitle: '多张图片排成一份文档',
    group: 'convert',
    icon: 'images',
    keywords: ['jpg', '图片', '照片', 'pdf'],
    accepts: ['image'],
    multiple: true,
    time: '几秒'
  },
  {
    id: 'officeToPdf',
    title: 'Office 转 PDF',
    subtitle: 'Word、Excel、PPT 一键成稿',
    group: 'convert',
    icon: 'fileSpreadsheet',
    keywords: ['word', 'excel', 'ppt', 'office', '转换'],
    accepts: ['office'],
    multiple: false,
    time: '十几秒'
  },
  {
    id: 'htmlToPdf',
    title: 'HTML 转 PDF',
    subtitle: '网页、链接或本地 HTML 打印成稿',
    group: 'convert',
    icon: 'code',
    keywords: ['html', '网页', 'url', '转换'],
    accepts: ['html'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'pdfToMarkdown',
    title: 'PDF 转 Markdown',
    subtitle: '提取结构清晰的纯文本',
    group: 'convert',
    icon: 'text',
    keywords: ['markdown', 'md', '文字', '提取'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'edit',
    title: '编辑 PDF',
    subtitle: '添加文字、图片与白色遮盖',
    group: 'edit',
    icon: 'penLine',
    keywords: ['编辑', '文字', '图片', 'edit'],
    accepts: ['pdf'],
    multiple: false,
    time: '自由编辑'
  },
  {
    id: 'sign',
    title: '签署 PDF',
    subtitle: '手写或输入签名，快速落款',
    group: 'edit',
    icon: 'signature',
    keywords: ['签名', '签署', 'sign'],
    accepts: ['pdf'],
    multiple: false,
    time: '一分钟'
  },
  {
    id: 'redact',
    title: '涂黑脱敏',
    subtitle: '永久遮盖敏感内容',
    group: 'edit',
    icon: 'eraser',
    keywords: ['脱敏', '涂黑', 'redact', '隐私'],
    accepts: ['pdf'],
    multiple: false,
    time: '手工框选'
  },
  {
    id: 'scan',
    title: '扫描成 PDF',
    subtitle: '拍照或导入图片，自动优化',
    group: 'edit',
    icon: 'scanLine',
    keywords: ['扫描', '拍照', 'scan', '图片'],
    accepts: ['image'],
    multiple: true,
    time: '几分钟'
  },
  {
    id: 'protect',
    title: '加密保护',
    subtitle: 'AES-256 密码与使用权限',
    group: 'secure',
    icon: 'lock',
    keywords: ['密码', '加密', 'protect', '权限'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'unlock',
    title: '解除密码',
    subtitle: '移除你已知密码的限制',
    group: 'secure',
    icon: 'lockOpen',
    keywords: ['解锁', '密码', 'unlock'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'pdfa',
    title: 'PDF/A 归档',
    subtitle: '适合长期保存的归档结构',
    group: 'secure',
    icon: 'archive',
    keywords: ['pdf/a', '归档', 'archive'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'repair',
    title: '修复 PDF',
    subtitle: '重建损坏文件的结构',
    group: 'secure',
    icon: 'wrench',
    keywords: ['修复', '损坏', 'repair'],
    accepts: ['pdf'],
    multiple: false,
    time: '几秒'
  },
  {
    id: 'compress',
    title: '压缩 PDF',
    subtitle: '减小体积，方便发送与归档',
    group: 'secure',
    icon: 'minimize',
    keywords: ['压缩', '变小', 'compress'],
    accepts: ['pdf'],
    multiple: false,
    time: '十几秒'
  },
  {
    id: 'ocr',
    title: 'OCR 文字识别',
    subtitle: '让扫描件可以搜索与复制',
    group: 'secure',
    icon: 'scanText',
    keywords: ['ocr', '识别', '扫描', '文字'],
    accepts: ['pdf'],
    multiple: false,
    time: '较慢'
  },
  {
    id: 'compare',
    title: '对比文档',
    subtitle: '逐页找出两个版本的差异',
    group: 'review',
    icon: 'compare',
    keywords: ['对比', '比较', 'compare', '差异'],
    accepts: ['pdf'],
    multiple: true,
    time: '十几秒'
  }
]

export const TOOL_MAP: Record<ToolId, ToolDef> = Object.fromEntries(
  TOOLS.map((tool) => [tool.id, tool])
) as Record<ToolId, ToolDef>

export const TOOL_GROUP: Record<ToolGroupId, ToolGroup> = Object.fromEntries(
  TOOL_GROUPS.map((group) => [group.id, group])
) as Record<ToolGroupId, ToolGroup>

export const QUICK_TOOL_IDS: ToolId[] = [
  'merge',
  'split',
  'compress',
  'pdfToWord',
  'jpgToPdf',
  'edit',
  'sign',
  'protect'
]

export const ACCEPT_FILTERS: Record<string, { name: string; extensions: string[] }[]> = {
  pdf: [{ name: 'PDF 文件', extensions: ['pdf'] }],
  image: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff'] }],
  office: [{ name: 'Office 文档', extensions: ['docx', 'xlsx', 'pptx'] }],
  html: [
    { name: 'HTML 文件', extensions: ['html', 'htm'] },
    { name: '所有文件', extensions: ['*'] }
  ]
}
