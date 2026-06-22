export default function CitySprite({ color }: { color: string }) {
  return (
    <>
      {/* Base platform */}
      <rect x={5} y={28} width={30} height={6} rx={1} fill={color} />
      {/* Three columns */}
      <rect x={9}  y={14} width={3} height={14} fill={color} />
      <rect x={18} y={14} width={3} height={14} fill={color} />
      <rect x={27} y={14} width={3} height={14} fill={color} />
      {/* Triangular pediment */}
      <polygon points="5,14 35,14 20,4" fill={color} />
      {/* Inner highlight on pediment */}
      <polygon points="9,14 31,14 20,7" fill="#ffffff" fillOpacity={0.12} />
    </>
  )
}
