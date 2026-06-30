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

/**
 * Owner of the territory a hex falls in (nearest city within `maxRadius`), or
 * null if no city is close enough. Voronoi with deterministic id tie-break.
 * Mirrors the client border logic in HexMap.tsx so engine and UI agree.
 */
export function territoryOwnerAt(
  cities: ReadonlyArray<{ id: string; position: HexCoord; ownerId: string }>,
  coord: HexCoord,
  maxRadius = 2,
): string | null {
  let best: { dist: number; cityId: string; ownerId: string } | null = null
  for (const city of cities) {
    const d = hexDistance(coord, city.position)
    if (d > maxRadius) continue
    if (!best || d < best.dist || (d === best.dist && city.id < best.cityId)) {
      best = { dist: d, cityId: city.id, ownerId: city.ownerId }
    }
  }
  return best ? best.ownerId : null
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

// ─── Coherent terrain generation ──────────────────────────────────────────────
// Replaces independent per-tile rolls with two smoothed noise fields (elevation
// + moisture) combined through a decision table, plus a coast falloff that pushes
// water to the rim. Fully deterministic from the seed RNG — no external libs.

const SMOOTH_PASSES   = 2     // box-blur passes over hex neighbors → blob size
const COAST_WEIGHT    = 0.55  // how strongly distance-to-edge lowers elevation
const WATER_LEVEL     = 0.30  // elevation below this → Water (lands on the rim)
const MOUNTAIN_LEVEL  = 0.72  // elevation above this → Mountain (interior peaks)
const HILLS_LEVEL     = 0.60  // elevation above this → Hills (ring below peaks)
const FOREST_MOISTURE = 0.55  // moisture above this on mid-land → Forest

/**
 * Box-blur a per-hex scalar field over on-map neighbors. Each pass replaces a
 * hex's value with the average of itself and its on-map neighbors, turning white
 * noise into spatially-coherent blobs. Pure: no RNG, returns a fresh Map.
 */
function smoothField(
  values: ReadonlyMap<string, number>,
  onMapKeys: ReadonlySet<string>,
  passes: number,
): Map<string, number> {
  let field = new Map(values)
  for (let p = 0; p < passes; p++) {
    const next = new Map<string, number>()
    for (const [key, coord] of keyedCoords(field)) {
      let sum = field.get(key)!
      let count = 1
      for (const n of hexNeighbors(coord)) {
        const nk = hexKey(n)
        if (onMapKeys.has(nk)) {
          sum += field.get(nk)!
          count++
        }
      }
      next.set(key, sum / count)
    }
    field = next
  }
  return field
}

/** Parses the "q,r" keys of a field back into coords for neighbor lookups. */
function keyedCoords(field: ReadonlyMap<string, number>): [string, HexCoord][] {
  return Array.from(field.keys()).map(key => {
    const [q, r] = key.split(',').map(Number)
    return [key, { q: q!, r: r! }] as [string, HexCoord]
  })
}

/** Min-max normalize a field to [0,1]. Degenerate (all-equal) field → all 0.5. */
function normalize01(values: ReadonlyMap<string, number>): Map<string, number> {
  let min = Infinity
  let max = -Infinity
  for (const v of values.values()) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const span = max - min
  const out = new Map<string, number>()
  for (const [key, v] of values) {
    out.set(key, span > 1e-9 ? (v - min) / span : 0.5)
  }
  return out
}

/**
 * Classifies one hex from its combined elevation + moisture. `elevation` already
 * folds in the coast falloff, so low values cluster on the rim (→ Water) and high
 * values cluster in the interior (→ Mountain ringed by Hills).
 */
function classifyTerrain(elevation: number, moisture: number): TerrainType {
  if (elevation < WATER_LEVEL)    return TerrainType.Water
  if (elevation > MOUNTAIN_LEVEL) return TerrainType.Mountain
  if (elevation > HILLS_LEVEL)    return TerrainType.Hills
  if (moisture  > FOREST_MOISTURE) return TerrainType.Forest
  return TerrainType.Plains
}

/**
 * Builds the full terrain layout for a map: two smoothed noise fields, a coast
 * falloff, the decision table, then two cleanup passes that guarantee the spatial
 * invariants (no isolated mountains; forests never touch water).
 */
function generateTerrain(
  allCoords: readonly HexCoord[],
  radius: number,
  rng: () => number,
): Map<string, TerrainType> {
  const onMapKeys = new Set(allCoords.map(hexKey))

  // 1. Two white-noise fields, consumed in a fixed order (deterministic).
  const elev0  = new Map<string, number>()
  for (const c of allCoords) elev0.set(hexKey(c), rng())
  const moist0 = new Map<string, number>()
  for (const c of allCoords) moist0.set(hexKey(c), rng())

  // 2. Smooth → spatial coherence, then normalize so thresholds are robust.
  const elev  = normalize01(smoothField(elev0,  onMapKeys, SMOOTH_PASSES))
  const moist = normalize01(smoothField(moist0, onMapKeys, SMOOTH_PASSES))

  // 3 + 4. Coast falloff folded into elevation, then the decision table.
  const center: HexCoord = { q: 0, r: 0 }
  const terrain = new Map<string, TerrainType>()
  for (const c of allCoords) {
    const key = hexKey(c)
    const edgeFactor = radius > 0 ? hexDistance(c, center) / radius : 0
    const elevation = elev.get(key)! * (1 - COAST_WEIGHT) + (1 - edgeFactor) * COAST_WEIGHT
    terrain.set(key, classifyTerrain(elevation, moist.get(key)!))
  }

  // 5a. No isolated mountains: any Mountain without a Mountain/Hills neighbor is
  //     demoted to Hills. Snapshot-based — demoting to Hills still satisfies the
  //     neighbor rule, so one pass is enough.
  const snapshot = new Map(terrain)
  for (const c of allCoords) {
    const key = hexKey(c)
    if (snapshot.get(key) !== TerrainType.Mountain) continue
    const hasHighNeighbor = hexNeighbors(c).some(n => {
      const t = snapshot.get(hexKey(n))
      return t === TerrainType.Mountain || t === TerrainType.Hills
    })
    if (!hasHighNeighbor) terrain.set(key, TerrainType.Hills)
  }

  // 5b. Forests never border water directly.
  const snapshot2 = new Map(terrain)
  for (const c of allCoords) {
    const key = hexKey(c)
    if (snapshot2.get(key) !== TerrainType.Forest) continue
    const touchesWater = hexNeighbors(c).some(n => snapshot2.get(hexKey(n)) === TerrainType.Water)
    if (touchesWater) terrain.set(key, TerrainType.Plains)
  }

  return terrain
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
  const terrain = generateTerrain(allCoords, radius, rng)
  const tiles: HexTile[] = allCoords.map(coord => ({
    coord,
    terrainType: terrain.get(hexKey(coord))!,
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
