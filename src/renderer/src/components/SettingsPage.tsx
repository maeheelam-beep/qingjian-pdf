import { useEffect, useState } from 'react'
import {
  Check,
  Eye,
  Leaf,
  Laptop,
  Moon,
  MonitorCog,
  Palette,
  RotateCcw,
  ShieldCheck,
  Sun,
  SunMoon,
  Type
} from 'lucide-react'
import type { AccentId, AppearanceId, AppSettings, ThemeId } from '../lib/settings'
import { DEFAULT_SETTINGS, effectiveColorMode, systemPrefersDark } from '../lib/settings'
import { Toggle } from './ui'

const THEMES: { id: ThemeId; name: string; description: string; swatches: string[] }[] = [
  { id: 'warm', name: '暖白', description: '微微偏暖的纸感底色', swatches: ['#f4f0e6', '#fbf8f1', '#3f6b52'] },
  { id: 'paper', name: '宣纸', description: '更轻、更亮的阅读底色', swatches: ['#f7f4ec', '#fffdf8', '#3f6b52'] },
  { id: 'mist', name: '雾青', description: '带一点灰绿的安静底色', swatches: ['#eef0e9', '#f8f9f4', '#3f6b52'] }
]

const ACCENTS: { id: AccentId; name: string; color: string }[] = [
  { id: 'moss', name: '苔绿', color: '#3f6b52' },
  { id: 'pine', name: '松绿', color: '#345b4b' },
  { id: 'sage', name: '鼠尾草', color: '#5b735e' }
]

const APPEARANCES: {
  id: AppearanceId
  name: string
  description: string
  icon: typeof Sun
}[] = [
  { id: 'light', name: '浅色', description: '暖白纸感，适合白天', icon: Sun },
  { id: 'dark', name: '深色', description: '墨夜配色，柔和低光', icon: Moon },
  { id: 'system', name: '跟随系统', description: '随 Windows 自动切换', icon: Laptop }
]

export function SettingsPage({
  settings,
  onChange
}: {
  settings: AppSettings
  onChange: (settings: AppSettings) => void
}): React.JSX.Element {
  const [systemDark, setSystemDark] = useState(systemPrefersDark)
  const effectiveMode = effectiveColorMode(settings, systemDark)
  const isDark = effectiveMode === 'dark'
  const accentSwatches: Record<AccentId, string> = isDark
    ? { moss: '#90b79c', pine: '#86b39a', sage: '#9bb29a' }
    : { moss: '#3f6b52', pine: '#345b4b', sage: '#5b735e' }

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const patch = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div className="page settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            <MonitorCog size={13} />
            PREFERENCES
          </span>
          <h1>偏好设置</h1>
          <p className="page-lead">让界面适合你的眼睛和桌面。所有偏好只保存在这台电脑。</p>
        </div>
        <button
          type="button"
          className="text-action"
          onClick={() => onChange({ ...DEFAULT_SETTINGS })}
        >
          <RotateCcw size={14} /> 恢复默认
        </button>
      </div>

      <div className="settings-layout">
        <div className="settings-main">
          <section className="settings-card appearance-card">
            <div className="settings-card-head">
              <span className="settings-icon">
                <SunMoon size={18} />
              </span>
              <div>
                <h2>显示模式</h2>
                <p>浅色与深色都保留了纸张感和克制的绿色。跟随系统会随 Windows 设置自动切换。</p>
              </div>
            </div>
            <div className="appearance-grid" role="radiogroup" aria-label="显示模式">
              {APPEARANCES.map((appearance) => {
                const Icon = appearance.icon
                const active = settings.appearance === appearance.id
                return (
                  <button
                    key={appearance.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`appearance-option ${active ? 'is-active' : ''}`}
                    onClick={() => patch('appearance', appearance.id)}
                  >
                    <span className="appearance-icon">
                      <Icon size={19} strokeWidth={1.65} />
                    </span>
                    <span className="appearance-copy">
                      <strong>{appearance.name}</strong>
                      <small>{appearance.description}</small>
                    </span>
                    {active && (
                      <span className="appearance-check">
                        <Check size={11} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="appearance-status">
              <span className={`appearance-status-dot ${isDark ? 'is-dark' : ''}`} />
              {settings.appearance === 'system'
                ? `系统当前为${isDark ? '深色' : '浅色'}模式，青笺会自动跟随`
                : `当前使用${isDark ? '深色' : '浅色'}模式`}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-icon">
                <Palette size={18} />
              </span>
              <div>
                <h2>{isDark ? '深色配色' : '颜色与色温'}</h2>
                <p>
                  {isDark
                    ? '深色模式使用墨夜底色，强调色会自动提亮，保持足够的阅读对比。'
                    : '长时间阅读时，低对比的暖色调更不容易疲劳。'}
                </p>
              </div>
            </div>
            {isDark ? (
              <div className="dark-color-note">
                <span className="dark-color-preview">
                  <span />
                  <span />
                  <span />
                </span>
                <div>
                  <strong>墨夜 · 深色专用配色</strong>
                  <p>深色模式不叠加浅色色温。切回浅色后，可继续选择暖白、宣纸或雾青。</p>
                </div>
              </div>
            ) : (
              <div className="theme-grid">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`theme-option ${settings.theme === theme.id ? 'is-active' : ''}`}
                  onClick={() => patch('theme', theme.id)}
                >
                  <span className="theme-preview" style={{ background: theme.swatches[0] }}>
                    <span className="theme-preview-card" style={{ background: theme.swatches[1] }}>
                      <span className="theme-preview-line" style={{ background: theme.swatches[2] }} />
                      <span className="theme-preview-line short" />
                      <span className="theme-preview-block" />
                    </span>
                  </span>
                  <span className="theme-copy">
                    <strong>{theme.name}</strong>
                    <small>{theme.description}</small>
                  </span>
                  {settings.theme === theme.id && (
                    <span className="option-check">
                      <Check size={12} />
                    </span>
                  )}
                </button>
              ))}
              </div>
            )}

            <div className="settings-subhead">
              <span>强调色</span>
              <small>克制的绿，只用在该被看见的地方</small>
            </div>
            <div className="accent-grid">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  type="button"
                  className={`accent-option ${settings.accent === accent.id ? 'is-active' : ''}`}
                  onClick={() => patch('accent', accent.id)}
                >
                  <span
                    className="accent-swatch"
                    style={{
                      background: accentSwatches[accent.id],
                      color: isDark ? '#1b271f' : '#fff'
                    }}
                  >
                    {settings.accent === accent.id && <Check size={12} />}
                  </span>
                  <span>{accent.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-icon">
                <Type size={18} />
              </span>
              <div>
                <h2>阅读舒适度</h2>
                <p>调整字号与动效，不改变工具的位置。</p>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>界面字号</strong>
                <p>整体放大文字与控件，适合高分辨率屏幕。</p>
              </div>
              <div className="segmented segmented-small">
                <button
                  type="button"
                  className={`segment ${settings.fontScale === 'normal' ? 'is-active' : ''}`}
                  onClick={() => patch('fontScale', 'normal')}
                >
                  标准
                </button>
                <button
                  type="button"
                  className={`segment ${settings.fontScale === 'large' ? 'is-active' : ''}`}
                  onClick={() => patch('fontScale', 'large')}
                >
                  稍大
                </button>
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>界面动效</strong>
                <p>关闭后，页面切换与悬停反馈会变得更安静。</p>
              </div>
              <button
                type="button"
                className={`switch-display ${settings.motion ? 'is-on' : ''}`}
                onClick={() => patch('motion', !settings.motion)}
              >
                {settings.motion ? '开启' : '关闭'}
              </button>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-head">
              <span className="settings-icon">
                <ShieldCheck size={18} />
              </span>
              <div>
                <h2>隐私与记录</h2>
                <p>青笺不收集文件内容，也不连接任何云端账号。</p>
              </div>
            </div>
            <Toggle
              checked={settings.rememberRecent}
              onChange={(value) => patch('rememberRecent', value)}
              label="记住最近打开的文件位置"
              description="只保存路径、文件名与处理工具；关闭后不再新增记录。"
            />
            <div className="privacy-note">
              <Leaf size={15} />
              <span>关闭窗口后，内存中的文件与预览会一并释放。</span>
            </div>
          </section>
        </div>

        <aside className="settings-aside">
          <div className="settings-aside-card">
            <Eye size={18} />
            <h3>关于护眼</h3>
            <p>青笺避免纯白底、纯黑字和高饱和色块。背景接近纸张，文字保留足够对比度。</p>
            <span className="aside-meta">建议在 60%–80% 亮度下使用</span>
          </div>
          <div className="settings-aside-card settings-aside-quiet">
            <Moon size={18} />
            <h3>深色也是青笺</h3>
            <p>深色模式使用偏暖的墨夜底色，仍保留纸张感与克制的绿。选择「跟随系统」后，会随 Windows 自动切换。</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
