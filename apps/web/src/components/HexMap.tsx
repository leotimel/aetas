import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { GameState, HexCoord } from '@aetas/game-engine'
import { hexKey, hexDistance, hexNeighbors, UnitType, Era, UNIT_CATALOG, SPECIAL_UNIT_CATALOG, CIVILIZATIONS } from '@aetas/game-engine'
import TerrainPatterns from '../assets/terrain-patterns.tsx'
import { UNIT_SPRITES, CitySprite, CapitalSprite } from '../assets/units/index'

const HEX_SIZE = 36

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
]

function civColor(civilizationId: string, fallback: string): string {
  return CIVILIZATIONS.find(c => c.id === civilizationId)?.color ?? fallback
}

const TERRAIN_FILL: Record<string, string> = {
  plains:   '#7a9e4e',
  forest:   '#1e4d2b',
  mountain: '#6b7d8f',
  hills:    '#8b6f47',
  water:    '#1a5270',
}

const TERRAIN_STROKE: Record<string, string> = {
  plains:   '#5a7a33',
  forest:   '#142e1a',
  mountain: '#506070',
  hills:    '#6a5235',
  water:    '#0e3a52',
}


function eraStroke(unitType: string): string {
  const def = UNIT_CATALOG.get(unitType as UnitType) ?? SPECIAL_UNIT_CATALOG.get(unitType)
  switch (def?.eraRequired) {
    case Era.Classical: return '#3b82f6'
    case Era.Medieval:  return '#f59e0b'
    default:            return '#6b7280'
  }
}

function hexToPixel(q: number, r: number): [number, number] {
  return [
    HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r),
    HEX_SIZE * (3 / 2 * r),
  ]
}

function hexPolygonPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30)
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`
  }).join(' ')
}

function hexVerticesArr(cx: number, cy: number, r: number): { x: number; y: number }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30)
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  })
}

type DyingUnit = { id: string; x: number; y: number; color: string; unitType: string }

interface Transform { x: number; y: number; scale: number }

interface Props {
  gameState: GameState
  myEnginePlayerId: string
  selectedUnitId: string | null
  godMode: boolean
  onSelectUnit: (unitId: string | null) => void
  onInitiateCombat: (attackerUnitId: string, defenderUnitId: string) => void
  onCityClick?: (cityId: string) => void
  onMoveUnit?: (unitId: string, targetCoord: HexCoord) => void
  newUnitIds?: Set<string>
}

export default function HexMap({
  gameState, myEnginePlayerId, selectedUnitId, godMode, onSelectUnit, onInitiateCombat, onCityClick, onMoveUnit, newUnitIds,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [origin, setOrigin] = useState({ x: 300, y: 300 })
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const lastTouches = useRef<React.Touch[]>([])
  const isDragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, tx: 0, ty: 0 })
  const clickMoved = useRef(false)
  const [dyingUnits, setDyingUnits] = useState<DyingUnit[]>([])
  const [newCityIds, setNewCityIds] = useState<Set<string>>(new Set())
  const [capturedCityIds, setCapturedCityIds] = useState<Set<string>>(new Set())
  const prevUnitsRef      = useRef<Map<string, { position: HexCoord; unitType: string; ownerId: string }> | null>(null)
  const prevCityIdsRef    = useRef<Set<string> | null>(null)
  const prevCityOwnerRef  = useRef<Map<string, string> | null>(null)

  // Measure SVG container to set initial center
  useEffect(() => {
    const measure = () => {
      if (svgRef.current) {
        const r = svgRef.current.getBoundingClientRect()
        setOrigin({ x: r.width / 2, y: r.height / 2 })
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (svgRef.current) ro.observe(svgRef.current)
    return () => ro.disconnect()
  }, [])

  // Detect dying units + new cities for animation
  useEffect(() => {
    const colorMap = new Map<string, string>()
    gameState.players.forEach((p, i) =>
      colorMap.set(p.id, civColor(p.civilizationId, PLAYER_COLORS[i % PLAYER_COLORS.length])))

    if (prevUnitsRef.current === null) {
      const init = new Map<string, { position: HexCoord; unitType: string; ownerId: string }>()
      for (const u of gameState.units) init.set(u.id, { position: u.position, unitType: u.unitType, ownerId: u.ownerId })
      prevUnitsRef.current = init
      prevCityIdsRef.current = new Set(gameState.cities.map(c => c.id))
      prevCityOwnerRef.current = new Map(gameState.cities.map(c => [c.id, c.ownerId]))
      return
    }

    const currentUnitIds = new Set(gameState.units.map(u => u.id))
    const dead: DyingUnit[] = []
    for (const [id, info] of prevUnitsRef.current) {
      if (!currentUnitIds.has(id)) {
        const [x, y] = hexToPixel(info.position.q, info.position.r)
        dead.push({ id, x, y, color: colorMap.get(info.ownerId) ?? '#888', unitType: info.unitType })
      }
    }
    if (dead.length > 0) {
      setDyingUnits(prev => [...prev, ...dead])
      const ids = new Set(dead.map(d => d.id))
      setTimeout(() => setDyingUnits(prev => prev.filter(u => !ids.has(u.id))), 750)
    }

    const currentCityIds = new Set(gameState.cities.map(c => c.id))
    const appeared = [...currentCityIds].filter(id => !prevCityIdsRef.current!.has(id))
    if (appeared.length > 0) {
      setNewCityIds(new Set(appeared))
      setTimeout(() => setNewCityIds(new Set()), 950)
    }

    const prevOwners = prevCityOwnerRef.current!
    const captured = new Set<string>()
    gameState.cities.forEach(c => {
      if (prevOwners.has(c.id) && prevOwners.get(c.id) !== c.ownerId) captured.add(c.id)
    })
    if (captured.size > 0) {
      setCapturedCityIds(captured)
      setTimeout(() => setCapturedCityIds(new Set()), 1500)
    }

    const newMap = new Map<string, { position: HexCoord; unitType: string; ownerId: string }>()
    for (const u of gameState.units) newMap.set(u.id, { position: u.position, unitType: u.unitType, ownerId: u.ownerId })
    prevUnitsRef.current = newMap
    prevCityIdsRef.current = currentCityIds
    prevCityOwnerRef.current = new Map(gameState.cities.map(c => [c.id, c.ownerId]))
  }, [gameState]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Zoom/pan: mouse wheel ---
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.12 : 0.9
    const rect = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setTransform(t => {
      const newScale = Math.min(4, Math.max(0.25, t.scale * factor))
      return {
        scale: newScale,
        x: mx - (mx - t.x) * newScale / t.scale,
        y: my - (my - t.y) * newScale / t.scale,
      }
    })
  }, [])

  // --- Zoom/pan: mouse drag ---
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    isDragging.current = true
    clickMoved.current = false
    dragStart.current = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return
    const dx = e.clientX - dragStart.current.mx
    const dy = e.clientY - dragStart.current.my
    if (Math.abs(dx) + Math.abs(dy) > 4) clickMoved.current = true
    setTransform(t => ({ ...t, x: dragStart.current.tx + dx, y: dragStart.current.ty + dy }))
  }
  const onMouseUp = () => { isDragging.current = false }

  // --- Zoom/pan: touch ---
  const onTouchStart = (e: React.TouchEvent) => {
    lastTouches.current = Array.from(e.touches)
    clickMoved.current = false
  }
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()
    const touches = Array.from(e.touches)
    const prev = lastTouches.current

    if (touches.length === 1 && prev.length === 1) {
      const dx = touches[0].clientX - prev[0].clientX
      const dy = touches[0].clientY - prev[0].clientY
      if (Math.abs(dx) + Math.abs(dy) > 4) clickMoved.current = true
      setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
    } else if (touches.length === 2 && prev.length >= 2) {
      const dist = (a: React.Touch, b: React.Touch) => Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
      const oldDist = dist(prev[0], prev[1])
      const newDist = dist(touches[0], touches[1])
      if (oldDist === 0) return
      const factor = newDist / oldDist
      const mx = (touches[0].clientX + touches[1].clientX) / 2
      const my = (touches[0].clientY + touches[1].clientY) / 2
      const rect = svgRef.current!.getBoundingClientRect()
      const px = mx - rect.left
      const py = my - rect.top
      clickMoved.current = true
      setTransform(t => {
        const newScale = Math.min(4, Math.max(0.25, t.scale * factor))
        return { scale: newScale, x: px - (px - t.x) * factor, y: py - (py - t.y) * factor }
      })
    }
    lastTouches.current = touches
  }
  const onTouchEnd = () => { lastTouches.current = [] }

  const { map, units, cities, players, fogOfWar } = gameState

  const playerColorMap = new Map<string, string>()
  players.forEach((p, i) => playerColorMap.set(p.id, civColor(p.civilizationId, PLAYER_COLORS[i % PLAYER_COLORS.length])))

  const territoryMap = useMemo(() => {
    const m = new Map<string, string>()  // hexKey → ownerId
    for (const tile of gameState.map.tiles) {
      const key = hexKey(tile.coord)
      let best: { dist: number; cityId: string; ownerId: string } | null = null
      for (const city of gameState.cities) {
        const d = hexDistance(tile.coord, city.position)
        if (d > 2) continue
        if (!best || d < best.dist || (d === best.dist && city.id < best.cityId)) {
          best = { dist: d, cityId: city.id, ownerId: city.ownerId }
        }
      }
      if (best) m.set(key, best.ownerId)
    }
    return m
  }, [gameState.cities, gameState.map.tiles])

  const myFow = fogOfWar.find(f => f.playerId === myEnginePlayerId)
  const visibleSet = new Set((myFow?.visibleHexes ?? []).map(hexKey))
  const exploredSet = new Set((myFow?.exploredHexes ?? []).map(hexKey))

  const unitByHex = new Map<string, typeof units[0]>()
  for (const u of units) unitByHex.set(hexKey(u.position), u)

  const cityByHex = new Map<string, typeof cities[0]>()
  for (const c of cities) cityByHex.set(hexKey(c.position), c)

  const selectedUnit = selectedUnitId ? units.find(u => u.id === selectedUnitId) : undefined

  // Movement range: hexes reachable by selected unit (only when unit hasn't moved yet)
  const moveRangeSet = new Set<string>()
  if (selectedUnit?.ownerId === myEnginePlayerId && !selectedUnit.hasMoved) {
    for (const tile of map.tiles) {
      if (
        tile.terrainType !== 'water' &&
        hexDistance(selectedUnit.position, tile.coord) <= (selectedUnit.stats.movement ?? 2) &&
        hexDistance(selectedUnit.position, tile.coord) > 0
      ) {
        moveRangeSet.add(hexKey(tile.coord))
      }
    }
  }

  const handleHexClick = (coord: HexCoord) => {
    if (clickMoved.current) return
    const key = hexKey(coord)
    const isVisible = godMode || visibleSet.has(key)
    if (!isVisible) { onSelectUnit(null); return }

    const unit = unitByHex.get(key)
    const city = cityByHex.get(key)

    if (selectedUnit && unit && unit.ownerId !== myEnginePlayerId) {
      if (hexDistance(selectedUnit.position, coord) === 1) {
        onInitiateCombat(selectedUnit.id, unit.id)
        return
      }
    }

    if (
      selectedUnit &&
      selectedUnit.ownerId === myEnginePlayerId &&
      moveRangeSet.has(key) &&
      !unit &&
      onMoveUnit
    ) {
      onMoveUnit(selectedUnit.id, coord)
      return
    }

    if (unit?.ownerId === myEnginePlayerId) {
      onSelectUnit(selectedUnit?.id === unit.id ? null : unit.id)
      return
    }

    if (city && onCityClick) {
      onCityClick(city.id)
      onSelectUnit(null)
      return
    }

    onSelectUnit(null)
  }

  const gTransform = `translate(${origin.x + transform.x}, ${origin.y + transform.y}) scale(${transform.scale})`

  const zoomIn  = () => setTransform(t => ({ ...t, scale: Math.min(1.4, parseFloat((t.scale * 1.2).toFixed(2))) }))
  const zoomOut = () => setTransform(t => ({ ...t, scale: Math.max(0.6, parseFloat((t.scale / 1.2).toFixed(2))) }))

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Zoom controls — 44px touch targets */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
        <button
          onClick={zoomIn}
          className="w-11 h-11 rounded-lg bg-aetas-surface/80 border border-aetas-border text-aetas-muted
                     hover:text-aetas-gold hover:border-aetas-gold/40 text-lg font-bold leading-none
                     transition-colors flex items-center justify-center active:bg-aetas-raised"
          title="Zoom in"
        >+</button>
        <button
          onClick={zoomOut}
          className="w-11 h-11 rounded-lg bg-aetas-surface/80 border border-aetas-border text-aetas-muted
                     hover:text-aetas-gold hover:border-aetas-gold/40 text-lg font-bold leading-none
                     transition-colors flex items-center justify-center active:bg-aetas-raised"
          title="Zoom out"
        >−</button>
      </div>
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full select-none touch-none"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <defs>
        <TerrainPatterns />
      </defs>
      <g transform={gTransform}>
        {map.tiles.map(tile => {
          const { coord, terrainType } = tile
          const key = hexKey(coord)
          const [px, py] = hexToPixel(coord.q, coord.r)

          const isVisible = godMode || visibleSet.has(key)
          const isExplored = godMode || exploredSet.has(key)

          const unit = isVisible ? unitByHex.get(key) : undefined

          const isSelectedHex = selectedUnit != null && hexKey(selectedUnit.position) === key
          const isAttackTarget =
            selectedUnit != null && isVisible && unit != null &&
            unit.ownerId !== myEnginePlayerId &&
            hexDistance(selectedUnit.position, coord) === 1
          const isMoveTarget = moveRangeSet.has(key) && !unitByHex.has(key)

          let fill: string
          let fillOpacity = 1
          if (!isExplored) {
            fill = '#0f172a'
          } else {
            fill = `url(#terrain-${terrainType as string}) ${TERRAIN_FILL[terrainType as string] ?? '#555'}`
            if (!isVisible) fillOpacity = 0.4
          }

          const stroke      = TERRAIN_STROKE[terrainType as string] ?? '#333'
          const strokeWidth = 0.8
          const points = hexPolygonPoints(px, py, HEX_SIZE - 1)

          return (
            <g key={key} onClick={() => handleHexClick(coord)} style={{ cursor: 'pointer' }}>
              <polygon
                points={points}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={stroke}
                strokeWidth={strokeWidth}
              />
              {/* Territory overlay — visible tiles only */}
              {isVisible && (() => {
                const ownerId = territoryMap.get(key)
                if (!ownerId) return null
                const color = playerColorMap.get(ownerId) ?? '#888'
                return (
                  <polygon
                    points={points}
                    fill={color}
                    fillOpacity={0.18}
                    stroke={color}
                    strokeWidth={0.4}
                    strokeOpacity={0.35}
                    pointerEvents="none"
                  />
                )
              })()}
              {/* Selection overlay — gold pulse */}
              {isSelectedHex && (
                <polygon points={points} fill="none" stroke="#c9a84c" strokeWidth={2}
                         style={{ animation: 'hex-select 1.1s ease-in-out infinite' }} />
              )}
              {/* Attack target ring */}
              {isAttackTarget && (
                <polygon points={points} fill="#ef4444" fillOpacity={0.12} stroke="#ef4444" strokeWidth={1.5} />
              )}
              {/* Movement range overlay — pulsing */}
              {isMoveTarget && (
                <polygon points={points} fill="#3b82f6" fillOpacity={0.18} stroke="#3b82f6" strokeWidth={1}
                         style={{ animation: 'range-pulse 1.5s ease-in-out infinite' }} />
              )}
              {/* Vignette gradient — bright centre → dark edge on visible tiles */}
              {isVisible && (
                <polygon points={points} fill="url(#hex-vignette)" pointerEvents="none" />
              )}
              {/* Micro terrain icons */}
              {isVisible && terrainType === 'forest' && (
                <use href="#icon-forest" x={px - 7} y={py - 8} width={14} height={16} opacity={0.65} pointerEvents="none" />
              )}
              {isVisible && terrainType === 'mountain' && (
                <use href="#icon-mountain" x={px - 8} y={py - 6} width={16} height={12} opacity={0.65} pointerEvents="none" />
              )}
              {/* Coord label in god mode */}
              {godMode && (
                <text x={px} y={py - HEX_SIZE * 0.45} fontSize={7} fill="#ffffff44" textAnchor="middle">
                  {coord.q},{coord.r}
                </text>
              )}
            </g>
          )
        })}

        {/* Layer: Territory border lines — drawn on edges between different owners */}
        <g pointerEvents="none">
          {map.tiles.flatMap(tile => {
            const key = hexKey(tile.coord)
            const isVis = godMode || visibleSet.has(key)
            if (!isVis) return []
            const ownerId = territoryMap.get(key)
            if (!ownerId) return []
            const [px, py] = hexToPixel(tile.coord.q, tile.coord.r)
            const color = playerColorMap.get(ownerId) ?? '#888'
            const verts = hexVerticesArr(px, py, HEX_SIZE - 1)
            const nbrs = hexNeighbors(tile.coord)
            return Array.from({ length: 6 }, (_, i) => {
              const nbr = nbrs[(6 - i) % 6]
              const nbrKey = hexKey(nbr)
              if (!(godMode || visibleSet.has(nbrKey))) return null
              if (territoryMap.get(nbrKey) === ownerId) return null
              const v0 = verts[i], v1 = verts[(i + 1) % 6]
              return (
                <line key={`${key}-b${i}`}
                  x1={v0.x} y1={v0.y} x2={v1.x} y2={v1.y}
                  stroke={color} strokeWidth={2} strokeOpacity={0.75} strokeLinecap="round"
                />
              )
            }).filter((el): el is React.ReactElement => el !== null)
          })}
        </g>

        {/* Layer: Cities — spring-in on city founded */}
        {cities.map(city => {
          const key = hexKey(city.position)
          const isVisible = godMode || visibleSet.has(key)
          if (!isVisible) return null
          const [px, py] = hexToPixel(city.position.q, city.position.r)
          const color = playerColorMap.get(city.ownerId) ?? '#888'
          return (
            <g key={city.id}
               className={
                 newCityIds.has(city.id) ? 'anim-city-spring' :
                 capturedCityIds.has(city.id) ? 'anim-city-capture' : undefined
               }
               style={{ transform: `translate(${px}px, ${py}px)`, cursor: 'pointer' }}
               onClick={() => handleHexClick(city.position)}>
              <CityIcon cx={0} cy={0} color={color} level={city.level} hp={city.hp} maxHp={city.maxHp} />
            </g>
          )
        })}

        {/* Layer: Live units — CSS transition slides unit on move */}
        {units.map(unit => {
          const key = hexKey(unit.position)
          const isVisible = godMode || visibleSet.has(key)
          if (!isVisible) return null
          const [px, py] = hexToPixel(unit.position.q, unit.position.r)
          const uy = cityByHex.has(key) ? py - 14 : py
          const color = playerColorMap.get(unit.ownerId) ?? '#888'
          return (
            <g key={unit.id}
               className={newUnitIds?.has(unit.id) ? 'anim-unit-appear' : undefined}
               style={{
                 transform: `translate(${px}px, ${uy}px)`,
                 transition: 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                 cursor: 'pointer',
                 filter: (unit.hasMoved && unit.ownerId === myEnginePlayerId)
                   ? 'grayscale(0.65) brightness(0.65)'
                   : undefined,
               }}
               onClick={() => handleHexClick(unit.position)}>
              <UnitIcon cx={0} cy={0} color={color} unitType={unit.unitType} selected={selectedUnit?.id === unit.id} />
            </g>
          )
        })}

        {/* Layer: Dying units — red flash + fade */}
        {dyingUnits.map(ghost => (
          <g key={`dying-${ghost.id}`}
             className="anim-unit-die"
             style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)` }}>
            <UnitIcon cx={0} cy={0} color={ghost.color} unitType={ghost.unitType} selected={false} />
          </g>
        ))}
      </g>
    </svg>
    </div>
  )
}

function CityIcon({ cx, cy, color, level, hp, maxHp }: {
  cx: number; cy: number; color: string; level: number; hp?: number; maxHp?: number
}) {
  const Sprite = level >= 3 ? CapitalSprite : CitySprite
  const showHpBar = hp !== undefined && maxHp !== undefined && hp < maxHp
  const hpRatio = showHpBar ? hp / maxHp : 1
  const hpColor = hpRatio > 0.5 ? '#4ade80' : hpRatio > 0.25 ? '#facc15' : '#ef4444'
  return (
    <>
      <svg x={cx - 11} y={cy - 11} width={22} height={22} viewBox="0 0 40 40" overflow="hidden">
        <Sprite color={color} />
      </svg>
      {/* Level badge */}
      <circle cx={cx + 7} cy={cy + 7} r={5} fill="#0e0c09" />
      <text x={cx + 7} y={cy + 11} fontSize={7} fill="#c9a84c" textAnchor="middle" fontWeight="bold">{level}</text>
      {/* HP bar — only when damaged */}
      {showHpBar && (
        <>
          <rect x={cx - 11} y={cy + 13} width={22} height={3} rx={1.5} fill="#111" />
          <rect x={cx - 11} y={cy + 13} width={22 * hpRatio} height={3} rx={1.5} fill={hpColor} />
        </>
      )}
    </>
  )
}

function UnitIcon({ cx, cy, color, unitType, selected }: { cx: number; cy: number; color: string; unitType: string; selected: boolean }) {
  const Sprite = UNIT_SPRITES[unitType] ?? UNIT_SPRITES['warrior']
  const stroke = eraStroke(unitType)
  return (
    <>
      {selected && <circle cx={cx} cy={cy} r={14} fill="none" stroke="#f97316" strokeWidth={2.5} />}
      {/* Era ring */}
      <circle cx={cx} cy={cy} r={12} fill="none" stroke={stroke} strokeWidth={1.5} strokeOpacity={0.7} />
      {/* Sprite via nested SVG — viewBox 40×40 → 22px on map */}
      <svg x={cx - 11} y={cy - 11} width={22} height={22} viewBox="0 0 40 40" overflow="hidden">
        <Sprite color={color} />
      </svg>
    </>
  )
}
