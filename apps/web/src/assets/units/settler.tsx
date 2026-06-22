export default function SettlerSprite({ color }: { color: string }) {
  return (
    <>
      <circle cx={20} cy={9} r={4} fill={color} />
      <rect x={15} y={13} width={10} height={10} rx={1} fill={color} />
      {/* Legs */}
      <rect x={15} y={23} width={4} height={8} rx={1} fill={color} />
      <rect x={21} y={23} width={4} height={8} rx={1} fill={color} />
      {/* Bundle/plans in front — clearly non-martial */}
      <rect x={11} y={24} width={15} height={8} rx={2} fill="#e8dcc8" stroke="#8b7536" strokeWidth={1.5} />
      {/* Scroll lines */}
      <line x1={14} y1={27} x2={23} y2={27} stroke="#8b7536" strokeWidth={1} strokeOpacity={0.6} />
      <line x1={14} y1={29} x2={23} y2={29} stroke="#8b7536" strokeWidth={1} strokeOpacity={0.4} />
    </>
  )
}
