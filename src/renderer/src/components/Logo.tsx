export function Logo({ size = 30 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" fill="#3F6B52" />
      <path
        d="M10.5 7.5h7.2L23 12.7v10.3a1.5 1.5 0 0 1-1.5 1.5h-11a1.5 1.5 0 0 1-1.5-1.5V9a1.5 1.5 0 0 1 1.5-1.5Z"
        fill="#FBF8F1"
      />
      <path d="M17.7 7.5 23 12.7h-4.2a1.1 1.1 0 0 1-1.1-1.1V7.5Z" fill="#C9DCCD" />
      <path
        d="M13 14.4h6.8M13 17.2h6.8M13 20h4.2"
        stroke="#3F6B52"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Wordmark({ compact = false }: { compact?: boolean }): React.JSX.Element {
  return (
    <div className="wordmark">
      <Logo size={29} />
      <div className="wordmark-text">
        <span className="wordmark-name">青笺</span>
        {!compact && <span className="wordmark-suffix">PDF</span>}
      </div>
    </div>
  )
}
