import { describe, it, expect } from 'vitest'
import {
  resolveWorldEvents,
  EVENT_START_TURN,
  GOLDEN_AGE_DURATION,
  BARB_CITY_DAMAGE,
} from './events.js'
import { generateMap, hexKey, hexDistance, hexNeighbors } from './map.js'
import { createUnitInstance } from './units.js'
import {
  TerrainType,
  UnitType,
  CitySpecialization,
  TurnState,
  Era,
  BARBARIAN_OWNER_ID,
} from './types.js'
import type { GameState, GameMap, Player, City, Unit, HexCoord } from './types.js'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const MAP: GameMap = generateMap(6, 'events-seed', 2)

function isLand(map: GameMap, coord: HexCoord): boolean {
  const t = map.tiles.find(tt => hexKey(tt.coord) === hexKey(coord))
  return !!t && t.terrainType !== TerrainType.Water && t.terrainType !== TerrainType.Mountain
}

/** A pair of adjacent land hexes, for unit-vs-unit / besiege scenarios. */
function adjacentLandPair(map: GameMap): [HexCoord, HexCoord] {
  for (const t of map.tiles) {
    if (!isLand(map, t.coord)) continue
    for (const n of hexNeighbors(t.coord)) {
      if (isLand(map, n)) return [t.coord, n]
    }
  }
  throw new Error('no adjacent land pair on map')
}

function makePlayer(id: string): Player {
  return {
    id,
    displayName: id,
    civilizationId: 'romans',
    resources: { gold: 100, food: 100, production: 100 },
    isEliminated: false,
    isAIControlled: false,
  }
}

function makeCity(id: string, ownerId: string, position: HexCoord, over: Partial<City> = {}): City {
  return {
    id,
    name: id,
    position,
    ownerId,
    population: 3,
    specialization: CitySpecialization.Commercial,
    level: 1,
    foodStored: 0,
    buildings: [],
    construction: null,
    ...over,
  }
}

function makeState(over: Partial<GameState> = {}): GameState {
  return {
    gameId: 'g1',
    players: [makePlayer('p0'), makePlayer('p1')],
    map: MAP,
    units: [],
    cities: [
      makeCity('c0', 'p0', MAP.startPositions[0]!),
      makeCity('c1', 'p1', MAP.startPositions[1]!),
    ],
    turnNumber: 10,
    currentPlayerId: 'p0',
    turnState: TurnState.WaitingForAction,
    era: Era.Ancient,
    maxTurns: 200,
    combatDisputes: [],
    nonAggressionPacts: [],
    diplomaticProposals: [],
    fogOfWar: [],
    winner: null,
    isFinished: false,
    ...over,
  }
}

/** Deep clone via JSON — GameState is plain data (no functions/dates/maps). */
const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s))

/** Scan for the first round (from EVENT_START_TURN) whose event has `type`. */
function firstRoundOfType(base: GameState, type: string): number {
  for (let round = EVENT_START_TURN; round < 400; round++) {
    const ev = resolveWorldEvents(base, round).lastEvents ?? []
    if (ev.some(e => e.type === type)) return round
  }
  throw new Error(`no ${type} event found within scan window`)
}

// ─── Determinism (the core requirement) ──────────────────────────────────────

describe('resolveWorldEvents — determinism', () => {
  it('same seed + round → identical result (deep equal), fired or not', () => {
    const base = makeState()
    for (let round = EVENT_START_TURN; round < 40; round++) {
      const a = resolveWorldEvents(clone(base), round)
      const b = resolveWorldEvents(clone(base), round)
      expect(a).toEqual(b)
    }
  })

  it('the sequence of fired event types is stable across re-runs', () => {
    const base = makeState()
    const seq = () =>
      Array.from({ length: 60 }, (_, i) =>
        (resolveWorldEvents(base, EVENT_START_TURN + i).lastEvents ?? []).map(e => e.type).join(),
      )
    expect(seq()).toEqual(seq())
  })

  it('different seeds diverge in their event streams', () => {
    const streamFor = (seed: string) => {
      const s = makeState({ map: generateMap(6, seed, 2) })
      return Array.from({ length: 80 }, (_, i) =>
        (resolveWorldEvents(s, EVENT_START_TURN + i).lastEvents ?? []).map(e => e.type).join('|'),
      ).join(';')
    }
    expect(streamFor('alpha')).not.toBe(streamFor('beta'))
  })
})

// ─── Gate ─────────────────────────────────────────────────────────────────────

describe('resolveWorldEvents — start-turn gate', () => {
  it('fires no new event before EVENT_START_TURN', () => {
    const base = makeState()
    for (let round = 0; round < EVENT_START_TURN; round++) {
      expect(resolveWorldEvents(base, round).lastEvents).toEqual([])
    }
  })
})

// ─── Plague ─────────────────────────────────────────────────────────────────

describe('plague', () => {
  it('reduces a city population by 1 and records the event', () => {
    const base = makeState()
    const round = firstRoundOfType(base, 'plague')
    const after = resolveWorldEvents(base, round)
    const ev = (after.lastEvents ?? []).find(e => e.type === 'plague')!
    expect(ev).toBeDefined()
    const before = base.cities.find(c => c.id === ev.cityId)!
    const hit = after.cities.find(c => c.id === ev.cityId)!
    expect(hit.population).toBe(before.population - 1)
  })

  it('never drops population below 1', () => {
    const base = makeState({
      cities: [
        makeCity('c0', 'p0', MAP.startPositions[0]!, { population: 1 }),
        makeCity('c1', 'p1', MAP.startPositions[1]!, { population: 1 }),
      ],
    })
    const round = firstRoundOfType(base, 'plague')
    const after = resolveWorldEvents(base, round)
    for (const c of after.cities) expect(c.population).toBe(1)
    expect((after.lastEvents ?? []).some(e => e.type === 'plague')).toBe(true)
  })
})

// ─── Barbarian spawn ──────────────────────────────────────────────────────────

describe('barbarian spawn', () => {
  it('spawns a warrior for BARBARIAN_OWNER_ID on a valid, unoccupied land hex', () => {
    const base = makeState()
    const round = firstRoundOfType(base, 'barbarians')
    const before = new Set(base.units.map(u => u.id))
    const occupiedBefore = new Set<string>([
      ...base.units.map(u => hexKey(u.position)),
      ...base.cities.map(c => hexKey(c.position)),
    ])
    const after = resolveWorldEvents(base, round)
    const spawned = after.units.find(u => !before.has(u.id))!
    expect(spawned).toBeDefined()
    expect(spawned.ownerId).toBe(BARBARIAN_OWNER_ID)
    expect(spawned.unitType).toBe(UnitType.Warrior)
    expect(spawned.stats.hp).toBe(spawned.stats.maxHp)
    // Valid land, in-bounds, and not on a pre-existing unit/city.
    expect(isLand(MAP, spawned.position)).toBe(true)
    expect(occupiedBefore.has(hexKey(spawned.position))).toBe(false)
    // Near the event's city.
    const ev = (after.lastEvents ?? []).find(e => e.type === 'barbarians')!
    const city = base.cities.find(c => c.id === ev.cityId)!
    expect(hexDistance(spawned.position, city.position)).toBeLessThanOrEqual(2)
  })
})

// ─── Active barbarians (attack step runs every round, no RNG) ─────────────────

describe('active barbarians', () => {
  it('attacks an adjacent enemy unit (deals damage / can destroy it)', () => {
    const [barbPos, enemyPos] = adjacentLandPair(MAP)
    const barb = createUnitInstance('barb-x', UnitType.Warrior, BARBARIAN_OWNER_ID, barbPos)
    const enemy = createUnitInstance('enemy-1', UnitType.Warrior, 'p0', enemyPos)
    const weakEnemy: Unit = { ...enemy, stats: { ...enemy.stats, hp: 1 } }
    const base = makeState({ units: [barb, weakEnemy] })
    // Round below the gate → no new event; isolates the attack step.
    const after = resolveWorldEvents(base, 3)
    expect(after.units.find(u => u.id === 'enemy-1')).toBeUndefined() // killed
    expect(after.lastEvents).toEqual([]) // attacks are silent
  })

  it('besieges an adjacent city: chips HP, floored at 1, never captures', () => {
    const [barbPos, cityPos] = adjacentLandPair(MAP)
    const barb = createUnitInstance('barb-y', UnitType.Warrior, BARBARIAN_OWNER_ID, barbPos)
    const city = makeCity('cX', 'p0', cityPos, { hp: 10, maxHp: 10 })
    const base = makeState({ units: [barb], cities: [city] })
    const after = resolveWorldEvents(base, 3)
    const hit = after.cities.find(c => c.id === 'cX')!
    expect(hit.hp).toBe(10 - BARB_CITY_DAMAGE)
    expect(hit.ownerId).toBe('p0') // never captured
  })

  it('city HP never goes below 1 under siege', () => {
    const [barbPos, cityPos] = adjacentLandPair(MAP)
    const barb = createUnitInstance('barb-z', UnitType.Warrior, BARBARIAN_OWNER_ID, barbPos)
    const city = makeCity('cLow', 'p0', cityPos, { hp: 1, maxHp: 10 })
    const base = makeState({ units: [barb], cities: [city] })
    const after = resolveWorldEvents(base, 3)
    expect(after.cities.find(c => c.id === 'cLow')!.hp).toBe(1)
  })
})

// ─── Golden Age ─────────────────────────────────────────────────────────────

describe('golden age', () => {
  it('sets the global counter to GOLDEN_AGE_DURATION when it fires', () => {
    const base = makeState()
    const round = firstRoundOfType(base, 'goldenAge')
    const after = resolveWorldEvents(base, round)
    expect(after.goldenAgeTurnsRemaining).toBe(GOLDEN_AGE_DURATION)
    expect((after.lastEvents ?? []).some(e => e.type === 'goldenAge')).toBe(true)
  })

  it('decrements an active counter each round (below the event gate)', () => {
    const base = makeState({ goldenAgeTurnsRemaining: 3 })
    expect(resolveWorldEvents(base, 3).goldenAgeTurnsRemaining).toBe(2)
    expect(resolveWorldEvents({ ...base, goldenAgeTurnsRemaining: 1 }, 3).goldenAgeTurnsRemaining).toBe(0)
    expect(resolveWorldEvents({ ...base, goldenAgeTurnsRemaining: 0 }, 3).goldenAgeTurnsRemaining).toBe(0)
  })
})

// ─── Robustness ─────────────────────────────────────────────────────────────

describe('resolveWorldEvents — robustness', () => {
  it('does not throw on a state with no cities or units', () => {
    const base = makeState({ cities: [], units: [] })
    for (let round = EVENT_START_TURN; round < 30; round++) {
      expect(() => resolveWorldEvents(base, round)).not.toThrow()
    }
  })
})
