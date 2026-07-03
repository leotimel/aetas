import { describe, it, expect } from 'vitest'
import {
  WONDER_CATALOG,
  getWonderDef,
  eraAtLeast,
  wonderEconomyMultipliers,
  wonderEraProgressBonus,
  wonderScoreBonus,
  wonderCombatMultiplier,
} from './wonders.js'
import { validateAction, applyAction, type GameAction } from './actions.js'
import { computePlayerScore, scoreAll } from './scoring.js'
import { CitySpecialization, Era, TurnState } from './types.js'
import type { GameState, Player, City, BuiltWonder } from './types.js'

// ─── Builders ─────────────────────────────────────────────────────────────────

function makePlayer(id: string, production = 200): Player {
  return {
    id,
    displayName: id,
    civilizationId: 'romans',
    resources: { gold: 50, food: 50, production },
    isEliminated: false,
    isAIControlled: false,
  }
}

function makeCity(id: string, ownerId: string): City {
  return {
    id,
    name: id,
    position: { q: 0, r: 0 },
    ownerId,
    population: 2,
    specialization: CitySpecialization.Commercial,
    level: 1,
    foodStored: 0,
    buildings: [],
    construction: null,
  }
}

function makeState(opts: {
  players?: Player[]
  cities?: City[]
  wonders?: BuiltWonder[]
  era?: Era
  currentPlayerId?: string
} = {}): GameState {
  return {
    gameId: 'g1',
    players: opts.players ?? [makePlayer('p0'), makePlayer('p1')],
    map: { tiles: [], radius: 5, seed: 's', startPositions: [] },
    units: [],
    cities: opts.cities ?? [],
    turnNumber: 3,
    currentPlayerId: opts.currentPlayerId ?? 'p0',
    turnState: TurnState.WaitingForAction,
    era: opts.era ?? Era.Ancient,
    maxTurns: 20,
    combatDisputes: [],
    nonAggressionPacts: [],
    diplomaticProposals: [],
    fogOfWar: [],
    winner: null,
    isFinished: false,
    wonders: opts.wonders,
  }
}

const built = (wonderId: string, ownerId: string, cityId = 'c0'): BuiltWonder =>
  ({ wonderId, ownerId, cityId, builtAtTurn: 1 })

const NOW = 1000

// ─── Catalog ──────────────────────────────────────────────────────────────────

describe('WONDER_CATALOG', () => {
  it('has 6 wonders, each with a unique id and positive cost', () => {
    expect(WONDER_CATALOG.size).toBe(6)
    for (const [id, def] of WONDER_CATALOG) {
      expect(def.id).toBe(id)
      expect(def.productionCost).toBeGreaterThan(0)
    }
  })

  it('getWonderDef returns undefined for unknown ids', () => {
    expect(getWonderDef('atlantis')).toBeUndefined()
    expect(getWonderDef('colosseum')?.effect.type).toBe('scoreBonus')
  })

  it('eraAtLeast compares era ranks', () => {
    expect(eraAtLeast(Era.Ancient, Era.Ancient)).toBe(true)
    expect(eraAtLeast(Era.Ancient, Era.Medieval)).toBe(false)
    expect(eraAtLeast(Era.Medieval, Era.Classical)).toBe(true)
  })
})

// ─── Aggregators ──────────────────────────────────────────────────────────────

describe('wonder aggregators', () => {
  it('economy multipliers: only the owner benefits; product of matching wonders', () => {
    const state = makeState({ wonders: [built('hanging_gardens', 'p0'), built('grand_bazaar', 'p0'), built('great_forge', 'p1')] })
    const p0 = wonderEconomyMultipliers(state, 'p0')
    expect(p0.food).toBeCloseTo(1.30)
    expect(p0.gold).toBeCloseTo(1.25)
    expect(p0.production).toBe(1) // p0 doesn't own the forge
    expect(wonderEconomyMultipliers(state, 'p1').production).toBeCloseTo(1.25)
  })

  it('no wonders → neutral multipliers', () => {
    expect(wonderEconomyMultipliers(makeState(), 'p0')).toEqual({ gold: 1, food: 1, production: 1 })
    expect(wonderCombatMultiplier(makeState(), 'p0')).toBe(1)
    expect(wonderScoreBonus(makeState(), 'p0')).toBe(0)
    expect(wonderEraProgressBonus(makeState(), 'c0')).toBe(0)
  })

  it('era progress is city-scoped', () => {
    const state = makeState({ wonders: [built('great_library', 'p0', 'cityA')] })
    expect(wonderEraProgressBonus(state, 'cityA')).toBe(2)
    expect(wonderEraProgressBonus(state, 'cityB')).toBe(0)
  })

  it('score bonus and combat multiplier key on the owner', () => {
    const state = makeState({ wonders: [built('colosseum', 'p0'), built('art_of_war', 'p0')] })
    expect(wonderScoreBonus(state, 'p0')).toBe(15)
    expect(wonderCombatMultiplier(state, 'p0')).toBeCloseTo(1.15)
    expect(wonderScoreBonus(state, 'p1')).toBe(0)
  })

  it('ignores unknown wonder ids in state (legacy safety)', () => {
    const state = makeState({ wonders: [built('ziggurat_of_ur', 'p0')] })
    expect(wonderEconomyMultipliers(state, 'p0')).toEqual({ gold: 1, food: 1, production: 1 })
  })
})

// ─── buildWonder action ───────────────────────────────────────────────────────

describe('buildWonder — validate + apply', () => {
  const cities = () => [makeCity('c0', 'p0'), makeCity('c1', 'p1')]

  it('accepts a valid build (owned city, era reached, enough production)', () => {
    const state = makeState({ cities: cities(), era: Era.Ancient })
    const action: GameAction = { type: 'buildWonder', cityId: 'c0', wonderId: 'hanging_gardens' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: true })
  })

  it('rejects a wonder from a future era', () => {
    const state = makeState({ cities: cities(), era: Era.Ancient })
    const action: GameAction = { type: 'buildWonder', cityId: 'c0', wonderId: 'art_of_war' } // medieval
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'era not reached' })
  })

  it('rejects when the city is not the player’s', () => {
    const state = makeState({ cities: cities() })
    const action: GameAction = { type: 'buildWonder', cityId: 'c1', wonderId: 'hanging_gardens' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'not your city' })
  })

  it('rejects insufficient production', () => {
    const state = makeState({ players: [makePlayer('p0', 10), makePlayer('p1')], cities: cities() })
    const action: GameAction = { type: 'buildWonder', cityId: 'c0', wonderId: 'hanging_gardens' } // cost 90
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'insufficient production' })
  })

  it('deducts production and registers the wonder on apply', () => {
    const state = makeState({ cities: cities(), era: Era.Ancient })
    const action: GameAction = { type: 'buildWonder', cityId: 'c0', wonderId: 'hanging_gardens' }
    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.players.find(p => p.id === 'p0')!.resources.production).toBe(110) // 200 - 90
    expect(res.state.wonders).toEqual([
      { wonderId: 'hanging_gardens', ownerId: 'p0', cityId: 'c0', builtAtTurn: 3 },
    ])
  })

  it('GLOBAL uniqueness — a second player is blocked after the first builds it', () => {
    const state = makeState({ cities: cities(), era: Era.Ancient, currentPlayerId: 'p0' })
    const first = applyAction(state, 'p0', { type: 'buildWonder', cityId: 'c0', wonderId: 'hanging_gardens' }, NOW)
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error(first.reason)

    // p1 now tries the same wonder — validation rejects it (already built anywhere).
    const p1State = { ...first.state, currentPlayerId: 'p1' }
    const p1Action: GameAction = { type: 'buildWonder', cityId: 'c1', wonderId: 'hanging_gardens' }
    expect(validateAction(p1State, 'p1', p1Action, NOW)).toEqual({ valid: false, reason: 'wonder already built' })
  })
})

// ─── Score integration (Coliseu → placar) ─────────────────────────────────────

describe('wonder score integration', () => {
  it('Coliseu adds +15 to the owner’s development and total; others unaffected', () => {
    const cities = [makeCity('c0', 'p0')]
    const withWonder = built('colosseum', 'p0', 'c0')

    const base = computePlayerScore('p0', cities)                // no wonders arg
    const boosted = computePlayerScore('p0', cities, [withWonder])
    expect(boosted.development).toBe(base.development + 15)
    expect(boosted.total).toBe(base.total + 15)

    // Via the state wrapper: only p0's score reflects it.
    const state = makeState({ cities, wonders: [withWonder] })
    const all = scoreAll(state)
    expect(all['p0']!.total).toBe(base.total + 15)
    expect(all['p1']!.total).toBe(0) // p1 owns no city and no wonder
  })
})
