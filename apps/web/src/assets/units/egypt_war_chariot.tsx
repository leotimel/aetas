export default function EgyptWarChariotSprite({ color }: { color: string }) {
  return (
    <>
      {/* Wheels — large, dominant */}
      <circle cx={10} cy={30} r={8} fill={color} />
      <circle cx={30} cy={30} r={8} fill={color} />
      {/* Wheel spokes */}
      <line x1={10} y1={22} x2={10} y2={38} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={1} />
      <line x1={3}  y1={26} x2={17} y2={34} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={1} />
      <line x1={3}  y1={34} x2={17} y2={26} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={1} />
      <line x1={30} y1={22} x2={30} y2={38} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={1} />
      <line x1={23} y1={26} x2={37} y2={34} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={1} />
      <line x1={23} y1={34} x2={37} y2={26} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={1} />
      {/* Platform / chariot body */}
      <rect x={10} y={20} width={20} height={8} fill="#8b7536" />
      {/* Archer on chariot */}
      <circle cx={20} cy={13} r={4} fill={color} />
      {/* Bow */}
      <path d="M15,14 Q11,17 15,21" fill="none" stroke="#ffffff" strokeOpacity={0.65} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={15} y1={14} x2={15} y2={21} stroke="#ffffff" strokeOpacity={0.3} strokeWidth={1} />
    </>
  )
}
