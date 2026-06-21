import { describe, it, expect } from 'vitest'
import {
  hexKey,
  hexDistance,
  hexNeighbors,
  hexesInRadius,
  generateMap,
  UNIT_VISION_RADIUS,
  CITY_VISION_RADIUS,
  computeVisibleHexes,
  updateFogOfWar,
} from './map.js'
import { TerrainType, CitySpecialization } from './types.js'
import type { HexCoord, Unit, City, PlayerFogOfWar } from './types.js'

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeUnit(position: HexCoord): Unit {
  return {
    id: `unit-${hexKey(position)}`,
    unitType: 'warrior',
    position,
    stats: { attack: 1, defense: 1, hp: 10, maxHp: 10, movement: 2 },
    ownerId: 'p1',
    hasMoved: false,
    hasAttacked: false,
  }
}

function makeCity(position: HexCoord): City {
  return {
    id: `city-${hexKey(position)}`,
    name: 'TestCity',
    position,
    ownerId: 'p1',
    population: 1,
    specialization: CitySpecialization.Military,
    level: 1,
    foodStored: 0,
  }
}

const EMPTY_FOG: PlayerFogOfWar = {
  playerId: 'p1',
  visibleHexes: [],
  exploredHexes: [],
}

// ─── Suite 1: Coordinate utilities ────────────────────────────────────────────

describe('hexKey', () => {
  it('formats positive coords', () => {
    expect(hexKey({ q: 3, r: 2 })).toBe('3,2')
  })
  it('formats a negative coord', () => {
    expect(hexKey({ q: 3, r: -1 })).toBe('3,-1')
  })
  it('formats the origin', () => {
    expect(hexKey({ q: 0, r: 0 })).toBe('0,0')
  })
})

describe('hexDistance', () => {
  it('returns 0 for the same point', () => {
    expect(hexDistance({ q: 2, r: 3 }, { q: 2, r: 3 })).toBe(0)
  })
  it('returns 1 for an adjacent hex', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1)
  })
  it('returns correct non-trivial distance', () => {
    // cube: |dq|=2, |dr|=1, |ds|=1 → (2+1+1)/2 = 2
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: -1 })).toBe(2)
  })
  it('is symmetric', () => {
    const a = { q: 1, r: -3 }
    const b = { q: -2, r: 4 }
    expect(hexDistance(a, b)).toBe(hexDistance(b, a))
  })
})

describe('hexNeighbors', () => {
  it('returns exactly 6 neighbors', () => {
    expect(hexNeighbors({ q: 0, r: 0 })).toHaveLength(6)
  })
  it('all neighbors are at distance 1 from the origin', () => {
    const origin = { q: 0, r: 0 }
    for (const n of hexNeighbors(origin)) {
      expect(hexDistance(origin, n)).toBe(1)
    }
  })
  it('all neighbors are distinct', () => {
    const keys = hexNeighbors({ q: 0, r: 0 }).map(hexKey)
    expect(new Set(keys).size).toBe(6)
  })
})

describe('hexesInRadius', () => {
  it('radius 0 returns only the center', () => {
    const result = hexesInRadius({ q: 0, r: 0 }, 0)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ q: 0, r: 0 })
  })
  it('radius 1 returns 7 hexes', () => {
    expect(hexesInRadius({ q: 0, r: 0 }, 1)).toHaveLength(7)
  })
  it('radius 2 returns 19 hexes', () => {
    expect(hexesInRadius({ q: 0, r: 0 }, 2)).toHaveLength(19)
  })
  it('radius 3 returns 37 hexes', () => {
    expect(hexesInRadius({ q: 0, r: 0 }, 3)).toHaveLength(37)
  })
  it('all results are within the given distance', () => {
    const center = { q: 1, r: 1 }
    for (const coord of hexesInRadius(center, 2)) {
      expect(hexDistance(coord, center)).toBeLessThanOrEqual(2)
    }
  })
  it('works correctly for a non-origin center', () => {
    const center = { q: 3, r: -2 }
    const result = hexesInRadius(center, 1)
    expect(result).toHaveLength(7)
    expect(result.some(c => c.q === 3 && c.r === -2)).toBe(true)
  })
})

// ─── Suite 2: generateMap ─────────────────────────────────────────────────────

describe('generateMap', () => {
  it('is deterministic: same seed produces identical tiles', () => {
    const a = generateMap(5, 'test-seed', 2)
    const b = generateMap(5, 'test-seed', 2)
    expect(JSON.stringify(a.tiles)).toBe(JSON.stringify(b.tiles))
  })
  it('is deterministic: same seed produces identical startPositions', () => {
    const a = generateMap(5, 'test-seed', 2)
    const b = generateMap(5, 'test-seed', 2)
    expect(JSON.stringify(a.startPositions)).toBe(JSON.stringify(b.startPositions))
  })
  it('different seeds produce different tile layouts', () => {
    const a = generateMap(5, 'seed-A', 2)
    const b = generateMap(5, 'seed-B', 2)
    expect(JSON.stringify(a.tiles)).not.toBe(JSON.stringify(b.tiles))
  })
  it('produces the correct tile count (3R²+3R+1)', () => {
    const R = 3
    expect(generateMap(R, 'abc', 1).tiles.length).toBe(3 * R * R + 3 * R + 1)
  })
  it('all tiles have a valid TerrainType enum value', () => {
    const validTypes = new Set(Object.values(TerrainType))
    for (const tile of generateMap(4, 'check', 1).tiles) {
      expect(validTypes.has(tile.terrainType)).toBe(true)
    }
  })
  it('echoes radius and seed back in the result', () => {
    const map = generateMap(5, 'test-seed', 2)
    expect(map.radius).toBe(5)
    expect(map.seed).toBe('test-seed')
  })
  it('startPositions count matches playerCount', () => {
    expect(generateMap(5, 'xyz', 3).startPositions).toHaveLength(3)
    expect(generateMap(5, 'xyz', 6).startPositions).toHaveLength(6)
  })
  it('start positions are on valid terrain (not Water or Mountain)', () => {
    const map = generateMap(6, 'sp-test', 4)
    const tileMap = new Map(map.tiles.map(t => [hexKey(t.coord), t]))
    for (const pos of map.startPositions) {
      const tile = tileMap.get(hexKey(pos))
      expect(tile?.terrainType).not.toBe(TerrainType.Water)
      expect(tile?.terrainType).not.toBe(TerrainType.Mountain)
    }
  })
  it('all start positions are distinct', () => {
    const map = generateMap(6, 'distinct', 4)
    const keys = map.startPositions.map(hexKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('all start positions lie within the map radius', () => {
    const R = 6
    const map = generateMap(R, 'within', 4)
    for (const pos of map.startPositions) {
      expect(hexDistance(pos, { q: 0, r: 0 })).toBeLessThanOrEqual(R)
    }
  })
  it('daily challenge seed is deterministic across calls', () => {
    const a = generateMap(4, '2026-06-20', 2)
    const b = generateMap(4, '2026-06-20', 2)
    expect(JSON.stringify(a.tiles)).toBe(JSON.stringify(b.tiles))
  })
})

// ─── Suite 3: computeVisibleHexes ─────────────────────────────────────────────

describe('computeVisibleHexes', () => {
  const LARGE_MAP = 10

  it('single unit at origin sees exactly UNIT_VISION_RADIUS hexes', () => {
    const unit = makeUnit({ q: 0, r: 0 })
    const visible = computeVisibleHexes([unit], [], LARGE_MAP)
    const expected = hexesInRadius({ q: 0, r: 0 }, UNIT_VISION_RADIUS).length
    expect(visible).toHaveLength(expected)
    for (const hex of visible) {
      expect(hexDistance(hex, unit.position)).toBeLessThanOrEqual(UNIT_VISION_RADIUS)
    }
  })

  it('single city at origin sees exactly CITY_VISION_RADIUS hexes', () => {
    const city = makeCity({ q: 0, r: 0 })
    const visible = computeVisibleHexes([], [city], LARGE_MAP)
    const expected = hexesInRadius({ q: 0, r: 0 }, CITY_VISION_RADIUS).length
    expect(visible).toHaveLength(expected)
  })

  it('clamps to map boundary — no hex outside mapRadius appears', () => {
    const unit = makeUnit({ q: 2, r: 0 }) // on the edge of a radius-2 map
    const visible = computeVisibleHexes([unit], [], 2)
    for (const hex of visible) {
      expect(hexDistance(hex, { q: 0, r: 0 })).toBeLessThanOrEqual(2)
    }
  })

  it('union of two distant units covers areas near both', () => {
    const unitA = makeUnit({ q: 0, r: 0 })
    const unitB = makeUnit({ q: 8, r: 0 })
    const keys = new Set(computeVisibleHexes([unitA, unitB], [], LARGE_MAP).map(hexKey))
    expect(keys.has(hexKey({ q: 0, r: 0 }))).toBe(true)
    expect(keys.has(hexKey({ q: 8, r: 0 }))).toBe(true)
  })

  it('no duplicate hexes in output when vision ranges overlap', () => {
    const unitA = makeUnit({ q: 0, r: 0 })
    const unitB = makeUnit({ q: 1, r: 0 }) // overlapping vision
    const visible = computeVisibleHexes([unitA, unitB], [], LARGE_MAP)
    const keys = visible.map(hexKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('exports UNIT_VISION_RADIUS = 2 and CITY_VISION_RADIUS = 3', () => {
    expect(UNIT_VISION_RADIUS).toBe(2)
    expect(CITY_VISION_RADIUS).toBe(3)
  })
})

// ─── Suite 4: updateFogOfWar ──────────────────────────────────────────────────

describe('updateFogOfWar', () => {
  const MAP_RADIUS = 10

  it('explored hexes never shrink when unit moves away (core invariant)', () => {
    const fog1 = updateFogOfWar(EMPTY_FOG, [makeUnit({ q: 0, r: 0 })], [], MAP_RADIUS)
    // Move to a position with no overlap (distance 8 > 2*UNIT_VISION_RADIUS)
    const fog2 = updateFogOfWar(fog1, [makeUnit({ q: 8, r: 0 })], [], MAP_RADIUS)
    const explored2 = new Set(fog2.exploredHexes.map(hexKey))
    for (const coord of fog1.exploredHexes) {
      expect(explored2.has(hexKey(coord))).toBe(true)
    }
  })

  it('visibleHexes reflects current position only — not the previous one', () => {
    const fog1 = updateFogOfWar(EMPTY_FOG, [makeUnit({ q: 0, r: 0 })], [], MAP_RADIUS)
    const fog2 = updateFogOfWar(fog1, [makeUnit({ q: 8, r: 0 })], [], MAP_RADIUS)
    const visKeys = new Set(fog2.visibleHexes.map(hexKey))
    // Must see area around new position
    expect(visKeys.has(hexKey({ q: 8, r: 0 }))).toBe(true)
    // Must NOT see origin — distance 8 from new position, well beyond vision radius
    expect(visKeys.has(hexKey({ q: 0, r: 0 }))).toBe(false)
  })

  it('exploredHexes is always a superset of visibleHexes', () => {
    const fog = updateFogOfWar(EMPTY_FOG, [makeUnit({ q: 3, r: 3 })], [], MAP_RADIUS)
    const exploredKeys = new Set(fog.exploredHexes.map(hexKey))
    for (const coord of fog.visibleHexes) {
      expect(exploredKeys.has(hexKey(coord))).toBe(true)
    }
  })

  it('bootstraps from empty state: first update — exploredHexes equals visibleHexes', () => {
    const fog = updateFogOfWar(EMPTY_FOG, [makeUnit({ q: 0, r: 0 })], [], MAP_RADIUS)
    expect(fog.exploredHexes.map(hexKey).sort())
      .toEqual(fog.visibleHexes.map(hexKey).sort())
  })

  it('no duplicates in exploredHexes after multiple updates with overlapping paths', () => {
    let fog = EMPTY_FOG
    for (const pos of [{ q: 0, r: 0 }, { q: 3, r: 0 }, { q: 0, r: 3 }] as HexCoord[]) {
      fog = updateFogOfWar(fog, [makeUnit(pos)], [], MAP_RADIUS)
    }
    const keys = fog.exploredHexes.map(hexKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('preserves playerId', () => {
    const fog = updateFogOfWar(
      { playerId: 'player-42', visibleHexes: [], exploredHexes: [] },
      [makeUnit({ q: 0, r: 0 })],
      [],
      MAP_RADIUS,
    )
    expect(fog.playerId).toBe('player-42')
  })

  it('is pure — does not mutate the input fog state', () => {
    const fog1 = updateFogOfWar(EMPTY_FOG, [makeUnit({ q: 0, r: 0 })], [], MAP_RADIUS)
    const lengthBefore = fog1.exploredHexes.length
    updateFogOfWar(fog1, [makeUnit({ q: 5, r: 0 })], [], MAP_RADIUS)
    expect(fog1.exploredHexes.length).toBe(lengthBefore)
  })
})
