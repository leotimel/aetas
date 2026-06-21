import { describe, it, expect } from 'vitest'
import {
  haveMadeContact,
  proposeNonAggressionPact,
  respondToNonAggressionPact,
  proposeResourceTrade,
  respondToResourceTrade,
} from './diplomacy.js'
import { DiplomaticProposalStatus, Era, TurnState } from './types.js'
import type {
  GameState,
  Player,
  Unit,
  City,
  GameMap,
  PlayerFogOfWar,
  HexCoord,
  Resources,
  ResourceTradeTerms,
} from './types.js'

// ─── Builders ─────────────────────────────────────────────────────────────────

function makePlayer(id: string, resources: Partial<Resources> = {}): Player {
  return {
    id,
    displayName: id,
    civilizationId: 'rome',
    resources: { gold: 0, food: 0, production: 0, ...resources },
    isEliminated: false,
    isAIControlled: false,
  }
}

function makeUnit(id: string, ownerId: string, position: HexCoord): Unit {
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

function makeCity(id: string, ownerId: string, position: HexCoord): City {
  return {
    id,
    name: id,
    position,
    ownerId,
    population: 1,
    specialization: 'commercial' as City['specialization'],
    level: 1,
    foodStored: 0,
  }
}

function makeFog(playerId: string, exploredHexes: HexCoord[]): PlayerFogOfWar {
  return { playerId, visibleHexes: exploredHexes, exploredHexes }
}

const MAP: GameMap = { tiles: [], radius: 5, seed: 's', startPositions: [] }

function makeState(opts: {
  players?: Player[]
  units?: Unit[]
  cities?: City[]
  fog?: PlayerFogOfWar[]
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
    fogOfWar: opts.fog ?? [],
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

// ─── haveMadeContact ──────────────────────────────────────────────────────────

describe('haveMadeContact', () => {
  it("is false when neither player has any fog-of-war data", () => {
    const state = makeState({ units: [makeUnit('u', 'p1', { q: 1, r: 0 })] })
    expect(haveMadeContact(state, 'p0', 'p1')).toBe(false)
  })

  it('is true when p1 unit is on a hex p0 has explored', () => {
    const state = makeState({
      units: [makeUnit('u', 'p1', { q: 1, r: 0 })],
      fog: [makeFog('p0', [{ q: 1, r: 0 }])],
    })
    expect(haveMadeContact(state, 'p0', 'p1')).toBe(true)
  })

  it('is false when p1 unit is on a hex p0 has NOT explored', () => {
    const state = makeState({
      units: [makeUnit('u', 'p1', { q: 3, r: 0 })],
      fog: [makeFog('p0', [{ q: 1, r: 0 }])],
    })
    expect(haveMadeContact(state, 'p0', 'p1')).toBe(false)
  })

  it('is symmetric — p1 having explored p0 unit hex also counts', () => {
    const state = makeState({
      units: [makeUnit('u', 'p0', { q: 2, r: 0 })],
      fog: [makeFog('p1', [{ q: 2, r: 0 }])],
    })
    expect(haveMadeContact(state, 'p0', 'p1')).toBe(true)
    expect(haveMadeContact(state, 'p1', 'p0')).toBe(true)
  })

  it('detects contact via a city (not just units)', () => {
    const state = makeState({
      cities: [makeCity('c', 'p1', { q: 0, r: 1 })],
      fog: [makeFog('p0', [{ q: 0, r: 1 }])],
    })
    expect(haveMadeContact(state, 'p0', 'p1')).toBe(true)
  })

  it('is false when explored hexes do not overlap with any enemy presence', () => {
    const state = makeState({
      units: [makeUnit('u', 'p1', { q: 5, r: 5 })],
      fog: [makeFog('p0', [{ q: 0, r: 0 }, { q: 1, r: 0 }])],
    })
    expect(haveMadeContact(state, 'p0', 'p1')).toBe(false)
  })
})

// ─── proposeNonAggressionPact ─────────────────────────────────────────────────

describe('proposeNonAggressionPact', () => {
  function contactState(): GameState {
    return makeState({
      units: [makeUnit('u', 'p1', { q: 1, r: 0 })],
      fog: [makeFog('p0', [{ q: 1, r: 0 }])],
    })
  }

  it('succeeds when contact exists and no prior pact or pending proposal', () => {
    const res = proposeNonAggressionPact(contactState(), 'p0', 'p1')
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.diplomaticProposals).toHaveLength(1)
    expect(res.state.diplomaticProposals[0]!.status).toBe(DiplomaticProposalStatus.Pending)
    expect(res.state.diplomaticProposals[0]!.terms).toBeUndefined()
  })

  it('fails when players have not made contact', () => {
    const res = proposeNonAggressionPact(makeState(), 'p0', 'p1')
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.reason).toMatch(/contact/)
  })

  it('fails when a non-aggression pact already exists', () => {
    const state: GameState = {
      ...contactState(),
      nonAggressionPacts: [{ id: 'p1', proposerId: 'p0', acceptorId: 'p1', agreedAtTurn: 1 }],
    }
    const res = proposeNonAggressionPact(state, 'p0', 'p1')
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.reason).toMatch(/already exists/)
  })

  it('fails when a pending NAP proposal already exists', () => {
    const after = proposeNonAggressionPact(contactState(), 'p0', 'p1')
    if (!after.ok) throw new Error(after.reason)
    const res = proposeNonAggressionPact(after.state, 'p0', 'p1')
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.reason).toMatch(/pending/)
  })

  it('fails when the target is eliminated', () => {
    const state = makeState({
      players: [makePlayer('p0'), { ...makePlayer('p1'), isEliminated: true }],
      units: [makeUnit('u', 'p1', { q: 1, r: 0 })],
      fog: [makeFog('p0', [{ q: 1, r: 0 }])],
    })
    const res = proposeNonAggressionPact(state, 'p0', 'p1')
    expect(res.ok).toBe(false)
  })

  it('does not mutate a frozen input', () => {
    const state = deepFreeze(contactState())
    expect(() => proposeNonAggressionPact(state, 'p0', 'p1')).not.toThrow()
    expect(state.diplomaticProposals).toHaveLength(0)
  })
})

// ─── respondToNonAggressionPact ───────────────────────────────────────────────

describe('respondToNonAggressionPact', () => {
  function stateWithPendingNap(): { state: GameState; proposalId: string } {
    const contact = makeState({
      units: [makeUnit('u', 'p1', { q: 1, r: 0 })],
      fog: [makeFog('p0', [{ q: 1, r: 0 }])],
    })
    const res = proposeNonAggressionPact(contact, 'p0', 'p1')
    if (!res.ok) throw new Error(res.reason)
    return { state: res.state, proposalId: res.state.diplomaticProposals[0]!.id }
  }

  it('accept creates a NonAggressionPact and marks proposal Accepted', () => {
    const { state, proposalId } = stateWithPendingNap()
    const res = respondToNonAggressionPact(state, 'p1', proposalId, true)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.nonAggressionPacts).toHaveLength(1)
    expect(res.state.nonAggressionPacts[0]!.proposerId).toBe('p0')
    expect(res.state.nonAggressionPacts[0]!.acceptorId).toBe('p1')
    expect(res.state.diplomaticProposals[0]!.status).toBe(DiplomaticProposalStatus.Accepted)
  })

  it('reject marks proposal Rejected and creates no pact', () => {
    const { state, proposalId } = stateWithPendingNap()
    const res = respondToNonAggressionPact(state, 'p1', proposalId, false)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.nonAggressionPacts).toHaveLength(0)
    expect(res.state.diplomaticProposals[0]!.status).toBe(DiplomaticProposalStatus.Rejected)
  })

  it('fails when the wrong player tries to respond', () => {
    const { state, proposalId } = stateWithPendingNap()
    const res = respondToNonAggressionPact(state, 'p0', proposalId, true) // proposer tries to accept own
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.reason).toMatch(/target/)
  })

  it('fails when proposal is not found', () => {
    const { state } = stateWithPendingNap()
    const res = respondToNonAggressionPact(state, 'p1', 'nope', true)
    expect(res.ok).toBe(false)
  })

  it('fails when proposal is already resolved', () => {
    const { state, proposalId } = stateWithPendingNap()
    const after = respondToNonAggressionPact(state, 'p1', proposalId, true)
    if (!after.ok) throw new Error(after.reason)
    const stale = respondToNonAggressionPact(after.state, 'p1', proposalId, true)
    expect(stale.ok).toBe(false)
    if (stale.ok) throw new Error('expected failure')
    expect(stale.reason).toMatch(/already resolved/)
  })
})

// ─── proposeResourceTrade ─────────────────────────────────────────────────────

describe('proposeResourceTrade', () => {
  const TERMS: ResourceTradeTerms = { offer: { gold: 5, food: 0, production: 0 }, request: { gold: 0, food: 3, production: 0 } }

  function richContactState(): GameState {
    return makeState({
      players: [makePlayer('p0', { gold: 10 }), makePlayer('p1', { food: 10 })],
      units: [makeUnit('u', 'p1', { q: 1, r: 0 })],
      fog: [makeFog('p0', [{ q: 1, r: 0 }])],
    })
  }

  it('succeeds with contact and sufficient resources', () => {
    const res = proposeResourceTrade(richContactState(), 'p0', 'p1', TERMS)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.diplomaticProposals).toHaveLength(1)
    expect(res.state.diplomaticProposals[0]!.terms).toEqual(TERMS)
  })

  it('fails without contact', () => {
    const state = makeState({
      players: [makePlayer('p0', { gold: 10 }), makePlayer('p1')],
    })
    const res = proposeResourceTrade(state, 'p0', 'p1', TERMS)
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.reason).toMatch(/contact/)
  })

  it('fails when proposer lacks the offered resources', () => {
    const state = makeState({
      players: [makePlayer('p0', { gold: 2 }), makePlayer('p1')], // only 2 gold, offer is 5
      units: [makeUnit('u', 'p1', { q: 1, r: 0 })],
      fog: [makeFog('p0', [{ q: 1, r: 0 }])],
    })
    const res = proposeResourceTrade(state, 'p0', 'p1', TERMS)
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.reason).toMatch(/lacks resources/)
  })

  it('fails for a trivial trade (all zeros)', () => {
    const zeroTerms: ResourceTradeTerms = {
      offer: { gold: 0, food: 0, production: 0 },
      request: { gold: 0, food: 0, production: 0 },
    }
    const res = proposeResourceTrade(richContactState(), 'p0', 'p1', zeroTerms)
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.reason).toMatch(/at least one resource/)
  })
})

// ─── respondToResourceTrade ───────────────────────────────────────────────────

describe('respondToResourceTrade', () => {
  function stateWithPendingTrade(): { state: GameState; proposalId: string } {
    const terms: ResourceTradeTerms = {
      offer: { gold: 5, food: 0, production: 0 },
      request: { gold: 0, food: 3, production: 0 },
    }
    const base = makeState({
      players: [makePlayer('p0', { gold: 10 }), makePlayer('p1', { food: 10 })],
      units: [makeUnit('u', 'p1', { q: 1, r: 0 })],
      fog: [makeFog('p0', [{ q: 1, r: 0 }])],
    })
    const res = proposeResourceTrade(base, 'p0', 'p1', terms)
    if (!res.ok) throw new Error(res.reason)
    return { state: res.state, proposalId: res.state.diplomaticProposals[0]!.id }
  }

  it('accept transfers resources correctly and marks proposal Accepted', () => {
    const { state, proposalId } = stateWithPendingTrade()
    const res = respondToResourceTrade(state, 'p1', proposalId, true)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)

    const p0 = res.state.players.find(p => p.id === 'p0')!
    const p1 = res.state.players.find(p => p.id === 'p1')!
    expect(p0.resources).toEqual({ gold: 5, food: 3, production: 0 }) // gave 5g, got 3f
    expect(p1.resources).toEqual({ gold: 5, food: 7, production: 0 }) // got 5g, gave 3f
    expect(res.state.diplomaticProposals[0]!.status).toBe(DiplomaticProposalStatus.Accepted)
  })

  it('reject leaves resources unchanged and marks proposal Rejected', () => {
    const { state, proposalId } = stateWithPendingTrade()
    const res = respondToResourceTrade(state, 'p1', proposalId, false)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)

    const p0 = res.state.players.find(p => p.id === 'p0')!
    expect(p0.resources.gold).toBe(10) // unchanged
    expect(res.state.diplomaticProposals[0]!.status).toBe(DiplomaticProposalStatus.Rejected)
  })

  it('fails when the target lacks the requested resources at accept time', () => {
    const { state, proposalId } = stateWithPendingTrade()
    // Drain p1's food before accepting
    const drainedState: GameState = {
      ...state,
      players: state.players.map(p => p.id === 'p1' ? { ...p, resources: { ...p.resources, food: 0 } } : p),
    }
    const res = respondToResourceTrade(drainedState, 'p1', proposalId, true)
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.reason).toMatch(/target lacks/)
  })

  it('fails when the proposer no longer has the offered resources at accept time', () => {
    const { state, proposalId } = stateWithPendingTrade()
    const drainedState: GameState = {
      ...state,
      players: state.players.map(p => p.id === 'p0' ? { ...p, resources: { ...p.resources, gold: 0 } } : p),
    }
    const res = respondToResourceTrade(drainedState, 'p1', proposalId, true)
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected failure')
    expect(res.reason).toMatch(/no longer/)
  })

  it('fails when the wrong player tries to respond', () => {
    const { state, proposalId } = stateWithPendingTrade()
    const res = respondToResourceTrade(state, 'p0', proposalId, true)
    expect(res.ok).toBe(false)
  })

  it('fails on a stale (already resolved) proposal', () => {
    const { state, proposalId } = stateWithPendingTrade()
    const first = respondToResourceTrade(state, 'p1', proposalId, true)
    if (!first.ok) throw new Error(first.reason)
    const stale = respondToResourceTrade(first.state, 'p1', proposalId, true)
    expect(stale.ok).toBe(false)
    if (stale.ok) throw new Error('expected failure')
    expect(stale.reason).toMatch(/already resolved/)
  })

  it('does not mutate a frozen input', () => {
    const { state, proposalId } = stateWithPendingTrade()
    const frozen = deepFreeze(state)
    expect(() => respondToResourceTrade(frozen, 'p1', proposalId, true)).not.toThrow()
    // p0 resources unchanged in original
    expect(frozen.players.find(p => p.id === 'p0')!.resources.gold).toBe(10)
  })
})
