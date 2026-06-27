import { describe, it, expect, vi } from 'vitest'
import {
  getCurrentPlayer,
  getPlayerById,
  activePlayers,
  nextActivePlayerId,
  canSubmitAction,
  endTurn,
  type TurnHooks,
} from './turn.js'
import {
  TurnState,
  CitySpecialization,
  CombatDisputeStatus,
  Era,
} from './types.js'
import type { GameState, Player, City, CombatDispute, GameMap } from './types.js'

// ─── Builders ─────────────────────────────────────────────────────────────────

function makePlayer(id: string): Player {
  return {
    id,
    displayName: id.toUpperCase(),
    civilizationId: 'rome',
    resources: { gold: 0, food: 0, production: 0 },
    isEliminated: false,
    isAIControlled: false,
  }
}

function makeCity(id: string, ownerId: string): City {
  return {
    id,
    name: `city-${id}`,
    position: { q: 0, r: 0 },
    ownerId,
    population: 1,
    specialization: CitySpecialization.Commercial, // pop1 → gold 2, food 2, prod 1
    level: 1,
    foodStored: 0,
  }
}

function makeUnit(id: string, ownerId: string): import('./types.js').Unit {
  return {
    id,
    unitType: 'warrior',
    position: { q: 0, r: 0 },
    stats: { attack: 10, defense: 5, hp: 10, maxHp: 10, movement: 2 },
    ownerId,
    hasMoved: false,
    hasAttacked: false,
  }
}

function makeDispute(
  id: string,
  expiresAt: number,
  attackerPlayerId = 'p0',
  defenderPlayerId = 'p1',
): CombatDispute {
  return {
    id,
    attackerUnitId: `u-${id}-a`,
    defenderUnitId: `u-${id}-d`,
    attackerPlayerId,
    defenderPlayerId,
    createdAt: 0,
    expiresAt,
    status: CombatDisputeStatus.Pending,
  }
}

const EMPTY_MAP: GameMap = { tiles: [], radius: 5, seed: 's', startPositions: [] }

interface StateOpts {
  playerCount?: number
  maxTurns?: number
  turnNumber?: number
  currentPlayerId?: string
  withCities?: boolean
  disputes?: CombatDispute[]
}

function makeState(opts: StateOpts = {}): GameState {
  const {
    playerCount = 4,
    maxTurns = 10,
    turnNumber = 1,
    withCities = true,
    disputes = [],
  } = opts
  const players = Array.from({ length: playerCount }, (_, i) => makePlayer(`p${i}`))
  const cities = withCities ? players.map(p => makeCity(`c-${p.id}`, p.id)) : []
  return {
    gameId: 'g1',
    players,
    map: EMPTY_MAP,
    units: [],
    cities,
    turnNumber,
    currentPlayerId: opts.currentPlayerId ?? 'p0',
    turnState: TurnState.WaitingForAction,
    era: Era.Ancient,
    maxTurns,
    combatDisputes: disputes,
    nonAggressionPacts: [],
    diplomaticProposals: [],
    fogOfWar: [],
    winner: null,
    isFinished: false,
  }
}

/** Hook that eliminates the given player ids when any dispute times out. */
function eliminateHook(...targetIds: string[]): TurnHooks {
  return {
    resolveTimedOutDispute: (_dispute, state) => ({
      ...state,
      players: state.players.map(p =>
        targetIds.includes(p.id) ? { ...p, isEliminated: true } : p,
      ),
    }),
  }
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const value of Object.values(obj)) deepFreeze(value)
    Object.freeze(obj)
  }
  return obj
}

function expectOk(result: ReturnType<typeof endTurn>): GameState {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.reason)
  return result.state
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('endTurn — happy path', () => {
  it('1: advances to next player; only the actor’s cities/resources change', () => {
    const state = makeState({ playerCount: 4 })
    const next = expectOk(endTurn(state, 'p0', 0))
    expect(next.currentPlayerId).toBe('p1')
    expect(next.turnNumber).toBe(1)
    // p0 earned commercial gold (2) and food (2)
    expect(getPlayerById(next, 'p0')!.resources.gold).toBe(2)
    // p1 untouched
    expect(getPlayerById(next, 'p1')!.resources.gold).toBe(0)
    const p1City = next.cities.find(c => c.ownerId === 'p1')!
    expect(p1City.foodStored).toBe(0)
  })

  it('2: last player of the round wraps and increments turnNumber', () => {
    const state = makeState({ playerCount: 4, currentPlayerId: 'p3', turnNumber: 1, maxTurns: 10 })
    const next = expectOk(endTurn(state, 'p3', 0))
    expect(next.currentPlayerId).toBe('p0')
    expect(next.turnNumber).toBe(2)
  })
})

// ─── Unit maintenance (gold sink) ─────────────────────────────────────────────

describe('endTurn — unit maintenance', () => {
  it('deducts 1 gold per living unit owned by the actor', () => {
    const base = makeState({ playerCount: 2, withCities: false })
    const state: GameState = {
      ...base,
      players: base.players.map(p =>
        p.id === 'p0' ? { ...p, resources: { gold: 10, food: 0, production: 0 } } : p,
      ),
      units: [makeUnit('u1', 'p0'), makeUnit('u2', 'p0')],
    }
    const next = expectOk(endTurn(state, 'p0', 0))
    // No city income; 2 units → 10 - 2 = 8.
    expect(getPlayerById(next, 'p0')!.resources.gold).toBe(8)
    // Funded → no maintenance flag.
    expect(next.units.every(u => !u.isUnderMaintenance)).toBe(true)
  })

  it('flags the actor’s units as under maintenance when gold cannot cover it, then clears next turn', () => {
    const base = makeState({ playerCount: 2, withCities: false })
    const state: GameState = {
      ...base,
      players: base.players.map(p =>
        p.id === 'p0' ? { ...p, resources: { gold: 1, food: 0, production: 0 } } : p,
      ),
      units: [makeUnit('u1', 'p0'), makeUnit('u2', 'p0')],
    }
    const afterP0 = expectOk(endTurn(state, 'p0', 0))
    expect(getPlayerById(afterP0, 'p0')!.resources.gold).toBe(0) // floored, no debt
    expect(afterP0.units.every(u => u.ownerId !== 'p0' || u.isUnderMaintenance)).toBe(true)

    // p1 ends their turn → it becomes p0's turn again → p0's flag clears.
    const afterP1 = expectOk(endTurn(afterP0, 'p1', 0))
    expect(afterP1.currentPlayerId).toBe('p0')
    expect(afterP1.units.every(u => !u.isUnderMaintenance)).toBe(true)
  })
})

// ─── Round / maxTurns boundary ────────────────────────────────────────────────

describe('endTurn — maxTurns boundary', () => {
  it('3: maxTurns=1, last actor ends → finished, turnNumber stays 1', () => {
    const state = makeState({ playerCount: 4, currentPlayerId: 'p3', turnNumber: 1, maxTurns: 1 })
    const hooks: TurnHooks = { determineWinner: () => 'p2' }
    const next = expectOk(endTurn(state, 'p3', 0, hooks))
    expect(next.isFinished).toBe(true)
    expect(next.turnState).toBe(TurnState.Completed)
    expect(next.turnNumber).toBe(1)
    expect(next.winner).toBe('p2')
  })

  it('4: maxTurns=N gives every player exactly N turns; final turnNumber===N', () => {
    const N = 3
    const playerCount = 3
    let state = makeState({ playerCount, maxTurns: N })
    const counts: Record<string, number> = { p0: 0, p1: 0, p2: 0 }
    let guard = 0
    while (!state.isFinished && guard++ < 100) {
      const actor = state.currentPlayerId
      counts[actor]!++
      state = expectOk(endTurn(state, actor, 0))
    }
    expect(state.isFinished).toBe(true)
    expect(state.turnNumber).toBe(N)
    expect(counts).toEqual({ p0: N, p1: N, p2: N })
  })

  it('5: determineWinner returns null at maxTurns with >1 survivor → draw', () => {
    const state = makeState({ playerCount: 4, currentPlayerId: 'p3', turnNumber: 1, maxTurns: 1 })
    const next = expectOk(endTurn(state, 'p3', 0, { determineWinner: () => null }))
    expect(next.isFinished).toBe(true)
    expect(next.winner).toBeNull()
  })
})

// ─── Elimination ordering ─────────────────────────────────────────────────────

describe('endTurn — elimination ordering', () => {
  it('6: actor self-eliminates via own timed-out dispute; round still advances', () => {
    const disputes = [makeDispute('d1', 100)]
    const state = makeState({ playerCount: 4, currentPlayerId: 'p0', disputes })
    const next = expectOk(endTurn(state, 'p0', 200, eliminateHook('p0')))
    expect(getPlayerById(next, 'p0')!.isEliminated).toBe(true)
    expect(next.currentPlayerId).toBe('p1') // skips eliminated actor
    expect(next.turnNumber).toBe(1)
    expect(next.isFinished).toBe(false)
  })

  it('7: last-in-array eliminated during a NON-last actor’s turn → no false wrap (Bug A)', () => {
    // Actor p2 becomes the post-elimination last active; wrap must use start snapshot.
    const disputes = [makeDispute('d1', 100)]
    const state = makeState({ playerCount: 4, currentPlayerId: 'p2', turnNumber: 1, disputes })
    const next = expectOk(endTurn(state, 'p2', 200, eliminateHook('p3')))
    expect(next.turnNumber).toBe(1) // NOT incremented
    expect(next.currentPlayerId).toBe('p0')
  })

  it('8: genuine last actor ends AND self-eliminates → wrap still counts', () => {
    const disputes = [makeDispute('d1', 100)]
    const state = makeState({ playerCount: 4, currentPlayerId: 'p3', turnNumber: 1, maxTurns: 10, disputes })
    const next = expectOk(endTurn(state, 'p3', 200, eliminateHook('p3')))
    expect(getPlayerById(next, 'p3')!.isEliminated).toBe(true)
    expect(next.turnNumber).toBe(2) // round completed via start-of-turn snapshot
    expect(next.currentPlayerId).toBe('p0')
    expect(next.isFinished).toBe(false)
  })
})

// ─── Last player standing ─────────────────────────────────────────────────────

describe('endTurn — last player standing', () => {
  it('9: dropping to 1 active → finished immediately, determineWinner NOT consulted', () => {
    const determineWinner = vi.fn(() => 'someoneElse')
    const disputes = [makeDispute('d1', 100)]
    const state = makeState({ playerCount: 2, currentPlayerId: 'p0', disputes })
    const next = expectOk(endTurn(state, 'p0', 200, {
      ...eliminateHook('p1'),
      determineWinner,
    }))
    expect(next.isFinished).toBe(true)
    expect(next.winner).toBe('p0')
    expect(determineWinner).not.toHaveBeenCalled()
  })

  it('10: 5(a) wins over 5(b) when both trigger on the same turn', () => {
    const determineWinner = vi.fn(() => 'p0')
    const disputes = [makeDispute('d1', 100)]
    // p1 is last active at start AND maxTurns reached; resolution eliminates p0.
    const state = makeState({ playerCount: 2, currentPlayerId: 'p1', turnNumber: 1, maxTurns: 1, disputes })
    const next = expectOk(endTurn(state, 'p1', 200, {
      ...eliminateHook('p0'),
      determineWinner,
    }))
    expect(next.winner).toBe('p1') // survivor, not determineWinner’s pick
    expect(determineWinner).not.toHaveBeenCalled()
  })

  it('11: mutual annihilation (0 active) → finished, winner null', () => {
    const disputes = [makeDispute('d1', 100)]
    const state = makeState({ playerCount: 2, currentPlayerId: 'p0', disputes })
    const next = expectOk(endTurn(state, 'p0', 200, eliminateHook('p0', 'p1')))
    expect(next.isFinished).toBe(true)
    expect(next.winner).toBeNull()
  })

  it('12: 2-player roster, non-actor eliminated → last standing regardless of maxTurns', () => {
    const disputes = [makeDispute('d1', 100)]
    const state = makeState({ playerCount: 2, currentPlayerId: 'p1', turnNumber: 1, maxTurns: 99, disputes })
    const next = expectOk(endTurn(state, 'p1', 200, eliminateHook('p0')))
    expect(next.isFinished).toBe(true)
    expect(next.winner).toBe('p1')
  })

  it('13: 2 players alternate across N rounds, each plays N times', () => {
    const N = 3
    let state = makeState({ playerCount: 2, maxTurns: N })
    const counts: Record<string, number> = { p0: 0, p1: 0 }
    let guard = 0
    while (!state.isFinished && guard++ < 100) {
      const actor = state.currentPlayerId
      counts[actor]!++
      state = expectOk(endTurn(state, actor, 0))
    }
    expect(state.turnNumber).toBe(N)
    expect(counts).toEqual({ p0: N, p1: N })
  })
})

// ─── Double-submit / concurrency ──────────────────────────────────────────────

describe('endTurn — double-submit & validation', () => {
  it('14: a duplicate end-turn from the same player is rejected (no double economy)', () => {
    const state = makeState({ playerCount: 4 })
    const after1 = expectOk(endTurn(state, 'p0', 0))
    const dup = endTurn(after1, 'p0', 0)
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.reason).toBe('not your turn')
    expect(dup.state).toBe(after1) // original untouched
    expect(getPlayerById(after1, 'p0')!.resources.gold).toBe(2) // applied once
  })

  it('15: submit from a non-current player is rejected with original state', () => {
    const state = makeState({ playerCount: 4 })
    const res = endTurn(state, 'p2', 0)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('not your turn')
    expect(res.state).toBe(state)
  })

  it('16: rejects when turnState is not WaitingForAction; never emits Processing', () => {
    const state = { ...makeState({ playerCount: 4 }), turnState: TurnState.Processing }
    const res = endTurn(state, 'p0', 0)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('turn not awaiting action')

    // A normal advance never yields Processing.
    const ok = expectOk(endTurn(makeState({ playerCount: 4 }), 'p0', 0))
    expect(ok.turnState).not.toBe(TurnState.Processing)
  })

  it('rejects when the game is already finished', () => {
    const state = { ...makeState({ playerCount: 4 }), isFinished: true }
    const res = endTurn(state, 'p0', 0)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('game finished')
  })
})

// ─── Disputes / hooks / time ──────────────────────────────────────────────────

describe('endTurn — dispute timeouts', () => {
  it('17: resolves when now === expiresAt, not when now === expiresAt - 1', () => {
    const atDeadline = expectOk(
      endTurn(makeState({ disputes: [makeDispute('d1', 1000)] }), 'p0', 1000),
    )
    expect(atDeadline.combatDisputes[0]!.status).toBe(CombatDisputeStatus.ResolvedByTimeout)

    const before = expectOk(
      endTurn(makeState({ disputes: [makeDispute('d1', 1000)] }), 'p0', 999),
    )
    expect(before.combatDisputes[0]!.status).toBe(CombatDisputeStatus.Pending)
  })

  it('18: expired dispute with NO hook flips status only; no eliminations', () => {
    const state = makeState({ playerCount: 4, disputes: [makeDispute('d1', 100)] })
    const next = expectOk(endTurn(state, 'p0', 200))
    expect(next.combatDisputes[0]!.status).toBe(CombatDisputeStatus.ResolvedByTimeout)
    expect(activePlayers(next.players)).toHaveLength(4)
  })

  it('19: multiple disputes expiring the same turn are all resolved', () => {
    const disputes = [makeDispute('d2', 100), makeDispute('d1', 100), makeDispute('d3', 5000)]
    const state = makeState({ playerCount: 4, disputes })
    const next = expectOk(endTurn(state, 'p0', 200))
    const byId = Object.fromEntries(next.combatDisputes.map(d => [d.id, d.status]))
    expect(byId['d1']).toBe(CombatDisputeStatus.ResolvedByTimeout)
    expect(byId['d2']).toBe(CombatDisputeStatus.ResolvedByTimeout)
    expect(byId['d3']).toBe(CombatDisputeStatus.Pending) // not yet expired
  })
})

// ─── Purity / invariants ──────────────────────────────────────────────────────

describe('endTurn — purity & invariants', () => {
  it('20: does not mutate a deep-frozen input on any path', () => {
    const state = deepFreeze(makeState({ playerCount: 4, disputes: [makeDispute('d1', 100)] }))
    expect(() => endTurn(state, 'p0', 200, eliminateHook('p1'))).not.toThrow()
    expect(state.players[0]!.resources.gold).toBe(0) // unchanged
    expect(state.combatDisputes[0]!.status).toBe(CombatDisputeStatus.Pending)
    expect(state.currentPlayerId).toBe('p0')
  })

  it('21: a non-finished result never points currentPlayerId at an eliminated player', () => {
    const disputes = [makeDispute('d1', 100)]
    const next = expectOk(
      endTurn(makeState({ playerCount: 4, currentPlayerId: 'p0', disputes }), 'p0', 200, eliminateHook('p0')),
    )
    expect(next.isFinished).toBe(false)
    expect(getPlayerById(next, next.currentPlayerId)!.isEliminated).toBe(false)
  })

  it('22: turnNumber stays within [1, maxTurns] throughout a full game', () => {
    const N = 4
    let state = makeState({ playerCount: 3, maxTurns: N })
    let guard = 0
    while (!state.isFinished && guard++ < 100) {
      state = expectOk(endTurn(state, state.currentPlayerId, 0))
      expect(state.turnNumber).toBeGreaterThanOrEqual(1)
      expect(state.turnNumber).toBeLessThanOrEqual(N)
    }
  })
})

// ─── Helper units ─────────────────────────────────────────────────────────────

describe('nextActivePlayerId', () => {
  it('23: anchors on index — works when fromId itself is eliminated', () => {
    const players = [makePlayer('p0'), makePlayer('p1'), makePlayer('p2')]
    players[0]!.isEliminated = true
    expect(nextActivePlayerId(players, 'p0')).toBe('p1')

    const players2 = [makePlayer('p0'), makePlayer('p1'), makePlayer('p2')]
    players2[2]!.isEliminated = true
    expect(nextActivePlayerId(players2, 'p2')).toBe('p0') // wraps past eliminated last
  })

  it('returns the sole active player when it is the only one left', () => {
    const players = [makePlayer('p0'), makePlayer('p1')]
    players[1]!.isEliminated = true
    expect(nextActivePlayerId(players, 'p0')).toBe('p0')
  })

  it('returns null when no players are active', () => {
    const players = [makePlayer('p0')]
    players[0]!.isEliminated = true
    expect(nextActivePlayerId(players, 'p0')).toBeNull()
  })
})

describe('getCurrentPlayer / canSubmitAction', () => {
  it('24: getCurrentPlayer returns undefined for a missing id', () => {
    const state = { ...makeState({ playerCount: 2 }), currentPlayerId: 'ghost' }
    expect(getCurrentPlayer(state)).toBeUndefined()
  })

  it('canSubmitAction rejects an eliminated player', () => {
    const state = makeState({ playerCount: 2 })
    state.players[0]!.isEliminated = true
    expect(canSubmitAction(state, 'p0')).toEqual({ valid: false, reason: 'player eliminated' })
  })

  it('canSubmitAction accepts the current player on a fresh turn', () => {
    expect(canSubmitAction(makeState({ playerCount: 2 }), 'p0')).toEqual({ valid: true })
  })
})
