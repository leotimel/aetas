export default function VikingBerserkerSprite({ color }: { color: string }) {
  return (
    <>
      <circle cx={20} cy={9} r={4} fill={color} />
      <rect x={15} y={13} width={10} height={14} rx={1} fill={color} />
      {/* Axe left — handle + head */}
      <line x1={20} y1={15} x2={9}  y2={4}  stroke="#ffffff" strokeOpacity={0.65} strokeWidth={3}   strokeLinecap="round" />
      <line x1={6}  y1={6}  x2={13} y2={2}  stroke="#ffffff" strokeOpacity={0.65} strokeWidth={3.5} strokeLinecap="round" />
      {/* Axe right — handle + head */}
      <line x1={20} y1={15} x2={31} y2={4}  stroke="#ffffff" strokeOpacity={0.65} strokeWidth={3}   strokeLinecap="round" />
      <line x1={27} y1={2}  x2={34} y2={6}  stroke="#ffffff" strokeOpacity={0.65} strokeWidth={3.5} strokeLinecap="round" />
    </>
  )
}
