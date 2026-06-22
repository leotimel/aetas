export default function WarriorSprite({ color }: { color: string }) {
  return (
    <>
      <circle cx={20} cy={9} r={4} fill={color} />
      <rect x={15} y={13} width={10} height={14} rx={1} fill={color} />
      {/* Shield left */}
      <ellipse cx={9} cy={20} rx={4} ry={6} fill="#ffffff" fillOpacity={0.35} stroke={color} strokeWidth={1.5} />
      {/* Sword right */}
      <line x1={27} y1={13} x2={35} y2={22} stroke="#ffffff" strokeOpacity={0.65} strokeWidth={3} strokeLinecap="round" />
    </>
  )
}
