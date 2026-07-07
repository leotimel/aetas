import { describe, it, expect } from 'vitest'
import { validateAction, applyAction, type GameAction } from './actions.js'
import { createCombatDispute } from './combat.js'
import { hexKey, hexesInRadius } from './map.js'
import {
  TurnState,
  CombatDisputeStatus,
  CitySpecialization,
  BuildingType,
  TerrainType,
  Era,
} from './types.js'
import type {
  Unit,
  UnitStats,
  City,
  GameState,
  GameMap,
  HexCoord,
  Player,
  CombatDispute,
  PlayerFogOfWar,
} from './types.js'

// ─── Builders ─────────────────────────────────────────────────────────────────

function makeUnit(
  id: string,
  ownerId: string,
  position: HexCoord,
  stats: Partial<UnitStats> = {},
): Unit {
  return {
    id,
    unitType: 'warrior',
    position,
    stats: { attack: 6, defense: 2, hp: 10, maxHp: 10, movement: 2, ...stats },
    ownerId,
    hasMoved: false,
    hasAttacked: false,
  }
}

function makePlayer(id: string): Player {
  return {
    id,
    displayName: id,
    civilizationId: 'rome',
    resources: { gold: 0, food: 0, production: 0 },
    isEliminated: false,
    isAIControlled: false,
  }
}

const MAP: GameMap = { tiles: [], radius: 5, seed: 's', startPositions: [] }

function makeCity(id: string, ownerId: string, position: HexCoord): City {
  return {
    id,
    name: `City ${id}`,
    ownerId,
    position,
    population: 2,
    specialization: CitySpecialization.Military,
    level: 1,
    foodStored: 0,
  }
}

function makeState(opts: {
  units?: Unit[]
  disputes?: CombatDispute[]
  players?: Player[]
  cities?: City[]
  currentPlayerId?: string
  turnState?: TurnState
  isFinished?: boolean
  tiles?: GameMap['tiles']
  nonAggressionPacts?: GameState['nonAggressionPacts']
  wars?: GameState['wars']
  fogOfWar?: PlayerFogOfWar[]
} = {}): GameState {
  return {
    gameId: 'g1',
    players: opts.players ?? [makePlayer('p0'), makePlayer('p1')],
    map: opts.tiles ? { ...MAP, tiles: opts.tiles } : MAP,
    units: opts.units ?? [],
    cities: opts.cities ?? [],
    turnNumber: 1,
    currentPlayerId: opts.currentPlayerId ?? 'p0',
    turnState: opts.turnState ?? TurnState.WaitingForAction,
    era: Era.Ancient,
    maxTurns: 10,
    combatDisputes: opts.disputes ?? [],
    nonAggressionPacts: opts.nonAggressionPacts ?? [],
    wars: opts.wars,
    diplomaticProposals: [],
    fogOfWar: opts.fogOfWar ?? [],
    winner: null,
    isFinished: opts.isFinished ?? false,
  }
}

/** All non-water tiles within radius 5 of origin, for movement/territory tests. */
function landTiles(): GameMap['tiles'] {
  return hexesInRadius({ q: 0, r: 0 }, 5).map(coord => ({ coord, terrainType: TerrainType.Plains }))
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) deepFreeze(v)
    Object.freeze(obj)
  }
  return obj
}

const NOW = 1000

// ─── canSubmitAction gate ─────────────────────────────────────────────────────

describe('validateAction — the shared gate', () => {
  const action: GameAction = { type: 'endTurn' }

  it('rejects every action when it is not the player’s turn', () => {
    const state = makeState({ currentPlayerId: 'p1' })
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'not your turn' })
  })

  it('rejects when the player is eliminated', () => {
    const players = [makePlayer('p0'), makePlayer('p1')]
    players[0]!.isEliminated = true
    const state = makeState({ players })
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'player eliminated' })
  })

  it('rejects when the game is finished', () => {
    expect(validateAction(makeState({ isFinished: true }), 'p0', action, NOW))
      .toEqual({ valid: false, reason: 'game finished' })
  })

  it('rejects when turnState is not WaitingForAction', () => {
    const state = makeState({ turnState: TurnState.Processing })
    expect(validateAction(state, 'p0', action, NOW))
      .toEqual({ valid: false, reason: 'turn not awaiting action' })
  })

  it('accepts endTurn on a fresh turn', () => {
    expect(validateAction(makeState(), 'p0', action, NOW)).toEqual({ valid: true })
  })
})

// ─── initiateCombat validation ────────────────────────────────────────────────

describe('validateAction — initiateCombat', () => {
  const setup = (defenderPos: HexCoord) => {
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 })
    const defender = makeUnit('d', 'p1', defenderPos)
    return makeState({ units: [attacker, defender] })
  }

  it('accepts an adjacent enemy with an un-attacked attacker', () => {
    const state = setup({ q: 1, r: 0 })
    const action: GameAction = { type: 'initiateCombat', attackerUnitId: 'a', defenderUnitId: 'd' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: true })
  })

  it('rejects at distance 0 (same hex) and distance 2 (no move step exists)', () => {
    const adj: GameAction = { type: 'initiateCombat', attackerUnitId: 'a', defenderUnitId: 'd' }
    expect(validateAction(setup({ q: 0, r: 0 }), 'p0', adj, NOW).valid).toBe(false)
    expect(validateAction(setup({ q: 2, r: 0 }), 'p0', adj, NOW).valid).toBe(false)
  })

  it('rejects attacking your own unit', () => {
    const a = makeUnit('a', 'p0', { q: 0, r: 0 })
    const b = makeUnit('b', 'p0', { q: 1, r: 0 })
    const state = makeState({ units: [a, b] })
    const action: GameAction = { type: 'initiateCombat', attackerUnitId: 'a', defenderUnitId: 'b' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'cannot attack your own unit' })
  })

  it('rejects when the attacker is not yours', () => {
    const state = setup({ q: 1, r: 0 })
    const action: GameAction = { type: 'initiateCombat', attackerUnitId: 'd', defenderUnitId: 'a' }
    // p0 tries to use p1's unit 'd' — current player is p0, attacker owned by p1
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'attacker is not yours' })
  })

  it('rejects a missing unit', () => {
    const state = setup({ q: 1, r: 0 })
    const action: GameAction = { type: 'initiateCombat', attackerUnitId: 'a', defenderUnitId: 'ghost' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'unit not found' })
  })
})

// ─── applyAction: initiateCombat ──────────────────────────────────────────────

describe('applyAction — initiateCombat', () => {
  it('appends exactly one Pending dispute and sets attacker.hasAttacked', () => {
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 })
    const defender = makeUnit('d', 'p1', { q: 1, r: 0 })
    const state = makeState({ units: [attacker, defender] })
    const action: GameAction = { type: 'initiateCombat', attackerUnitId: 'a', defenderUnitId: 'd' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.combatDisputes).toHaveLength(1)
    expect(res.state.combatDisputes[0]!.status).toBe(CombatDisputeStatus.Pending)
    expect(res.state.units.find(u => u.id === 'a')!.hasAttacked).toBe(true)
  })

  it('a second attack by the same unit is now invalid (hasAttacked + pending dispute)', () => {
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 })
    const d1 = makeUnit('d', 'p1', { q: 1, r: 0 })
    const d2 = makeUnit('e', 'p1', { q: -1, r: 0 })
    const state = makeState({ units: [attacker, d1, d2] })
    const first = applyAction(state, 'p0', { type: 'initiateCombat', attackerUnitId: 'a', defenderUnitId: 'd' }, NOW)
    if (!first.ok) throw new Error(first.reason)
    const second: GameAction = { type: 'initiateCombat', attackerUnitId: 'a', defenderUnitId: 'e' }
    expect(validateAction(first.state, 'p0', second, NOW).valid).toBe(false)
  })

  it('does not throw on a self/same-owner attack — pre-validated to ok:false', () => {
    const a = makeUnit('a', 'p0', { q: 0, r: 0 })
    const b = makeUnit('b', 'p0', { q: 1, r: 0 })
    const state = makeState({ units: [a, b] })
    const action: GameAction = { type: 'initiateCombat', attackerUnitId: 'a', defenderUnitId: 'b' }
    expect(() => applyAction(state, 'p0', action, NOW)).not.toThrow()
    expect(applyAction(state, 'p0', action, NOW).ok).toBe(false)
  })

  it('attacking a dedicated AI opponent resolves immediately — no dispute, lethal', () => {
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 }, { attack: 20 })
    const defender = makeUnit('d', 'p1', { q: 1, r: 0 }, { defense: 0, hp: 5 })
    const aiPlayer = { ...makePlayer('p1'), isAIControlled: true }
    const state = makeState({ players: [makePlayer('p0'), aiPlayer], units: [attacker, defender] })
    const action: GameAction = { type: 'initiateCombat', attackerUnitId: 'a', defenderUnitId: 'd' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.combatDisputes).toHaveLength(0)             // resolved on the spot
    expect(res.state.units.some(u => u.id === 'd')).toBe(false)  // defender destroyed
    expect(res.state.units.find(u => u.id === 'a')!.hasAttacked).toBe(true)
  })

  it('immediate AI combat damages a surviving defender and marks hasAttacked', () => {
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 }, { attack: 8 })
    const defender = makeUnit('d', 'p1', { q: 1, r: 0 }, { defense: 2, hp: 20 })
    const aiPlayer = { ...makePlayer('p1'), isAIControlled: true }
    const state = makeState({ players: [makePlayer('p0'), aiPlayer], units: [attacker, defender] })

    const res = applyAction(state, 'p0', { type: 'initiateCombat', attackerUnitId: 'a', defenderUnitId: 'd' }, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.combatDisputes).toHaveLength(0)
    expect(res.state.units.find(u => u.id === 'd')!.stats.hp).toBeLessThan(20) // took damage
    expect(res.state.units.find(u => u.id === 'a')!.hasAttacked).toBe(true)
  })
})

// ─── respondToDispute ─────────────────────────────────────────────────────────

describe('respondToDispute', () => {
  function disputeState() {
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 }, { attack: 8 })
    const defender = makeUnit('d', 'p1', { q: 1, r: 0 }, { defense: 2, hp: 10 })
    const dispute = createCombatDispute(attacker, defender, NOW)
    // current player must be p1 to respond as defender
    return makeState({ units: [attacker, defender], disputes: [dispute], currentPlayerId: 'p1' })
  }

  it('is valid only when the dispute exists, is Pending, and the player is involved', () => {
    const state = disputeState()
    const id = state.combatDisputes[0]!.id
    expect(validateAction(state, 'p1', { type: 'respondToDispute', disputeId: id }, NOW).valid).toBe(true)
    expect(validateAction(state, 'p1', { type: 'respondToDispute', disputeId: 'nope' }, NOW).valid).toBe(false)
  })

  it('applying as defender resolves with the active-defense bonus (hp 6)', () => {
    const state = disputeState()
    const id = state.combatDisputes[0]!.id
    const res = applyAction(state, 'p1', { type: 'respondToDispute', disputeId: id }, NOW)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.combatDisputes[0]!.status).toBe(CombatDisputeStatus.ResolvedByAction)
    expect(res.state.units.find(u => u.id === 'd')!.stats.hp).toBe(6) // 8 - (2+2)
  })

  it('applyAction re-validates and returns ok:false for a stale action', () => {
    const state = disputeState()
    const id = state.combatDisputes[0]!.id
    const first = applyAction(state, 'p1', { type: 'respondToDispute', disputeId: id }, NOW)
    if (!first.ok) throw new Error(first.reason)
    const stale = applyAction(first.state, 'p1', { type: 'respondToDispute', disputeId: id }, NOW)
    expect(stale.ok).toBe(false)
  })
})

// ─── Purity ───────────────────────────────────────────────────────────────────

describe('purity', () => {
  it('validateAction and applyAction do not mutate a frozen input', () => {
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 })
    const defender = makeUnit('d', 'p1', { q: 1, r: 0 })
    const state = deepFreeze(makeState({ units: [attacker, defender] }))
    const action: GameAction = { type: 'initiateCombat', attackerUnitId: 'a', defenderUnitId: 'd' }
    expect(() => validateAction(state, 'p0', action, NOW)).not.toThrow()
    expect(() => applyAction(state, 'p0', action, NOW)).not.toThrow()
    expect(state.units.find(u => u.id === 'a')!.hasAttacked).toBe(false) // unchanged
    expect(state.combatDisputes).toHaveLength(0)
  })
})

// ─── trainUnit ────────────────────────────────────────────────────────────────

function romanPlayer(id: string, production: number): Player {
  // Ample food/gold by default so production-focused tests aren't blocked by the
  // food+gold training cost (E6). Tests that probe those limits set them explicitly.
  return { ...makePlayer(id), civilizationId: 'romans', resources: { gold: 100, food: 100, production } }
}

describe('validateAction — trainUnit', () => {
  it('rejects when city is not found', () => {
    const state = makeState({ players: [romanPlayer('p0', 100), makePlayer('p1')] })
    const action: GameAction = { type: 'trainUnit', cityId: 'ghost', unitType: 'archer', unitId: 'u1' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'city not found' })
  })

  it('rejects when city belongs to another player', () => {
    const city = makeCity('c1', 'p1', { q: 0, r: 0 })
    const state = makeState({ players: [romanPlayer('p0', 100), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'archer', unitId: 'u1' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'not your city' })
  })

  it('rejects when unit type is not available in current era (Cavalry in Ancient)', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    const state = makeState({ players: [romanPlayer('p0', 100), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'cavalry', unitId: 'u1' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'unit not available in this era' })
  })

  it('rejects when production is insufficient', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    // Archer costs 25; player has only 10
    const state = makeState({ players: [romanPlayer('p0', 10), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'archer', unitId: 'u1' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'insufficient production' })
  })

  it('rejects when the city hex is already occupied by own unit', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    const occupier = makeUnit('ux', 'p0', { q: 0, r: 0 })
    const state = makeState({
      players: [romanPlayer('p0', 100), makePlayer('p1')],
      cities: [city],
      units: [occupier],
    })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'archer', unitId: 'u1' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'city hex occupied' })
  })

  it('accepts a valid trainUnit action', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    const state = makeState({ players: [romanPlayer('p0', 100), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'archer', unitId: 'u1' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: true })
  })
})

describe('applyAction — trainUnit', () => {
  it('places the new unit at the city position', () => {
    const city = makeCity('c1', 'p0', { q: 3, r: -1 })
    const state = makeState({ players: [romanPlayer('p0', 100), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'archer', unitId: 'new-archer' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    const unit = res.state.units.find(u => u.id === 'new-archer')
    expect(unit).toBeDefined()
    expect(unit!.position).toEqual({ q: 3, r: -1 })
    expect(unit!.unitType).toBe('archer')
    expect(unit!.ownerId).toBe('p0')
  })

  it('deducts the unit production cost from the acting player', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    // Archer costs 25; start with 100 → should have 75 after
    const state = makeState({ players: [romanPlayer('p0', 100), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'archer', unitId: 'u2' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    const p0 = res.state.players.find(p => p.id === 'p0')!
    expect(p0.resources.production).toBe(75)
  })

  it('works for a civilization special unit (roman_legionary)', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    // roman_legionary costs 30
    const state = makeState({ players: [romanPlayer('p0', 50), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'roman_legionary', unitId: 'lg1' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    const unit = res.state.units.find(u => u.id === 'lg1')
    expect(unit!.unitType).toBe('roman_legionary')
    const p0 = res.state.players.find(p => p.id === 'p0')!
    expect(p0.resources.production).toBe(20) // 50 - 30
  })

  it('does not mutate a frozen input state', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    const state = deepFreeze(makeState({ players: [romanPlayer('p0', 100), makePlayer('p1')], cities: [city] }))
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'archer', unitId: 'u3' }
    expect(() => applyAction(state, 'p0', action, NOW)).not.toThrow()
    expect(state.units).toHaveLength(0)
    const p0 = state.players.find(p => p.id === 'p0')!
    expect(p0.resources.production).toBe(100)
  })
})

// ─── trainUnit: rising Settler cost per owned city (ENT-3) ─────────────────────

describe('applyAction — trainUnit Settler expansion cost (ENT-3)', () => {
  it('Settler with 1 owned city deducts base*1.5 (40→60)', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    const state = makeState({ players: [romanPlayer('p0', 200), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'settler', unitId: 's1' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.players.find(p => p.id === 'p0')!.resources.production).toBe(140) // 200 - 60
  })

  it('Settler with 3 owned cities deducts base*2.5 (40→100)', () => {
    const cities = [
      makeCity('c1', 'p0', { q: 0, r: 0 }),
      makeCity('c2', 'p0', { q: 4, r: 0 }),
      makeCity('c3', 'p0', { q: 0, r: 4 }),
    ]
    const state = makeState({ players: [romanPlayer('p0', 200), makePlayer('p1')], cities })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'settler', unitId: 's1' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.players.find(p => p.id === 'p0')!.resources.production).toBe(100) // 200 - 100
  })

  it('the scaling does not leak to other units — Archer still costs base with 3 cities', () => {
    const cities = [
      makeCity('c1', 'p0', { q: 0, r: 0 }),
      makeCity('c2', 'p0', { q: 4, r: 0 }),
      makeCity('c3', 'p0', { q: 0, r: 4 }),
    ]
    const state = makeState({ players: [romanPlayer('p0', 200), makePlayer('p1')], cities })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'archer', unitId: 'a1' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.players.find(p => p.id === 'p0')!.resources.production).toBe(175) // 200 - 25 (archer base)
  })
})

// ─── trainUnit: food + gold cost + population cap (E6) ─────────────────────────

describe('validateAction — trainUnit economy gates (E6)', () => {
  it('rejects when food is insufficient (archer needs ceil(25/2)=13)', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    const p0 = { ...romanPlayer('p0', 100), resources: { gold: 100, food: 0, production: 100 } }
    const state = makeState({ players: [p0, makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'archer', unitId: 'u1' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'insufficient food' })
  })

  it('rejects when gold is insufficient (archer needs ceil(25/3)=9)', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    const p0 = { ...romanPlayer('p0', 100), resources: { gold: 0, food: 100, production: 100 } }
    const state = makeState({ players: [p0, makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'archer', unitId: 'u1' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'insufficient gold' })
  })

  it('rejects when current units >= total population', () => {
    // City pop 1 + 1 existing unit (away from the city hex) → cap reached.
    const city = { ...makeCity('c1', 'p0', { q: 0, r: 0 }), population: 1 }
    const existing = makeUnit('u-old', 'p0', { q: 4, r: 0 })
    const state = makeState({ players: [romanPlayer('p0', 100), makePlayer('p1')], cities: [city], units: [existing] })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'archer', unitId: 'u1' }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'insufficient population' })
  })
})

describe('applyAction — trainUnit deducts food and gold (E6)', () => {
  it('deducts ceil(cost/2) food and ceil(cost/3) gold (archer cost 25)', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    const state = makeState({ players: [romanPlayer('p0', 100), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'trainUnit', cityId: 'c1', unitType: 'archer', unitId: 'u2' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    const p0 = res.state.players.find(p => p.id === 'p0')!
    expect(p0.resources.production).toBe(75)  // 100 - 25
    expect(p0.resources.food).toBe(87)        // 100 - 13
    expect(p0.resources.gold).toBe(91)        // 100 - 9
  })
})

// ─── attackCity: HP scaling + auto-elimination (E6) ───────────────────────────

describe('applyAction — attackCity balance (E6)', () => {
  it('capturing the last city eliminates the former owner and removes their units', () => {
    const city = makeCity('c1', 'p1', { q: 1, r: 0 })          // p1's only city, level 1 (hp 10, def 4)
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 }, { attack: 20 }) // 20-4=16 dmg ≥ 10 → capture
    const victimUnit = makeUnit('v', 'p1', { q: 5, r: 0 })
    const state = makeState({ cities: [city], units: [attacker, victimUnit] })
    const action: GameAction = { type: 'attackCity', unitId: 'a', cityId: 'c1' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.cities.find(c => c.id === 'c1')!.ownerId).toBe('p0')
    expect(res.state.players.find(p => p.id === 'p1')!.isEliminated).toBe(true)
    expect(res.state.units.some(u => u.ownerId === 'p1')).toBe(false) // p1 units removed
  })

  it('a level-2 city is not captured in one hit by an attack-18 unit', () => {
    const city = { ...makeCity('c1', 'p1', { q: 1, r: 0 }), level: 2 } // hp 15, def 5
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 }, { attack: 18 })
    const state = makeState({ cities: [city], units: [attacker] })
    const action: GameAction = { type: 'attackCity', unitId: 'a', cityId: 'c1' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    const c1 = res.state.cities.find(c => c.id === 'c1')!
    expect(c1.ownerId).toBe('p1')   // not captured
    expect(c1.hp).toBe(2)            // 15 - (18 - 5) = 2
    expect(res.state.players.find(p => p.id === 'p1')!.isEliminated).toBe(false)
  })
})

// ─── attackCity: instant domination victory (ENT-2) ──────────────────────────

describe('applyAction — attackCity instant domination (ENT-2)', () => {
  it('capturing the last enemy city (2 players) ends the game immediately', () => {
    const city = makeCity('c1', 'p1', { q: 1, r: 0 })              // p1's only city
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 }, { attack: 20 }) // captures
    const state = makeState({ cities: [city], units: [attacker] })
    const action: GameAction = { type: 'attackCity', unitId: 'a', cityId: 'c1' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.isFinished).toBe(true)
    expect(res.state.winner).toBe('p0')
    expect(res.state.turnState).toBe(TurnState.Completed)
  })

  it('capturing one of the victim’s two cities does NOT end the game', () => {
    const c1 = makeCity('c1', 'p1', { q: 1, r: 0 })
    const c2 = makeCity('c2', 'p1', { q: 5, r: 0 })               // p1 still has c2
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 }, { attack: 20 })
    const state = makeState({ cities: [c1, c2], units: [attacker] })
    const action: GameAction = { type: 'attackCity', unitId: 'a', cityId: 'c1' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.isFinished).toBe(false)
    expect(res.state.players.find(p => p.id === 'p1')!.isEliminated).toBe(false)
  })

  it('capturing one opponent’s last city while a third player survives does NOT end the game', () => {
    const cityP1 = makeCity('c1', 'p1', { q: 1, r: 0 })           // p1's only city
    const cityP2 = makeCity('c2', 'p2', { q: 5, r: 0 })           // p2 still alive
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 }, { attack: 20 })
    const state = makeState({
      players: [makePlayer('p0'), makePlayer('p1'), makePlayer('p2')],
      cities: [cityP1, cityP2],
      units: [attacker],
    })
    const action: GameAction = { type: 'attackCity', unitId: 'a', cityId: 'c1' }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.isFinished).toBe(false)
    expect(res.state.players.find(p => p.id === 'p1')!.isEliminated).toBe(true)
    expect(res.state.players.find(p => p.id === 'p2')!.isEliminated).toBe(false)
  })
})

// ─── constructBuilding ────────────────────────────────────────────────────────

function playerWithProd(id: string, production: number): Player {
  // Ample gold by default so existing tests aren't blocked by the building goldCost (E7).
  return { ...makePlayer(id), resources: { gold: 100, food: 0, production } }
}

describe('validateAction — constructBuilding', () => {
  it('rejects when city is not found', () => {
    const state = makeState({ players: [playerWithProd('p0', 100), makePlayer('p1')] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'ghost', buildingType: BuildingType.Barracks }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'city not found' })
  })

  it('rejects when city belongs to another player', () => {
    const city = makeCity('c1', 'p1', { q: 0, r: 0 })
    const state = makeState({ players: [playerWithProd('p0', 100), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Barracks }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'not your city' })
  })

  it('rejects when building specialization does not match city', () => {
    // Military city; Market is Commercial
    const city = makeCity('c1', 'p0', { q: 0, r: 0 }) // Military
    const state = makeState({ players: [playerWithProd('p0', 100), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Market }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'wrong city specialization' })
  })

  it('rejects when building is already constructed', () => {
    const city: City = { ...makeCity('c1', 'p0', { q: 0, r: 0 }), buildings: [BuildingType.Barracks] }
    const state = makeState({ players: [playerWithProd('p0', 100), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Barracks }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'building already constructed' })
  })

  it('rejects when construction is already in progress', () => {
    const city: City = {
      ...makeCity('c1', 'p0', { q: 0, r: 0 }),
      construction: { buildingType: BuildingType.Barracks, turnsRemaining: 2, totalTurns: 3 },
    }
    const state = makeState({ players: [playerWithProd('p0', 100), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Wall }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'construction already in progress' })
  })

  it('rejects when production is insufficient', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 }) // Military
    // Barracks costs 8; player has only 5
    const state = makeState({ players: [playerWithProd('p0', 5), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Barracks }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'insufficient production' })
  })

  it('accepts a valid constructBuilding action', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 }) // Military
    const state = makeState({ players: [playerWithProd('p0', 50), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Barracks }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: true })
  })

  it('rejects 2nd building of same specialization when city.level < 2 (E8)', () => {
    // Barracks already built; Wall is the 2nd Military building — requires level 2
    const city: City = { ...makeCity('c1', 'p0', { q: 0, r: 0 }), buildings: [BuildingType.Barracks], level: 1 }
    const state = makeState({ players: [playerWithProd('p0', 50), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Wall }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'city level too low' })
  })

  it('accepts 2nd building when city.level >= 2 (E8)', () => {
    const city: City = { ...makeCity('c1', 'p0', { q: 0, r: 0 }), buildings: [BuildingType.Barracks], level: 2 }
    const state = makeState({ players: [playerWithProd('p0', 50), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Wall }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: true })
  })
})

describe('applyAction — constructBuilding', () => {
  it('sets city.construction with correct turnsRemaining', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 }) // Military — Barracks costs 8, takes 3 turns
    const state = makeState({ players: [playerWithProd('p0', 50), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Barracks }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    const updatedCity = res.state.cities.find(c => c.id === 'c1')!
    expect(updatedCity.construction?.buildingType).toBe(BuildingType.Barracks)
    expect(updatedCity.construction?.turnsRemaining).toBe(3)
    expect(updatedCity.construction?.totalTurns).toBe(3)
  })

  it('deducts the building production cost from the player', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 }) // Barracks costs 8
    const state = makeState({ players: [playerWithProd('p0', 50), makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Barracks }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    const p0 = res.state.players.find(p => p.id === 'p0')!
    expect(p0.resources.production).toBe(42) // 50 - 8
  })

  it('does not mutate a frozen input state', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    const state = deepFreeze(makeState({ players: [playerWithProd('p0', 100), makePlayer('p1')], cities: [city] }))
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Barracks }
    expect(() => applyAction(state, 'p0', action, NOW)).not.toThrow()
    expect(state.cities.find(c => c.id === 'c1')!.construction).toBeUndefined()
  })
})

// ─── constructBuilding: gold cost (E7) ────────────────────────────────────────

describe('validateAction — constructBuilding gold gate (E7)', () => {
  it('rejects when gold is insufficient (Barracks needs 4 gold)', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 }) // Military
    const p0 = { ...makePlayer('p0'), resources: { gold: 0, food: 0, production: 100 } }
    const state = makeState({ players: [p0, makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Barracks }
    expect(validateAction(state, 'p0', action, NOW)).toEqual({ valid: false, reason: 'insufficient gold' })
  })
})

describe('applyAction — constructBuilding deducts gold (E7)', () => {
  it('deducts goldCost from the player (Barracks: prod 8, gold 4)', () => {
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    const p0 = { ...makePlayer('p0'), resources: { gold: 20, food: 0, production: 50 } }
    const state = makeState({ players: [p0, makePlayer('p1')], cities: [city] })
    const action: GameAction = { type: 'constructBuilding', cityId: 'c1', buildingType: BuildingType.Barracks }

    const res = applyAction(state, 'p0', action, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    const player = res.state.players.find(p => p.id === 'p0')!
    expect(player.resources.production).toBe(42) // 50 - 8
    expect(player.resources.gold).toBe(16)       // 20 - 4
  })
})

// ─── fortifyCity (E7) ─────────────────────────────────────────────────────────

describe('validateAction — fortifyCity (E7)', () => {
  it('rejects when goldAmount < 5', () => {
    const city: City = { ...makeCity('c1', 'p0', { q: 0, r: 0 }), hp: 5 }
    const p0 = { ...makePlayer('p0'), resources: { gold: 20, food: 0, production: 0 } }
    const state = makeState({ players: [p0, makePlayer('p1')], cities: [city] })
    expect(validateAction(state, 'p0', { type: 'fortifyCity', cityId: 'c1', goldAmount: 3 }, NOW))
      .toEqual({ valid: false, reason: 'minimum 5 gold' })
  })

  it('rejects when player gold < goldAmount', () => {
    const city: City = { ...makeCity('c1', 'p0', { q: 0, r: 0 }), hp: 5 }
    const p0 = { ...makePlayer('p0'), resources: { gold: 4, food: 0, production: 0 } }
    const state = makeState({ players: [p0, makePlayer('p1')], cities: [city] })
    expect(validateAction(state, 'p0', { type: 'fortifyCity', cityId: 'c1', goldAmount: 5 }, NOW))
      .toEqual({ valid: false, reason: 'insufficient gold' })
  })

  it('rejects when city is already at full HP (level 1 maxHp=10)', () => {
    const city: City = { ...makeCity('c1', 'p0', { q: 0, r: 0 }), hp: 10 }
    const p0 = { ...makePlayer('p0'), resources: { gold: 20, food: 0, production: 0 } }
    const state = makeState({ players: [p0, makePlayer('p1')], cities: [city] })
    expect(validateAction(state, 'p0', { type: 'fortifyCity', cityId: 'c1', goldAmount: 10 }, NOW))
      .toEqual({ valid: false, reason: 'city already at full hp' })
  })
})

describe('applyAction — fortifyCity (E7)', () => {
  it('increases city HP by floor(goldAmount/5) and deducts gold', () => {
    // City at hp=6; 20 gold → +4 HP → hp=10 (exactly maxHp=10)
    const city: City = { ...makeCity('c1', 'p0', { q: 0, r: 0 }), hp: 6 }
    const p0 = { ...makePlayer('p0'), resources: { gold: 30, food: 0, production: 0 } }
    const state = makeState({ players: [p0, makePlayer('p1')], cities: [city] })

    const res = applyAction(state, 'p0', { type: 'fortifyCity', cityId: 'c1', goldAmount: 20 }, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.cities.find(c => c.id === 'c1')!.hp).toBe(10)       // 6 + 4
    expect(res.state.players.find(p => p.id === 'p0')!.resources.gold).toBe(10) // 30 - 20
  })

  it('caps HP at cityMaxHp (cannot overheal)', () => {
    // City at hp=8; 25 gold → floor(25/5)=5 HP gain → would be 13, capped at 10
    const city: City = { ...makeCity('c1', 'p0', { q: 0, r: 0 }), hp: 8 }
    const p0 = { ...makePlayer('p0'), resources: { gold: 30, food: 0, production: 0 } }
    const state = makeState({ players: [p0, makePlayer('p1')], cities: [city] })

    const res = applyAction(state, 'p0', { type: 'fortifyCity', cityId: 'c1', goldAmount: 25 }, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.cities.find(c => c.id === 'c1')!.hp).toBe(10) // capped at maxHp
  })
})

describe('applyAction — moveUnit fog update', () => {
  const RADIUS = 5
  // Build a map with all tiles in the radius set to Plains so moveUnit validation passes.
  const FOG_MAP: GameMap = {
    tiles: hexesInRadius({ q: 0, r: 0 }, RADIUS).map(coord => ({
      coord,
      terrainType: TerrainType.Plains,
    })),
    radius: RADIUS,
    seed: 's',
    startPositions: [],
  }

  function makeFogState(unitPos: HexCoord, initialFog: PlayerFogOfWar): GameState {
    return {
      gameId: 'g1',
      players: [makePlayer('p0'), makePlayer('p1')],
      map: FOG_MAP,
      units: [makeUnit('u1', 'p0', unitPos)],
      cities: [],
      turnNumber: 1,
      currentPlayerId: 'p0',
      turnState: TurnState.WaitingForAction,
      era: Era.Ancient,
      maxTurns: 10,
      combatDisputes: [],
      nonAggressionPacts: [],
      diplomaticProposals: [],
      fogOfWar: [initialFog],
      winner: null,
      isFinished: false,
    }
  }

  it('visibleHexes updates to include hexes around new position after move', () => {
    const startPos: HexCoord  = { q: 0, r: 0 }
    const targetPos: HexCoord = { q: 2, r: 0 }
    const initialFog: PlayerFogOfWar = {
      playerId: 'p0',
      visibleHexes: [startPos],
      exploredHexes: [startPos],
    }
    const state = makeFogState(startPos, initialFog)
    const res = applyAction(state, 'p0', { type: 'moveUnit', unitId: 'u1', targetCoord: targetPos }, 0)
    expect(res.ok).toBe(true)
    const fog = res.state.fogOfWar.find(f => f.playerId === 'p0')!
    const visibleKeys = new Set(fog.visibleHexes.map(hexKey))
    expect(visibleKeys.has(hexKey(targetPos))).toBe(true)
  })

  it('exploredHexes retains hexes from old position (never shrinks)', () => {
    const startPos: HexCoord  = { q: 0, r: 0 }
    const targetPos: HexCoord = { q: 2, r: 0 }
    const initialFog: PlayerFogOfWar = {
      playerId: 'p0',
      visibleHexes: [startPos],
      exploredHexes: [startPos],
    }
    const state = makeFogState(startPos, initialFog)
    const res = applyAction(state, 'p0', { type: 'moveUnit', unitId: 'u1', targetCoord: targetPos }, 0)
    expect(res.ok).toBe(true)
    const fog = res.state.fogOfWar.find(f => f.playerId === 'p0')!
    const exploredKeys = new Set(fog.exploredHexes.map(hexKey))
    expect(exploredKeys.has(hexKey(startPos))).toBe(true)
    expect(exploredKeys.has(hexKey(targetPos))).toBe(true)
  })

  it('does not update fog when state has no fogOfWar entry for the player', () => {
    const startPos: HexCoord  = { q: 0, r: 0 }
    const targetPos: HexCoord = { q: 2, r: 0 }
    const stateNoFog: GameState = {
      gameId: 'g1',
      players: [makePlayer('p0'), makePlayer('p1')],
      map: FOG_MAP,
      units: [makeUnit('u1', 'p0', startPos)],
      cities: [],
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
    const res = applyAction(stateNoFog, 'p0', { type: 'moveUnit', unitId: 'u1', targetCoord: targetPos }, 0)
    expect(res.ok).toBe(true)
    expect(res.state.fogOfWar).toHaveLength(0)
  })
})

// ─── BAL-1: auto-declare war on attack ─────────────────────────────────────────

describe('applyAction — auto-declares war when attacking (BAL-1)', () => {
  // Contact is required to declare war; an attacker has necessarily seen the
  // enemy hex it is adjacent to. Mirror that by marking it explored.
  const sawHex = (playerId: string, coord: HexCoord): PlayerFogOfWar =>
    ({ playerId, visibleHexes: [coord], exploredHexes: [coord] })

  it('attackCity against a neutral civ declares war and deals damage', () => {
    const unit = makeUnit('u1', 'p0', { q: 1, r: 0 })
    const city = makeCity('c1', 'p1', { q: 0, r: 0 })
    const state = makeState({
      units: [unit], cities: [city], fogOfWar: [sawHex('p0', { q: 0, r: 0 })],
    })
    expect(state.wars).toBeUndefined()

    const res = applyAction(state, 'p0', { type: 'attackCity', unitId: 'u1', cityId: 'c1' }, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.wars).toHaveLength(1)
    expect(res.state.wars![0]!.declarerId).toBe('p0')
    expect(res.state.wars![0]!.targetId).toBe('p1')
    // City took damage (or was captured).
    const after = res.state.cities.find(c => c.id === 'c1')!
    expect(after.ownerId === 'p0' || (after.hp ?? Infinity) < (after.maxHp ?? Infinity)).toBe(true)
  })

  it('initiateCombat against a neutral civ declares war and opens a dispute', () => {
    const attacker = makeUnit('a', 'p0', { q: 0, r: 0 })
    const defender = makeUnit('d', 'p1', { q: 1, r: 0 })
    const state = makeState({
      units: [attacker, defender], fogOfWar: [sawHex('p0', { q: 1, r: 0 })],
    })

    const res = applyAction(state, 'p0', { type: 'initiateCombat', attackerUnitId: 'a', defenderUnitId: 'd' }, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.wars).toHaveLength(1)
    expect(res.state.wars![0]!.declarerId).toBe('p0')
    expect(res.state.combatDisputes).toHaveLength(1)
  })

  it('does not duplicate war when attacker is already at war', () => {
    const unit = makeUnit('u1', 'p0', { q: 1, r: 0 })
    const city = makeCity('c1', 'p1', { q: 0, r: 0 })
    const existingWar = { id: 'war:p1:p0:1', declarerId: 'p1', targetId: 'p0', declaredAtTurn: 1 }
    const state = makeState({ units: [unit], cities: [city], wars: [existingWar] })

    const res = applyAction(state, 'p0', { type: 'attackCity', unitId: 'u1', cityId: 'c1' }, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.wars).toHaveLength(1)
  })
})

// ─── BAL-1: territory movement block ───────────────────────────────────────────

describe('validateAction — territory movement block (BAL-1)', () => {
  const pactBetween = (a: string, b: string) =>
    ({ id: `pact:${a}:${b}`, proposerId: a, acceptorId: b, agreedAtTurn: 1 })
  const warBetween = (a: string, b: string) =>
    ({ id: `war:${a}:${b}:1`, declarerId: a, targetId: b, declaredAtTurn: 1 })

  // p1 city at origin → its territory is every tile within radius 2.
  // p0 unit starts at {3,0} (neutral ground, dist 3) and moves to {2,0} (p1 territory).
  const move: GameAction = { type: 'moveUnit', unitId: 'u1', targetCoord: { q: 2, r: 0 } }

  it('blocks moving into a neutral civ’s territory', () => {
    const unit = makeUnit('u1', 'p0', { q: 3, r: 0 })
    const city = makeCity('c1', 'p1', { q: 0, r: 0 })
    const state = makeState({ units: [unit], cities: [city], tiles: landTiles() })
    expect(validateAction(state, 'p0', move, NOW)).toEqual({ valid: false, reason: 'enemy territory' })
  })

  it('allows moving into territory of a civ you have a pact with', () => {
    const unit = makeUnit('u1', 'p0', { q: 3, r: 0 })
    const city = makeCity('c1', 'p1', { q: 0, r: 0 })
    const state = makeState({
      units: [unit], cities: [city], tiles: landTiles(),
      nonAggressionPacts: [pactBetween('p0', 'p1')],
    })
    expect(validateAction(state, 'p0', move, NOW)).toEqual({ valid: true })
  })

  it('allows moving into enemy territory while at war (enables invasion)', () => {
    const unit = makeUnit('u1', 'p0', { q: 3, r: 0 })
    const city = makeCity('c1', 'p1', { q: 0, r: 0 })
    const state = makeState({
      units: [unit], cities: [city], tiles: landTiles(),
      wars: [warBetween('p0', 'p1')],
    })
    expect(validateAction(state, 'p0', move, NOW)).toEqual({ valid: true })
  })

  it('allows moving within your own territory', () => {
    const unit = makeUnit('u1', 'p0', { q: 3, r: 0 })
    const city = makeCity('c1', 'p0', { q: 0, r: 0 })
    const state = makeState({ units: [unit], cities: [city], tiles: landTiles() })
    expect(validateAction(state, 'p0', move, NOW)).toEqual({ valid: true })
  })
})

// ─── fortifyUnit ────────────────────────────────────────────────────────────────

describe('fortifyUnit', () => {
  const fortify: GameAction = { type: 'fortifyUnit', unitId: 'u1' }

  it('fortifies a stationary unit and consumes its turn', () => {
    const state = makeState({ units: [makeUnit('u1', 'p0', { q: 0, r: 0 })] })
    const res = applyAction(state, 'p0', fortify, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    const u = res.state.units.find(x => x.id === 'u1')!
    expect(u.isFortified).toBe(true)
    expect(u.hasMoved).toBe(true)
    expect(u.hasAttacked).toBe(true)
  })

  it('rejects fortifying a unit that already moved this turn', () => {
    const unit = { ...makeUnit('u1', 'p0', { q: 0, r: 0 }), hasMoved: true }
    const state = makeState({ units: [unit] })
    expect(validateAction(state, 'p0', fortify, NOW)).toEqual({ valid: false, reason: 'unit has already moved this turn' })
  })

  it('rejects fortifying a unit that is already fortified', () => {
    const unit = { ...makeUnit('u1', 'p0', { q: 0, r: 0 }), isFortified: true }
    const state = makeState({ units: [unit] })
    expect(validateAction(state, 'p0', fortify, NOW)).toEqual({ valid: false, reason: 'unit already fortified' })
  })

  it('rejects fortifying another player\x27s unit', () => {
    const state = makeState({ units: [makeUnit('u1', 'p1', { q: 0, r: 0 })] })
    expect(validateAction(state, 'p0', fortify, NOW)).toEqual({ valid: false, reason: 'unit is not yours' })
  })

  it('moving a fortified unit clears the fortification', () => {
    const unit = { ...makeUnit('u1', 'p0', { q: 0, r: 0 }), isFortified: true }
    const state = makeState({ units: [unit], tiles: landTiles() })
    const res = applyAction(state, 'p0', { type: 'moveUnit', unitId: 'u1', targetCoord: { q: 1, r: 0 } }, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.units.find(x => x.id === 'u1')!.isFortified).toBe(false)
  })
})
