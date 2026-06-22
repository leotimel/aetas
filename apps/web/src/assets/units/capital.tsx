export default function CapitalSprite({ color }: { color: string }) {
  return (
    <>
      {/* Base platform */}
      <rect x={3} y={30} width={34} height={5} rx={1} fill={color} />
      {/* Left tower */}
      <rect x={3}  y={10} width={8} height={20} fill={color} />
      {/* Right tower */}
      <rect x={29} y={10} width={8} height={20} fill={color} />
      {/* Tower battlements */}
      <rect x={3}  y={7}  width={3} height={4} fill={color} />
      <rect x={8}  y={7}  width={3} height={4} fill={color} />
      <rect x={29} y={7}  width={3} height={4} fill={color} />
      <rect x={34} y={7}  width={3} height={4} fill={color} />
      {/* Central arch body */}
      <rect x={11} y={18} width={18} height={12} fill={color} />
      {/* Arch opening cutout */}
      <path d="M14,30 L14,22 Q20,15 26,22 L26,30 Z" fill="#ffffff" fillOpacity={0.2} />
      {/* Center spire */}
      <polygon points="20,2 16,11 24,11" fill={color} />
      {/* Tower highlights */}
      <line x1={3}  y1={10} x2={11} y2={10} stroke="#ffffff" strokeOpacity={0.25} strokeWidth={1} />
      <line x1={29} y1={10} x2={37} y2={10} stroke="#ffffff" strokeOpacity={0.25} strokeWidth={1} />
    </>
  )
}
