interface Props {
  size?: number
  className?: string
}

// Generates laurel leaf transform for a leaf at angle `deg` around center (cx, cy)
// with alternating tilt direction.
function laurelLeaf(cx: number, cy: number, r: number, deg: number, i: number) {
  const rad = (deg * Math.PI) / 180
  const x = cx + r * Math.cos(rad)
  const y = cy + r * Math.sin(rad)
  const tilt = i % 2 === 0 ? deg + 40 : deg - 40
  return (
    <ellipse
      key={i}
      cx={x}
      cy={y}
      rx={1.6}
      ry={3.5}
      fill="none"
      stroke="currentColor"
      strokeWidth={0.7}
      opacity={0.75}
      transform={`rotate(${tilt} ${x} ${y})`}
    />
  )
}

export function AetasLogo({ size = 48, className = '' }: Props) {
  const cx = 24
  const cy = 24
  const leafCount = 16
  const leafR = 19.5 // midpoint between inner (18) and outer (22) circles

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={`text-aetas-gold ${className}`}
    >
      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={22} fill="none" stroke="currentColor" strokeWidth={1.8} />
      {/* Inner ring */}
      <circle cx={cx} cy={cy} r={17.5} fill="none" stroke="currentColor" strokeWidth={0.5} opacity={0.4} />
      {/* Laurel leaves around the ring */}
      {Array.from({ length: leafCount }, (_, i) => {
        const deg = (i / leafCount) * 360 - 90
        return laurelLeaf(cx, cy, leafR, deg, i)
      })}
      {/* Centered "A" in Cinzel */}
      <text
        x={cx}
        y={cy + 6}
        textAnchor="middle"
        fontSize={18}
        fontFamily="Cinzel, Georgia, serif"
        fontWeight={600}
        fill="currentColor"
        opacity={0.9}
      >
        A
      </text>
    </svg>
  )
}

export default AetasLogo
