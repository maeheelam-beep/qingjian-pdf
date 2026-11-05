export type ThemeId = 'warm' | 'paper' | 'mist'
export type AccentId = 'moss' | 'pine' | 'sage'
export type AppearanceId = 'light' | 'dark' | 'system'
export type ColorMode = 'light' | 'dark'

export interface AppSettings {
  appearance: AppearanceId
  theme: ThemeId
  accent: AccentId
  fontScale: 'normal' | 'large'
  motion: boolean
  rememberRecent: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: 'system',
  theme: 'warm',
  accent: 'moss',
  fontScale: 'normal',
  motion: true,
  rememberRecent: true
}

export function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function effectiveColorMode(settings: AppSettings, systemDark = systemPrefersDark()): ColorMode {
  if (settings.appearance === 'system') return systemDark ? 'dark' : 'light'
  return settings.appearance
}

const KEY = 'qingjian.settings.v1'

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

export function applySettings(settings: AppSettings): void {
  const root = document.documentElement
  const dark = effectiveColorMode(settings) === 'dark'
  root.dataset.theme = settings.theme
  root.dataset.accent = settings.accent
  root.dataset.colorMode = dark ? 'dark' : 'light'
  root.dataset.fontScale = settings.fontScale
  root.dataset.motion = settings.motion ? 'on' : 'off'
  root.style.colorScheme = dark ? 'dark' : 'light'

  const lightAccents: Record<
    AccentId,
    { main: string; deep: string; soft: string; line: string; solid: string; on: string }
  > = {
    moss: {
      main: '#3f6b52',
      deep: '#2f5540',
      soft: '#e5eee5',
      line: '#cdddcf',
      solid: '#3f6b52',
      on: '#fbfaf4'
    },
    pine: {
      main: '#345b4b',
      deep: '#274539',
      soft: '#e3ece7',
      line: '#c8d9d0',
      solid: '#345b4b',
      on: '#fbfaf4'
    },
    sage: {
      main: '#5b735e',
      deep: '#475c4a',
      soft: '#e9eee6',
      line: '#d4ded0',
      solid: '#5b735e',
      on: '#fbfaf4'
    }
  }
  const darkAccents: typeof lightAccents = {
    moss: {
      main: '#90b79c',
      deep: '#b8d2bf',
      soft: '#223128',
      line: '#355040',
      solid: '#4a735a',
      on: '#f6f8f0'
    },
    pine: {
      main: '#86b39a',
      deep: '#afd0bb',
      soft: '#1f3028',
      line: '#314c3e',
      solid: '#416b53',
      on: '#f6f8f0'
    },
    sage: {
      main: '#9bb29a',
      deep: '#c0d0be',
      soft: '#252f24',
      line: '#3b493a',
      solid: '#526b53',
      on: '#f6f8f0'
    }
  }
  const accent = (dark ? darkAccents : lightAccents)[settings.accent] || (dark ? darkAccents : lightAccents).moss
  root.style.setProperty('--green', accent.main)
  root.style.setProperty('--green-deep', accent.deep)
  root.style.setProperty('--green-soft', accent.soft)
  root.style.setProperty('--green-line', accent.line)
  root.style.setProperty('--green-solid', accent.solid)
  root.style.setProperty('--on-green', accent.on)
}
