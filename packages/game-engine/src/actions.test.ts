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
} = {}): GameState {
  return {
    gameId: 'g1',
    players: opts.players ?? [makePlayer('p0'), makePlayer('p1')],
    map: MAP,
    units: opts.units ?? [],
    cities: opts.cities ?? [],
    turnNumber: 1,
    currentPlayerId: opts.currentPlayerId ?? 'p0',
    turnState: opts.turnState ?? TurnState.WaitingForAction,
    era: Era.Ancient,
    maxTurns: 10,
    combatDisputes: opts.disputes ?? [],
    nonAggressionPacts: [],
    diplomaticProposals: [],
    fogOfWar: [],
    winner: null,
    isFinished: opts.isFinished ?? false,
  }
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
  return { ...makePlayer(id), civilizationId: 'romans', resources: { gold: 0, food: 0, production } }
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

// ─── constructBuilding ────────────────────────────────────────────────────────

function playerWithProd(id: string, production: number): Player {
  return { ...makePlayer(id), resources: { gold: 0, food: 0, production } }
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
