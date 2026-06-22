export default function ChinaHorseArcherSprite({ color }: { color: string }) {
  return (
    <>
      {/* Horse body */}
      <ellipse cx={20} cy={28} rx={13} ry={5} fill={color} />
      {/* Horse head */}
      <circle cx={31} cy={21} r={4} fill={color} />
      {/* Horse neck */}
      <line x1={28} y1={24} x2={29} y2={22} stroke={color} strokeWidth={5} strokeLinecap="round" />
      {/* Rider */}
      <circle cx={18} cy={17} r={5} fill={color} />
      {/* Conical hat — distinctive */}
      <polygon points="19,5 13,15 25,15" fill="#ffffff" fillOpacity={0.7} />
      {/* Bow horizontal */}
      <path d="M24,13 Q32,17 24,22" fill="none" stroke="#ffffff" strokeOpacity={0.65} strokeWidth={3} strokeLinecap="round" />
      {/* Bowstring */}
      <line x1={24} y1={13} x2={24} y2={22} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={1} />
      {/* Legs */}
      <line x1={10} y1={32} x2={9}  y2={38} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={16} y1={32} x2={15} y2={38} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={24} y1={32} x2={25} y2={38} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={30} y1={32} x2={31} y2={38} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </>
  )
}
