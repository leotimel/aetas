import type { GameState, HexCoord } from '@aetas/game-engine'
import { hexKey, hexDistance } from '@aetas/game-engine'

const HEX_SIZE = 30

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
]

// TerrainType enum values are lowercase strings
const TERRAIN_COLOR: Record<string, string> = {
  plains:   '#4a7c59',
  forest:   '#1e4d2b',
  mountain: '#6b7280',
  hills:    '#92704a',
  water:    '#1e4a6b',
}

function hexToPixel(q: number, r: number): [number, number] {
  const x = HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r)
  const y = HEX_SIZE * (3 / 2 * r)
  return [x, y]
}

function hexPolygonPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30)
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`
  }).join(' ')
}

interface Props {
  gameState: GameState
  myEnginePlayerId: string
  selectedUnitId: string | null
  godMode: boolean
  onSelectUnit: (unitId: string | null) => void
  onInitiateCombat: (attackerUnitId: string, defenderUnitId: string) => void
}

export default function HexGrid({
  gameState, myEnginePlayerId, selectedUnitId, godMode, onSelectUnit, onInitiateCombat,
}: Props) {
  const { map, units, cities, players, fogOfWar } = gameState

  const playerColorMap = new Map<string, string>()
  players.forEach((p, i) => playerColorMap.set(p.id, PLAYER_COLORS[i % PLAYER_COLORS.length]))

  const myFow = fogOfWar.find(f => f.playerId === myEnginePlayerId)
  const visibleSet = new Set((myFow?.visibleHexes ?? []).map(hexKey))
  const exploredSet = new Set((myFow?.exploredHexes ?? []).map(hexKey))

  // SVG dimensions
  const R = map.radius
  const svgW = Math.ceil(2 * Math.sqrt(3) * (R + 1) * HEX_SIZE) + 20
  const svgH = Math.ceil((3 * R + 2) * HEX_SIZE) + 20
  const ox = svgW / 2  // origin x (center of map in SVG space)
  const oy = svgH / 2  // origin y

  // Unit/city lookups
  const unitByHex = new Map<string, typeof units[0]>()
  for (const u of units) unitByHex.set(hexKey(u.position), u)

  const cityByHex = new Map<string, typeof cities[0]>()
  for (const c of cities) cityByHex.set(hexKey(c.position), c)

  const selectedUnit = selectedUnitId ? units.find(u => u.id === selectedUnitId) : undefined

  const handleClick = (coord: HexCoord) => {
    const key = hexKey(coord)
    const isVisible = godMode || visibleSet.has(key)
    if (!isVisible) { onSelectUnit(null); return }

    const unit = unitByHex.get(key)

    // If a unit of mine is selected and I click an adjacent enemy unit → initiate combat
    if (selectedUnit && unit && unit.ownerId !== myEnginePlayerId) {
      if (hexDistance(selectedUnit.position, coord) === 1) {
        onInitiateCombat(selectedUnit.id, unit.id)
        return
      }
    }

    // Click my own unit → select it
    if (unit?.ownerId === myEnginePlayerId) {
      onSelectUnit(unit.id)
      return
    }

    // Click elsewhere → deselect
    onSelectUnit(null)
  }

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      style={{ display: 'block' }}
    >
      {map.tiles.map(tile => {
        const { coord, terrainType } = tile
        const key = hexKey(coord)
        const [px, py] = hexToPixel(coord.q, coord.r)
        const cx = ox + px
        const cy = oy + py

        const isVisible = godMode || visibleSet.has(key)
        const isExplored = godMode || exploredSet.has(key)

        const unit = isVisible ? unitByHex.get(key) : undefined
        const city = isVisible ? cityByHex.get(key) : undefined
        const isMeSelected = selectedUnit && hexKey(selectedUnit.position) === key

        const isAttackTarget =
          selectedUnit != null &&
          isVisible &&
          unit != null &&
          unit.ownerId !== myEnginePlayerId &&
          hexDistance(selectedUnit.position, coord) === 1

        let fillColor: string
        let fillOpacity = 1
        if (!isExplored) {
          fillColor = '#1a1a2e'
        } else {
          fillColor = TERRAIN_COLOR[terrainType as string] ?? '#444'
          if (!isVisible) fillOpacity = 0.4
        }

        const strokeColor = isMeSelected ? '#f97316' : isAttackTarget ? '#ef4444' : '#0d1117'
        const strokeWidth = isMeSelected || isAttackTarget ? 2.5 : 0.5
        const points = hexPolygonPoints(cx, cy, HEX_SIZE - 1)

        return (
          <g key={key} onClick={() => handleClick(coord)} style={{ cursor: 'pointer' }}>
            <polygon
              points={points}
              fill={fillColor}
              fillOpacity={fillOpacity}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
            {godMode && (
              <text x={cx} y={cy - HEX_SIZE * 0.45} fontSize={7} fill="#ffffff44" textAnchor="middle">
                {coord.q},{coord.r}
              </text>
            )}
            {city && (
              <CityIcon
                cx={cx}
                cy={cy}
                color={playerColorMap.get(city.ownerId) ?? '#fff'}
                level={city.level}
              />
            )}
            {unit && (
              <UnitIcon
                cx={cx}
                cy={cy + (city ? -12 : 0)}
                color={playerColorMap.get(unit.ownerId) ?? '#fff'}
                letter={unit.unitType.charAt(0).toUpperCase()}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

function CityIcon({ cx, cy, color, level }: { cx: number; cy: number; color: string; level: number }) {
  return (
    <>
      <rect x={cx - 7} y={cy - 7} width={14} height={14} fill={color} fillOpacity={0.85} stroke="#fff" strokeWidth={1} rx={1} />
      <text x={cx} y={cy + 5} fontSize={9} fill="#fff" textAnchor="middle" fontWeight="bold">{level}</text>
    </>
  )
}

function UnitIcon({ cx, cy, color, letter }: { cx: number; cy: number; color: string; letter: string }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={9} fill={color} fillOpacity={0.9} stroke="#fff" strokeWidth={1} />
      <text x={cx} y={cy + 4} fontSize={9} fill="#fff" textAnchor="middle" fontWeight="bold">{letter}</text>
    </>
  )
}
