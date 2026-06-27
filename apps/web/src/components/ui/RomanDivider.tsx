interface Props {
  className?: string
}

export function RomanDivider({ className = '' }: Props) {
  return (
    <div className={`w-full ${className}`}>
      <svg
        width="100%"
        height="12"
        viewBox="0 0 200 12"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {/* Left line */}
        <line x1="0" y1="6" x2="88" y2="6" stroke="var(--color-aetas-gold)" strokeWidth={0.5} opacity={0.3} />
        {/* Right line */}
        <line x1="112" y1="6" x2="200" y2="6" stroke="var(--color-aetas-gold)" strokeWidth={0.5} opacity={0.3} />
        {/* Flanking dots */}
        <circle cx="91" cy="6" r="1.5" fill="var(--color-aetas-gold)" opacity={0.3} />
        <circle cx="109" cy="6" r="1.5" fill="var(--color-aetas-gold)" opacity={0.3} />
        {/* Central diamond */}
        <polygon points="100,2 104,6 100,10 96,6" fill="var(--color-aetas-gold)" opacity={0.55} />
      </svg>
    </div>
  )
}

export default RomanDivider
