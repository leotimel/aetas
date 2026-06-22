export default function HopliteSprite({ color }: { color: string }) {
  return (
    <>
      {/* Large aspis (round shield) — dominant feature */}
      <circle cx={14} cy={22} r={10} fill={color} />
      {/* Shield boss */}
      <circle cx={14} cy={22} r={3} fill="#ffffff" fillOpacity={0.3} />
      {/* Head */}
      <circle cx={28} cy={8} r={4} fill={color} />
      {/* Corinthian helmet plume */}
      <line x1={28} y1={1} x2={28} y2={5} stroke="#ffffff" strokeOpacity={0.65} strokeWidth={4} strokeLinecap="round" />
      {/* Spear (right side, tall) */}
      <line x1={31} y1={3} x2={34} y2={36} stroke="#ffffff" strokeOpacity={0.65} strokeWidth={3} strokeLinecap="round" />
    </>
  )
}
