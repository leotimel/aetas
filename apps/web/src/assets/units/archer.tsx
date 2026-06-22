export default function ArcherSprite({ color }: { color: string }) {
  return (
    <>
      <circle cx={16} cy={9} r={4} fill={color} />
      <rect x={12} y={13} width={8} height={14} rx={1} fill={color} />
      {/* Bow arc */}
      <path d="M26,6 Q37,19 26,33" fill="none" stroke="#ffffff" strokeOpacity={0.65} strokeWidth={3} strokeLinecap="round" />
      {/* Bowstring */}
      <line x1={26} y1={6} x2={26} y2={33} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={1} />
      {/* Arrow nocked */}
      <line x1={12} y1={19} x2={26} y2={19} stroke="#ffffff" strokeOpacity={0.65} strokeWidth={2} strokeLinecap="round" />
    </>
  )
}
