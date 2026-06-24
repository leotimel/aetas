import { TerrainType } from './types.js'
import type { HexCoord, HexTile, GameMap, Unit, City, PlayerFogOfWar } from './types.js'

// ─── Internal PRNG ────────────────────────────────────────────────────────────
// djb2 string → uint32, then mulberry32 for the sequence.
// Every exported function that uses RNG creates a fresh generator from the seed,
// so externally all functions are pure: same args → same result.

function djb2(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let z = Math.imul(s ^ (s >>> 15), 1 | s)
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) >>> 0
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000
  }
}

function createRng(seed: string): () => number {
  return mulberry32(djb2(seed))
}

// ─── Coordinate constants ─────────────────────────────────────────────────────

const HEX_DIRECTIONS: readonly HexCoord[] = [
  { q:  1, r:  0 },
  { q:  1, r: -1 },
  { q:  0, r: -1 },
  { q: -1, r:  0 },
  { q: -1, r:  1 },
  { q:  0, r:  1 },
]

// ─── Coordinate utilities ─────────────────────────────────────────────────────

/** Stable string key for a hex coord. Used for Map/Set lookups. */
export function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`
}

/**
 * Axial distance between two hexes.
 * Equivalent to max(|dq|, |dr|, |ds|) in cube coords where s = -q - r.
 */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

/** The 6 immediately adjacent hexes. Does not clamp to map bounds. */
export function hexNeighbors(coord: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS.map(d => ({ q: coord.q + d.q, r: coord.r + d.r }))
}

/**
 * All hexes within `radius` steps of `center` (inclusive).
 * Count: 3R² + 3R + 1. Does not clamp to map bounds.
 */
export function hexesInRadius(center: HexCoord, radius: number): HexCoord[] {
  const results: HexCoord[] = []
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius)
    const rMax = Math.min(radius, -dq + radius)
    for (let dr = rMin; dr <= rMax; dr++) {
      results.push({ q: center.q + dq, r: center.r + dr })
    }
  }
  return results
}

// ─── Terrain weights ──────────────────────────────────────────────────────────

const TERRAIN_THRESHOLDS: ReadonlyArray<readonly [TerrainType, number]> = [
  [TerrainType.Plains,   0.40],
  [TerrainType.Forest,   0.65],
  [TerrainType.Hills,    0.80],
  [TerrainType.Mountain, 0.92],
  [TerrainType.Water,    1.00],
]

function pickTerrain(rng: () => number): TerrainType {
  const roll = rng()
  for (const [type, threshold] of TERRAIN_THRESHOLDS) {
    if (roll < threshold) return type
  }
  return TerrainType.Water
}

// ─── Start position placement ─────────────────────────────────────────────────

function findStartPositions(
  tiles: readonly HexTile[],
  playerCount: number,
  mapRadius: number,
  rng: () => number,
): readonly HexCoord[] {
  const tileMap = new Map<string, HexTile>()
  for (const tile of tiles) tileMap.set(hexKey(tile.coord), tile)

  const isValid = (coord: HexCoord): boolean => {
    const tile = tileMap.get(hexKey(coord))
    return (
      tile !== undefined &&
      tile.terrainType !== TerrainType.Water &&
      tile.terrainType !== TerrainType.Mountain
    )
  }

  // Shuffle slot indices so angular positions vary per seed (Fisher-Yates).
  const slots = Array.from({ length: playerCount }, (_, i) => i)
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j]!, slots[i]!]
  }

  const ringRadius = Math.round(mapRadius * 0.7)
  const taken = new Set<string>()
  const positions: HexCoord[] = []

  for (let i = 0; i < playerCount; i++) {
    const slotAngle = (2 * Math.PI * slots[i]!) / playerCount
    const jitter    = (rng() - 0.5) * Math.PI / playerCount
    const angle     = slotAngle + jitter
    // Approximate: treat axial (q, r) as Cartesian for angular placement.
    // findStartPositions snaps to nearest valid tile, so this approximation is fine.
    const candidate: HexCoord = {
      q: Math.round(ringRadius * Math.cos(angle)),
      r: Math.round(ringRadius * Math.sin(angle)),
    }

    let placed = false
    for (let searchR = 0; searchR <= mapRadius && !placed; searchR++) {
      const sorted = hexesInRadius(candidate, searchR)
        .sort((a, b) => hexDistance(a, candidate) - hexDistance(b, candidate))
      for (const c of sorted) {
        const key = hexKey(c)
        if (isValid(c) && !taken.has(key)) {
          taken.add(key)
          positions.push(c)
          placed = true
          break
        }
      }
    }
  }

  return positions
}

// ─── Map size presets ─────────────────────────────────────────────────────────

/** Radius per map size. Hex count = 3R² + 3R + 1: small≈91, medium≈169, large≈331. */
export const MAP_SIZES = { small: 5, medium: 7, large: 10 } as const
export type MapSize = keyof typeof MAP_SIZES

// ─── Map generation ───────────────────────────────────────────────────────────

/**
 * Generates a deterministic hex map.
 * Same `radius` + `seed` + `playerCount` always produces the same result.
 */
export function generateMap(
  radius: number,
  seed: string,
  playerCount: number,
): GameMap {
  const rng = createRng(seed)
  const allCoords = hexesInRadius({ q: 0, r: 0 }, radius)
  const tiles: HexTile[] = allCoords.map(coord => ({
    coord,
    terrainType: pickTerrain(rng),
  }))

  return {
    tiles,
    radius,
    seed,
    startPositions: findStartPositions(tiles, playerCount, radius, rng),
  }
}

// ─── Fog of war ───────────────────────────────────────────────────────────────

/** Default vision radius for units. */
export const UNIT_VISION_RADIUS = 2

/** Default vision radius for cities (slightly wider than units). */
export const CITY_VISION_RADIUS = 3

/**
 * Returns all hexes currently visible to a player given their units and cities.
 * Clamps to the map boundary (hexes outside mapRadius are excluded).
 */
export function computeVisibleHexes(
  playerUnits: readonly Unit[],
  playerCities: readonly City[],
  mapRadius: number,
): HexCoord[] {
  const mapHexKeys = new Set<string>(
    hexesInRadius({ q: 0, r: 0 }, mapRadius).map(hexKey),
  )
  // Map<key, coord> avoids duplicate entries without re-parsing string keys.
  const visible = new Map<string, HexCoord>()

  const addIfOnMap = (coord: HexCoord): void => {
    const key = hexKey(coord)
    if (mapHexKeys.has(key) && !visible.has(key)) {
      visible.set(key, coord)
    }
  }

  for (const unit of playerUnits) {
    for (const hex of hexesInRadius(unit.position, UNIT_VISION_RADIUS)) {
      addIfOnMap(hex)
    }
  }
  for (const city of playerCities) {
    for (const hex of hexesInRadius(city.position, CITY_VISION_RADIUS)) {
      addIfOnMap(hex)
    }
  }

  return Array.from(visible.values())
}

/**
 * Recomputes fog of war for a player after their turn.
 * `visibleHexes` reflects the current turn; `exploredHexes` is a union with
 * all previously explored hexes and never shrinks.
 * Returns a new object — does not mutate `current`.
 */
export function updateFogOfWar(
  current: PlayerFogOfWar,
  playerUnits: readonly Unit[],
  playerCities: readonly City[],
  mapRadius: number,
): PlayerFogOfWar {
  const newVisible = computeVisibleHexes(playerUnits, playerCities, mapRadius)

  const exploredMap = new Map<string, HexCoord>()
  for (const coord of current.exploredHexes) {
    exploredMap.set(hexKey(coord), coord)
  }
  for (const coord of newVisible) {
    exploredMap.set(hexKey(coord), coord)
  }

  return {
    playerId: current.playerId,
    visibleHexes: newVisible,
    exploredHexes: Array.from(exploredMap.values()),
  }
}
