export default function RomanLegionarySprite({ color }: { color: string }) {
  return (
    <>
      {/* Scutum — tall rectangular shield, dominant */}
      <rect x={7} y={10} width={13} height={22} rx={2} fill={color} />
      {/* Horizontal boss line on shield */}
      <line x1={7} y1={21} x2={20} y2={21} stroke="#ffffff" strokeOpacity={0.25} strokeWidth={1} />
      {/* Head with helmet */}
      <circle cx={24} cy={7} r={4} fill={color} />
      {/* Helmet crest (horsehair plume) */}
      <line x1={24} y1={1} x2={24} y2={4} stroke="#ffffff" strokeOpacity={0.6} strokeWidth={3.5} strokeLinecap="round" />
      {/* Pilum (javelin) */}
      <line x1={24} y1={1} x2={31} y2={19} stroke="#ffffff" strokeOpacity={0.65} strokeWidth={3} strokeLinecap="round" />
    </>
  )
}
