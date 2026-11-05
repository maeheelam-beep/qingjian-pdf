import { ChevronDown, Loader2, Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger'

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  disabled,
  onClick,
  type = 'button',
  className = ''
}: {
  children?: ReactNode
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
}): React.JSX.Element {
  return (
    <button
      type={type}
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <Loader2 size={16} className="spin" /> : icon}
      {children && <span>{children}</span>}
    </button>
  )
}

export function IconButton({
  children,
  label,
  onClick,
  active,
  disabled,
  className = ''
}: {
  children: ReactNode
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'is-active' : ''} ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  compact
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; hint?: string; icon?: ReactNode }[]
  compact?: boolean
}): React.JSX.Element {
  return (
    <div className={`segmented ${compact ? 'segmented-compact' : ''}`} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`segment ${value === option.value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span className="segment-label">{option.label}</span>
          {option.hint && <span className="segment-hint">{option.hint}</span>}
        </button>
      ))}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
  wide
}: {
  label: string
  hint?: string
  children: ReactNode
  wide?: boolean
}): React.JSX.Element {
  return (
    <label className={`field ${wide ? 'field-wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  suffix,
  min,
  max,
  disabled,
  onKeyDown
}: {
  value: string | number
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password' | 'number' | 'url'
  suffix?: string
  min?: number
  max?: number
  disabled?: boolean
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}): React.JSX.Element {
  return (
    <span className="input-wrap">
      <input
        className="text-input"
        type={type}
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {suffix && <span className="input-suffix">{suffix}</span>}
    </span>
  )
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  disabled
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  disabled?: boolean
}): React.JSX.Element {
  return (
    <span className="select-wrap">
      <select
        className="select-input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={15} className="select-chevron" />
    </span>
  )
}

export function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  suffix
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  suffix?: string
}): React.JSX.Element {
  return (
    <span className="stepper">
      <button
        type="button"
        aria-label="减少"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >
        <Minus size={14} />
      </button>
      <span className="stepper-value">
        {value}
        {suffix && <small>{suffix}</small>}
      </span>
      <button
        type="button"
        aria-label="增加"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >
        <Plus size={14} />
      </button>
    </span>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
}): React.JSX.Element {
  return (
    <button type="button" className="toggle-row" onClick={() => onChange(!checked)}>
      <span className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-description">{description}</span>}
      </span>
      <span className={`toggle ${checked ? 'is-on' : ''}`} aria-checked={checked} role="switch">
        <span className="toggle-knob" />
      </span>
    </button>
  )
}

export function RangeField({
  value,
  min,
  max,
  step = 1,
  onChange,
  valueLabel
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  valueLabel?: string
}): React.JSX.Element {
  const percent = ((value - min) / (max - min)) * 100
  return (
    <div className="range-field">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--range-progress': `${percent}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="range-value">{valueLabel ?? value}</span>
    </div>
  )
}

export function SectionTitle({
  children,
  hint
}: {
  children: ReactNode
  hint?: string
}): React.JSX.Element {
  return (
    <div className="section-title">
      <h3>{children}</h3>
      {hint && <span>{hint}</span>}
    </div>
  )
}

export function Divider(): React.JSX.Element {
  return <div className="divider" />
}

export function EmptyHint({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="empty-hint">{children}</div>
}
