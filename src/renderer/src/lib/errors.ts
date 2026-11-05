export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '')
  const value = raw.toLowerCase()
  if (value.includes('password') || value.includes('encrypted')) {
    if (value.includes('incorrect') || value.includes('invalid')) {
      return '密码不正确，请重新输入文件的打开密码'
    }
    return '这个文件已加密，请先输入正确的打开密码'
  }
  if (value.includes('invalid pdf') || value.includes('invalidpdf') || value.includes('not a pdf')) {
    return '文件损坏或不是有效的 PDF，请尝试「修复 PDF」'
  }
  if (value.includes('failed to fetch') || value.includes('network error') || value.includes('err_name_not_resolved')) {
    return '无法载入远程资源，请检查网络后重试'
  }
  if (value.includes('no pages') || value.includes('at least one page')) {
    return '文档里没有可用的页面'
  }
  if (value.includes('out of memory') || value.includes('allocation failed')) {
    return '内存不足，请关闭其他应用或拆分文件后再试'
  }
  return raw || '处理失败，请重试'
}
