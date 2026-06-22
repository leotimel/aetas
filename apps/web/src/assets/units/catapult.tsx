export default function CatapultSprite({ color }: { color: string }) {
  return (
    <>
      {/* Wooden frame */}
      <rect x={4} y={25} width={32} height={7} rx={1} fill="#6b3f1a" />
      {/* Wheels */}
      <circle cx={11} cy={32} r={5} fill={color} />
      <circle cx={29} cy={32} r={5} fill={color} />
      {/* Throwing arm */}
      <line x1={19} y1={26} x2={13} y2={5} stroke={color} strokeWidth={4} strokeLinecap="round" />
      {/* Projectile cup */}
      <circle cx={12} cy={5} r={3.5} fill={color} />
      {/* Crossbrace */}
      <line x1={8} y1={26} x2={29} y2={26} stroke={color} strokeWidth={2} />
    </>
  )
}
