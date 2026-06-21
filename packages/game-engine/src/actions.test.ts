import { describe, it, expect } from 'vitest'
import { validateAction, applyAction, type GameAction } from './actions.js'
import { createCombatDispute } from './combat.js'
import {
  TurnState,
  CombatDisputeStatus,
  Era,
} from './types.js'
import type {
  Unit,
  UnitStats,
  GameState,
  GameMap,
  HexCoord,
  Player,
  CombatDispute,
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

function makeState(opts: {
  units?: Unit[]
  disputes?: CombatDispute[]
  players?: Player[]
  currentPlayerId?: string
  turnState?: TurnState
  isFinished?: boolean
} = {}): GameState {
  return {
    gameId: 'g1',
    players: opts.players ?? [makePlayer('p0'), makePlayer('p1')],
    map: MAP,
    units: opts.units ?? [],
    cities: [],
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
