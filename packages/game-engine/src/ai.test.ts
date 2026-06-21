import { describe, it, expect } from 'vitest'
import { decideSubstituteTurn, decideOpponentTurn, isFavorableAttack } from './ai.js'
import { validateAction, applyAction, type GameAction } from './actions.js'
import { createCombatDispute } from './combat.js'
import { TurnState, Era } from './types.js'
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

function makePlayer(id: string, isEliminated = false): Player {
  return {
    id,
    displayName: id,
    civilizationId: 'rome',
    resources: { gold: 0, food: 0, production: 0 },
    isEliminated,
    isAIControlled: true,
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

const NOW = 5000

/** Replays a sequence and asserts every step applies legally. Returns final state. */
function replayLegal(state: GameState, playerId: string, actions: GameAction[]): GameState {
  let s = state
  for (const a of actions) {
    const res = applyAction(s, playerId, a, NOW)
    expect(res.ok, `action ${JSON.stringify(a)} should apply`).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    s = res.state
  }
  return s
}

function assertEndsWithSingleEndTurn(actions: GameAction[]): void {
  const endTurns = actions.filter(a => a.type === 'endTurn')
  expect(endTurns).toHaveLength(1)
  expect(actions[actions.length - 1]!.type).toBe('endTurn')
}

// ─── Headline invariant: AI never produces an illegal action ──────────────────

describe('AI legality invariant — every produced action is legal', () => {
  // Each entry: a state where it is p0's turn, with varied combat situations.
  function richState(): GameState {
    const attacker = makeUnit('p0-soldier', 'p0', { q: 0, r: 0 }, { attack: 20 })
    const weakEnemy = makeUnit('p1-weak', 'p1', { q: 1, r: 0 }, { defense: 1, hp: 5 })
    const myDefender = makeUnit('p0-guard', 'p0', { q: 5, r: 0 }, { attack: 3, defense: 2, hp: 10 })
    const enemyRaider = makeUnit('p1-raider', 'p1', { q: 6, r: 0 }, { attack: 4 })
    const dispute = createCombatDispute(enemyRaider, myDefender, 0) // p0 is defender
    return makeState({
      units: [attacker, weakEnemy, myDefender, enemyRaider],
      disputes: [dispute],
    })
  }

  const cases: GameState[] = [
    makeState(), // empty
    makeState({ units: [makeUnit('p0-a', 'p0', { q: 0, r: 0 })] }), // lone unit, no enemies
    richState(),
  ]

  for (const [i, state] of cases.entries()) {
    it(`substitute plan #${i} replays fully legally and ends in one endTurn`, () => {
      const actions = decideSubstituteTurn(state, 'p0', NOW)
      assertEndsWithSingleEndTurn(actions)
      replayLegal(state, 'p0', actions)
    })

    it(`opponent plan #${i} replays fully legally and ends in one endTurn`, () => {
      const actions = decideOpponentTurn(state, 'p0', NOW)
      assertEndsWithSingleEndTurn(actions)
      replayLegal(state, 'p0', actions)
    })
  }
})

// ─── Why the fold matters ─────────────────────────────────────────────────────

describe('state-folding is necessary', () => {
  it('opponent attacks an enemy only once even when two favorable targets are adjacent', () => {
    const u = makeUnit('p0-u', 'p0', { q: 0, r: 0 }, { attack: 20 })
    const e1 = makeUnit('p1-e1', 'p1', { q: 1, r: 0 }, { defense: 0, hp: 4 })
    const e2 = makeUnit('p1-e2', 'p1', { q: -1, r: 0 }, { defense: 0, hp: 4 })
    const state = makeState({ units: [u, e1, e2] })

    const actions = decideOpponentTurn(state, 'p0', NOW)
    const attacks = actions.filter(a => a.type === 'initiateCombat')
    expect(attacks).toHaveLength(1) // hasAttacked gate after the first

    // Against the INITIAL state both attacks would validate — proving the fold is needed.
    const second: GameAction = { type: 'initiateCombat', attackerUnitId: 'p0-u', defenderUnitId: 'p1-e2' }
    expect(validateAction(state, 'p0', second, NOW).valid).toBe(true)
  })

  it('opponent does not attack an enemy that a defensive response just killed', () => {
    // p0 guard kills the raider when defending, then must not target it.
    const guard = makeUnit('p0-guard', 'p0', { q: 0, r: 0 }, { attack: 20, defense: 2, hp: 10 })
    const raider = makeUnit('p1-raider', 'p1', { q: 1, r: 0 }, { attack: 3, defense: 0, hp: 5 })
    const dispute = createCombatDispute(raider, guard, 0) // p0 (guard) is defender
    const state = makeState({ units: [guard, raider], disputes: [dispute] })

    const actions = decideOpponentTurn(state, 'p0', NOW)
    const attacksOnRaider = actions.filter(
      a => a.type === 'initiateCombat' && a.defenderUnitId === 'p1-raider',
    )
    expect(attacksOnRaider).toHaveLength(0)
    replayLegal(state, 'p0', actions) // and it all still applies legally
  })
})

// ─── Substitute behaviour ─────────────────────────────────────────────────────

describe('decideSubstituteTurn — conservative', () => {
  it('never initiates combat, even next to a weak enemy', () => {
    const u = makeUnit('p0-u', 'p0', { q: 0, r: 0 }, { attack: 50 })
    const weak = makeUnit('p1-w', 'p1', { q: 1, r: 0 }, { defense: 0, hp: 1 })
    const actions = decideSubstituteTurn(makeState({ units: [u, weak] }), 'p0', NOW)
    expect(actions.some(a => a.type === 'initiateCombat')).toBe(false)
    expect(actions).toEqual([{ type: 'endTurn' }])
  })

  it('responds to every dispute where it is the defender, but not where it is the attacker', () => {
    const mine1 = makeUnit('p0-d1', 'p0', { q: 0, r: 0 })
    const mine2 = makeUnit('p0-d2', 'p0', { q: 2, r: 0 })
    const myAttacker = makeUnit('p0-atk', 'p0', { q: 4, r: 0 })
    const e1 = makeUnit('p1-a1', 'p1', { q: 1, r: 0 })
    const e2 = makeUnit('p1-a2', 'p1', { q: 3, r: 0 })
    const eDef = makeUnit('p1-def', 'p1', { q: 5, r: 0 })
    const dDefend1 = createCombatDispute(e1, mine1, 0) // p0 defender
    const dDefend2 = createCombatDispute(e2, mine2, 0) // p0 defender
    const dAttack = createCombatDispute(myAttacker, eDef, 0) // p0 ATTACKER
    const state = makeState({
      units: [mine1, mine2, myAttacker, e1, e2, eDef],
      disputes: [dDefend1, dDefend2, dAttack],
    })

    const actions = decideSubstituteTurn(state, 'p0', NOW)
    const responses = actions.filter(a => a.type === 'respondToDispute')
    expect(responses).toHaveLength(2) // only the two where p0 defends
    const respondedIds = responses.map(a => (a as { disputeId: string }).disputeId)
    expect(respondedIds).not.toContain(dAttack.id)
  })

  it('returns just [endTurn] for a player with no units and no disputes', () => {
    expect(decideSubstituteTurn(makeState(), 'p0', NOW)).toEqual([{ type: 'endTurn' }])
  })
})

// ─── Opponent behaviour ───────────────────────────────────────────────────────

describe('decideOpponentTurn — active but not suicidal', () => {
  it('attacks an adjacent enemy when favorable under active defense', () => {
    const u = makeUnit('p0-u', 'p0', { q: 0, r: 0 }, { attack: 20 })
    const enemy = makeUnit('p1-e', 'p1', { q: 1, r: 0 }, { defense: 2, hp: 6 })
    const actions = decideOpponentTurn(makeState({ units: [u, enemy] }), 'p0', NOW)
    expect(actions.filter(a => a.type === 'initiateCombat')).toHaveLength(1)
  })

  it('does NOT attack when favorable-without-bonus but unfavorable-with-active-defense', () => {
    // attack 8 vs defense 2, hp 6: without bonus 8-2=6 kills; with +2 → 8-4=4, survives.
    const u = makeUnit('p0-u', 'p0', { q: 0, r: 0 }, { attack: 8 })
    const enemy = makeUnit('p1-e', 'p1', { q: 1, r: 0 }, { defense: 2, hp: 6 })
    const state = makeState({ units: [u, enemy] })
    expect(isFavorableAttack(state, u, enemy)).toBe(false)
    const actions = decideOpponentTurn(state, 'p0', NOW)
    expect(actions.some(a => a.type === 'initiateCombat')).toBe(false)
  })

  it('does not make an even/suicidal attack (defender survives the strike)', () => {
    const u = makeUnit('p0-u', 'p0', { q: 0, r: 0 }, { attack: 5 })
    const enemy = makeUnit('p1-e', 'p1', { q: 1, r: 0 }, { defense: 2, hp: 20 })
    const actions = decideOpponentTurn(makeState({ units: [u, enemy] }), 'p0', NOW)
    expect(actions.some(a => a.type === 'initiateCombat')).toBe(false)
  })

  it('integration — replaying then ending the turn advances currentPlayerId exactly once', () => {
    const u = makeUnit('p0-u', 'p0', { q: 0, r: 0 }, { attack: 20 })
    const enemy = makeUnit('p1-e', 'p1', { q: 1, r: 0 }, { defense: 0, hp: 3 })
    const state = makeState({ units: [u, enemy] })
    const actions = decideOpponentTurn(state, 'p0', NOW)
    const final = replayLegal(state, 'p0', actions)
    expect(final.currentPlayerId).toBe('p1') // advanced once
    expect(final.combatDisputes.some(d => d.attackerUnitId === 'p0-u')).toBe(true) // attack landed
  })
})

// ─── Invalid turns / determinism / purity ─────────────────────────────────────

describe('decideX — guards, determinism, purity', () => {
  it('returns [] when it is not this player’s turn / eliminated / finished', () => {
    expect(decideSubstituteTurn(makeState({ currentPlayerId: 'p1' }), 'p0', NOW)).toEqual([])
    expect(decideOpponentTurn(makeState({ currentPlayerId: 'p1' }), 'p0', NOW)).toEqual([])

    const players = [makePlayer('p0', true), makePlayer('p1')]
    expect(decideOpponentTurn(makeState({ players }), 'p0', NOW)).toEqual([])
    expect(decideSubstituteTurn(makeState({ isFinished: true }), 'p0', NOW)).toEqual([])
  })

  it('is deterministic — same state yields deep-equal action arrays', () => {
    const u = makeUnit('p0-u', 'p0', { q: 0, r: 0 }, { attack: 20 })
    const e1 = makeUnit('p1-b', 'p1', { q: 1, r: 0 }, { defense: 0, hp: 3 })
    const e2 = makeUnit('p1-a', 'p1', { q: -1, r: 0 }, { defense: 0, hp: 3 })
    const state = deepFreeze(makeState({ units: [u, e1, e2] }))
    expect(decideOpponentTurn(state, 'p0', NOW)).toEqual(decideOpponentTurn(state, 'p0', NOW))
  })

  it('does not mutate a frozen input state', () => {
    const u = makeUnit('p0-u', 'p0', { q: 0, r: 0 }, { attack: 20 })
    const enemy = makeUnit('p1-e', 'p1', { q: 1, r: 0 }, { defense: 0, hp: 3 })
    const state = deepFreeze(makeState({ units: [u, enemy] }))
    expect(() => decideOpponentTurn(state, 'p0', NOW)).not.toThrow()
    expect(state.units.find(u2 => u2.id === 'p0-u')!.hasAttacked).toBe(false)
    expect(state.combatDisputes).toHaveLength(0)
  })
})
