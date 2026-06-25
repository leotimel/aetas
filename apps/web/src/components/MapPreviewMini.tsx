import type { HexTile } from '@aetas/game-engine'

const TERRAIN_FILL: Record<string, string> = {
  plains:   '#7a9e4e',
  forest:   '#1e4d2b',
  hills:    '#8b6f47',
  mountain: '#6b7d8f',
  water:    '#1a5270',
}

const S3 = Math.sqrt(3)

function hexToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * S3 * (q + r / 2),
    y: size * 1.5 * r,
  }
}

function hexCornerPoints(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i + Math.PI / 6  // pointy-top
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`
  }).join(' ')
}

interface Props {
  tiles: readonly HexTile[]
  radius: number
  width?: number
  height?: number
}

export default function MapPreviewMini({ tiles, radius, width = 280, height = 240 }: Props) {
  const hexSize = radius <= 4 ? 17 : radius <= 5 ? 13 : radius <= 7 ? 9 : 6

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="rounded-xl bg-aetas-panel"
      style={{ display: 'block' }}
    >
      {tiles.map(tile => {
        const { x, y } = hexToPixel(tile.coord.q, tile.coord.r, hexSize)
        const cx = x + width / 2
        const cy = y + height / 2
        const fill = TERRAIN_FILL[tile.terrainType] ?? '#555'
        return (
          <polygon
            key={`${tile.coord.q},${tile.coord.r}`}
            points={hexCornerPoints(cx, cy, hexSize - 0.5)}
            fill={fill}
            stroke="#00000018"
            strokeWidth="0.8"
          />
        )
      })}
    </svg>
  )
}
