import { describe, it, expect } from 'vitest'
import {
  computePlayerScore,
  rankPlayers,
  determineWinner,
  eliminatePlayersWithNoCities,
  TERRITORY_POINTS_PER_CITY,
  POPULATION_POINTS_PER_POP,
  DEVELOPMENT_POINTS_PER_LEVEL,
} from './scoring.js'
import { CitySpecialization, Era, TurnState } from './types.js'
import type { GameState, Player, City, Unit, GameMap, HexCoord } from './types.js'

// ─── Builders ─────────────────────────────────────────────────────────────────

function makePlayer(id: string, isEliminated = false): Player {
  return {
    id,
    displayName: id,
    civilizationId: 'rome',
    resources: { gold: 0, food: 0, production: 0 },
    isEliminated,
    isAIControlled: false,
  }
}

function makeCity(id: string, ownerId: string, population = 1, level = 1): City {
  return {
    id,
    name: id,
    position: { q: 0, r: 0 },
    ownerId,
    population,
    specialization: CitySpecialization.Commercial,
    level,
    foodStored: 0,
  }
}

function makeUnit(id: string, ownerId: string, position: HexCoord = { q: 0, r: 0 }): Unit {
  return {
    id,
    unitType: 'warrior',
    position,
    stats: { attack: 6, defense: 2, hp: 10, maxHp: 10, movement: 2 },
    ownerId,
    hasMoved: false,
    hasAttacked: false,
  }
}

const MAP: GameMap = { tiles: [], radius: 5, seed: 's', startPositions: [] }

function makeState(opts: {
  players?: Player[]
  cities?: City[]
  units?: Unit[]
} = {}): GameState {
  return {
    gameId: 'g1',
    players: opts.players ?? [makePlayer('p0'), makePlayer('p1')],
    map: MAP,
    units: opts.units ?? [],
    cities: opts.cities ?? [],
    turnNumber: 1,
    currentPlayerId: 'p0',
    turnState: TurnState.WaitingForAction,
    era: Era.Ancient,
    maxTurns: 10,
    combatDisputes: [],
    nonAggressionPacts: [],
    diplomaticProposals: [],
    fogOfWar: [],
    winner: null,
    isFinished: false,
  }
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) deepFreeze(v)
    Object.freeze(obj)
  }
  return obj
}

// ─── computePlayerScore ───────────────────────────────────────────────────────

describe('computePlayerScore', () => {
  it('returns all zeros for a player with no cities', () => {
    const score = computePlayerScore('p0', [])
    expect(score).toEqual({ playerId: 'p0', territory: 0, population: 0, development: 0, total: 0 })
  })

  it('calculates each component from constants', () => {
    // 2 cities: pop=[2,3], level=[1,2]
    const cities = [makeCity('c1', 'p0', 2, 1), makeCity('c2', 'p0', 3, 2)]
    const score = computePlayerScore('p0', cities)

    expect(score.territory).toBe(2 * TERRITORY_POINTS_PER_CITY)            // 20
    expect(score.population).toBe((2 + 3) * POPULATION_POINTS_PER_POP)    // 15
    expect(score.development).toBe((1 + 2) * DEVELOPMENT_POINTS_PER_LEVEL) // 15
    expect(score.total).toBe(score.territory + score.population + score.development) // 50
  })

  it('only counts cities belonging to this player', () => {
    const cities = [makeCity('c1', 'p0', 5, 3), makeCity('c2', 'p1', 10, 10)]
    const p0 = computePlayerScore('p0', cities)
    const p1 = computePlayerScore('p1', cities)
    expect(p0.territory).toBe(1 * TERRITORY_POINTS_PER_CITY)
    expect(p0.population).toBe(5 * POPULATION_POINTS_PER_POP)
    expect(p0.development).toBe(3 * DEVELOPMENT_POINTS_PER_LEVEL)
    expect(p1.territory).toBe(1 * TERRITORY_POINTS_PER_CITY)
    expect(p1.population).toBe(10 * POPULATION_POINTS_PER_POP)
  })

  it('single city with population=1 and level=1 scores one step of each constant', () => {
    const score = computePlayerScore('p0', [makeCity('c', 'p0', 1, 1)])
    expect(score.territory).toBe(TERRITORY_POINTS_PER_CITY)
    expect(score.population).toBe(POPULATION_POINTS_PER_POP)
    expect(score.development).toBe(DEVELOPMENT_POINTS_PER_LEVEL)
    expect(score.total).toBe(TERRITORY_POINTS_PER_CITY + POPULATION_POINTS_PER_POP + DEVELOPMENT_POINTS_PER_LEVEL)
  })
})

// ─── rankPlayers ──────────────────────────────────────────────────────────────

describe('rankPlayers', () => {
  it('returns an empty array when all players are eliminated', () => {
    const state = makeState({
      players: [makePlayer('p0', true), makePlayer('p1', true)],
    })
    expect(rankPlayers(state)).toHaveLength(0)
  })

  it('excludes eliminated players from the ranking', () => {
    const state = makeState({
      players: [makePlayer('p0'), makePlayer('p1', true)],
      cities: [makeCity('c1', 'p0', 3, 2), makeCity('c2', 'p1', 10, 10)],
    })
    const ranked = rankPlayers(state)
    expect(ranked).toHaveLength(1)
    expect(ranked[0]!.playerId).toBe('p0')
  })

  it('places higher-scoring player first', () => {
    const state = makeState({
      players: [makePlayer('p0'), makePlayer('p1')],
      cities: [makeCity('c0', 'p0', 1, 1), makeCity('c1', 'p1', 5, 3)],
    })
    const ranked = rankPlayers(state)
    expect(ranked[0]!.playerId).toBe('p1') // p1 clearly ahead
  })

  it('breaks ties by playerId ascending (deterministic)', () => {
    // Both players have identical cities — same score
    const state = makeState({
      players: [makePlayer('p0'), makePlayer('p1')],
      cities: [makeCity('ca', 'p0', 2, 2), makeCity('cb', 'p1', 2, 2)],
    })
    const ranked = rankPlayers(state)
    // Equal total → 'p0'.localeCompare('p1') < 0, so p0 first
    expect(ranked[0]!.playerId).toBe('p0')
    expect(ranked[1]!.playerId).toBe('p1')
    expect(ranked[0]!.total).toBe(ranked[1]!.total)
  })
})

// ─── determineWinner ─────────────────────────────────────────────────────────

describe('determineWinner', () => {
  it('returns the leading player when one is clearly ahead', () => {
    const state = makeState({
      cities: [makeCity('c0', 'p0', 1, 1), makeCity('c1', 'p1', 5, 5)],
    })
    expect(determineWinner(state)).toBe('p1')
  })

  it('returns null on a tie (empate)', () => {
    // Both have exactly one city, same population and level → equal score
    const state = makeState({
      cities: [makeCity('c0', 'p0', 2, 2), makeCity('c1', 'p1', 2, 2)],
    })
    expect(determineWinner(state)).toBeNull()
  })

  it('returns the sole remaining player when others are eliminated', () => {
    const state = makeState({
      players: [makePlayer('p0'), makePlayer('p1', true)],
      cities: [makeCity('c0', 'p0')],
    })
    expect(determineWinner(state)).toBe('p0')
  })

  it('returns null when no active players exist', () => {
    const state = makeState({
      players: [makePlayer('p0', true), makePlayer('p1', true)],
    })
    expect(determineWinner(state)).toBeNull()
  })

  it('matches TurnHooks.determineWinner signature — callable directly as the hook', () => {
    // Just verifying the function can be assigned to the hook type without a cast.
    type Hook = (state: GameState) => string | null
    const hook: Hook = determineWinner
    expect(hook).toBe(determineWinner)
  })
})

// ─── eliminatePlayersWithNoCities ─────────────────────────────────────────────

describe('eliminatePlayersWithNoCities — eliminação no meio da partida', () => {
  it('marks a player with no cities as eliminated', () => {
    const state = makeState({
      players: [makePlayer('p0'), makePlayer('p1')],
      cities: [makeCity('c1', 'p1')], // only p1 has a city
    })
    const result = eliminatePlayersWithNoCities(state)
    expect(result.players.find(p => p.id === 'p0')!.isEliminated).toBe(true)
    expect(result.players.find(p => p.id === 'p1')!.isEliminated).toBe(false)
  })

  it("removes the eliminated player's units from the board (territory vira neutro)", () => {
    const state = makeState({
      players: [makePlayer('p0'), makePlayer('p1')],
      cities: [makeCity('c1', 'p1')],
      units: [
        makeUnit('u0', 'p0', { q: 0, r: 0 }),
        makeUnit('u1', 'p1', { q: 1, r: 0 }),
      ],
    })
    const result = eliminatePlayersWithNoCities(state)
    expect(result.units.some(u => u.ownerId === 'p0')).toBe(false)
    expect(result.units.some(u => u.ownerId === 'p1')).toBe(true)
  })

  it('does not re-eliminate an already-eliminated player', () => {
    const state = makeState({
      players: [makePlayer('p0', true), makePlayer('p1')],
      cities: [],
    })
    const result = eliminatePlayersWithNoCities(state)
    // p1 now eliminated for the first time; p0 stays eliminated but not double-processed
    expect(result.players.find(p => p.id === 'p0')!.isEliminated).toBe(true)
    expect(result.players.find(p => p.id === 'p1')!.isEliminated).toBe(true)
  })

  it('returns the same state (by reference) when no eliminations occur', () => {
    const state = makeState({
      cities: [makeCity('c0', 'p0'), makeCity('c1', 'p1')],
    })
    expect(eliminatePlayersWithNoCities(state)).toBe(state)
  })

  it('handles multiple simultaneous mid-game eliminations', () => {
    const state = makeState({
      players: [makePlayer('p0'), makePlayer('p1'), makePlayer('p2')],
      cities: [makeCity('c2', 'p2')], // only p2 has a city
      units: [makeUnit('u0', 'p0'), makeUnit('u1', 'p1')],
    })
    const result = eliminatePlayersWithNoCities(state)
    expect(result.players.filter(p => p.isEliminated).map(p => p.id).sort())
      .toEqual(['p0', 'p1'])
    expect(result.units).toHaveLength(0) // both unit owners eliminated
  })

  it('does not mutate a frozen input', () => {
    const state = deepFreeze(makeState({
      cities: [makeCity('c1', 'p1')], // p0 will be eliminated
    }))
    expect(() => eliminatePlayersWithNoCities(state)).not.toThrow()
    expect(state.players[0]!.isEliminated).toBe(false) // original unchanged
  })
})
