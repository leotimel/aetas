import { describe, it, expect } from 'vitest'
import {
  submitAction,
  resolveDispute,
  sweepTimeouts,
  TURN_TIMEOUT_MS,
  type SubmitableAction,
} from './orchestration.js'
import type {
  GameRepo,
  LoadedGame,
  ApplyTurnArgs,
  ResolveDisputeArgs,
  DisputeRow,
} from './repository.js'
import {
  TurnState,
  Era,
  CitySpecialization,
  CombatDisputeStatus,
  type GameState,
  type Player,
  type Unit,
  type UnitStats,
  type City,
  type CombatDispute,
  type GameMap,
  type HexCoord,
} from '@aetas/game-engine'

// ─── State builders ───────────────────────────────────────────────────────────

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

function makeUnit(id: string, ownerId: string, pos: HexCoord, stats: Partial<UnitStats> = {}): Unit {
  return {
    id,
    unitType: 'warrior',
    position: pos,
    stats: { attack: 6, defense: 2, hp: 10, maxHp: 10, movement: 2, ...stats },
    ownerId,
    hasMoved: false,
    hasAttacked: false,
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

function makeDispute(
  id: string,
  attackerUnitId: string,
  defenderUnitId: string,
  attackerPlayerId: string,
  defenderPlayerId: string,
  expiresAt: number,
): CombatDispute {
  return {
    id,
    attackerUnitId,
    defenderUnitId,
    attackerPlayerId,
    defenderPlayerId,
    createdAt: 0,
    expiresAt,
    status: CombatDisputeStatus.Pending,
  }
}

const MAP: GameMap = { tiles: [], radius: 10, seed: 's', startPositions: [] }

function makeState(opts: {
  players?: Player[]
  units?: Unit[]
  cities?: City[]
  disputes?: CombatDispute[]
  currentPlayerId?: string
  turnNumber?: number
  maxTurns?: number
} = {}): GameState {
  return {
    gameId: 'g1',
    players: opts.players ?? [makePlayer('p0'), makePlayer('p1')],
    map: MAP,
    units: opts.units ?? [],
    cities: opts.cities ?? [],
    turnNumber: opts.turnNumber ?? 1,
    currentPlayerId: opts.currentPlayerId ?? 'p0',
    turnState: TurnState.WaitingForAction,
    era: Era.Ancient,
    maxTurns: opts.maxTurns ?? 10,
    combatDisputes: opts.disputes ?? [],
    nonAggressionPacts: [],
    diplomaticProposals: [],
    fogOfWar: [],
    winner: null,
    isFinished: false,
  }
}

// ─── FakeGameRepo — an in-memory model of the Postgres CAS contract ────────────
//
// Fidelity: applyTurn / resolveDisputeCas commit ONLY if the live row's
// state_version still equals the version the caller loaded. Because JS is
// single-threaded and these methods have no internal await before the guard
// check, two interleaved calls cannot both pass — exactly like
// `UPDATE ... WHERE state_version = $expected` under Postgres row locking.
//
// To simulate two requests that both READ before either WRITES, the test calls
// freezeLoads(): subsequent loadGame() calls return the snapshot pinned at freeze
// time (old version), while applyTurn/resolveDisputeCas still check the LIVE
// version. This reproduces a real race deterministically, with no async timing.

interface Row {
  gameState: GameState
  stateVersion: number
  turnNumber: number
  currentPlayerId: string
  isFinished: boolean
  turnDeadline: number | null
  disputes: Map<string, DisputeRow>
}

class FakeGameRepo implements GameRepo {
  private rows = new Map<string, Row>()
  private frozen = new Map<string, LoadedGame>()
  writeCount = 0
  /** Test hook: runs at the very start of applyTurn, before the CAS check. */
  beforeApplyTurn?: (gameId: string) => void

  seed(gameId: string, state: GameState, turnDeadline: number | null = null): void {
    const disputes = new Map<string, DisputeRow>()
    for (const d of state.combatDisputes) {
      disputes.set(d.id, {
        id: d.id,
        gameId,
        attackerPlayerId: d.attackerPlayerId,
        defenderPlayerId: d.defenderPlayerId,
        status: d.status,
        expiresAt: d.expiresAt,
      })
    }
    this.rows.set(gameId, {
      gameState: state,
      stateVersion: 0,
      turnNumber: state.turnNumber,
      currentPlayerId: state.currentPlayerId,
      isFinished: state.isFinished,
      turnDeadline,
      disputes,
    })
  }

  private snapshot(gameId: string): LoadedGame | null {
    const row = this.rows.get(gameId)
    if (!row) return null
    return {
      gameState: row.gameState,
      stateVersion: row.stateVersion,
      turnNumber: row.turnNumber,
      currentPlayerId: row.currentPlayerId,
      isFinished: row.isFinished,
      turnDeadline: row.turnDeadline,
    }
  }

  /** Pin all subsequent loadGame() to the current snapshot (models "loaded before any write"). */
  freezeLoads(gameId: string): void {
    const snap = this.snapshot(gameId)
    if (snap) this.frozen.set(gameId, snap)
  }
  unfreezeLoads(): void {
    this.frozen.clear()
  }

  current(gameId: string): Row {
    const row = this.rows.get(gameId)
    if (!row) throw new Error(`no row ${gameId}`)
    return row
  }

  async loadGame(gameId: string): Promise<LoadedGame | null> {
    const frozen = this.frozen.get(gameId)
    if (frozen) return frozen
    return this.snapshot(gameId)
  }

  async applyTurn(gameId: string, args: ApplyTurnArgs): Promise<boolean> {
    this.beforeApplyTurn?.(gameId)
    const row = this.rows.get(gameId)
    if (!row) return false
    if (row.stateVersion !== args.expected.stateVersion) return false // ← CAS guard

    row.gameState = args.next.gameState
    row.turnNumber = args.next.turnNumber
    row.currentPlayerId = args.next.currentPlayerId
    row.isFinished = args.next.isFinished
    row.turnDeadline = args.next.turnDeadline
    row.stateVersion += 1
    for (const ins of args.disputeInserts) row.disputes.set(ins.id, ins)
    for (const upd of args.disputeStatusUpdates) {
      const d = row.disputes.get(upd.id)
      if (d) d.status = upd.status
    }
    this.writeCount += 1
    return true
  }

  async resolveDisputeCas(gameId: string, args: ResolveDisputeArgs): Promise<boolean> {
    const row = this.rows.get(gameId)
    if (!row) return false
    const dispute = row.disputes.get(args.disputeId)
    if (!dispute || dispute.status !== 'pending') return false // ← CAS guard 1 (status)
    if (row.stateVersion !== args.expected.stateVersion) return false // ← CAS guard 2 (version)

    row.gameState = args.next.gameState
    dispute.status = args.newStatus
    for (const upd of args.disputeStatusUpdates) {
      const d = row.disputes.get(upd.id)
      if (d) d.status = upd.status
    }
    row.stateVersion += 1
    this.writeCount += 1
    return true
  }

  async findExpiredDisputes(now: number): Promise<{ gameId: string; disputeId: string }[]> {
    const out: { gameId: string; disputeId: string }[] = []
    for (const [gameId, row] of this.rows) {
      for (const d of row.disputes.values()) {
        if (d.status === 'pending' && d.expiresAt <= now) out.push({ gameId, disputeId: d.id })
      }
    }
    return out
  }

  async findTimedOutTurns(now: number): Promise<{ gameId: string }[]> {
    const out: { gameId: string }[] = []
    for (const [gameId, row] of this.rows) {
      if (!row.isFinished && row.turnDeadline !== null && row.turnDeadline <= now) {
        out.push({ gameId })
      }
    }
    return out
  }
}

const NOW = 5_000

// ─── 1. Two simultaneous endTurns → exactly one wins ──────────────────────────

describe('CAS: concurrent endTurn', () => {
  it('two endTurns by the current player → 1 ok + 1 conflict, turn advances once', async () => {
    const repo = new FakeGameRepo()
    repo.seed('g1', makeState({ currentPlayerId: 'p0' }))

    const endTurn: SubmitableAction = { type: 'endTurn' }

    // Both requests load the SAME pre-write snapshot (version 0).
    repo.freezeLoads('g1')
    const first = await submitAction(repo, { gameId: 'g1', userId: 'p0', action: endTurn, now: NOW })
    const second = await submitAction(repo, { gameId: 'g1', userId: 'p0', action: endTurn, now: NOW })
    repo.unfreezeLoads()

    expect(first.ok).toBe(true)
    expect(second).toEqual({ ok: false, kind: 'conflict', reason: expect.any(String) })

    const row = repo.current('g1')
    expect(row.currentPlayerId).toBe('p1') // advanced exactly once
    expect(row.stateVersion).toBe(1)        // exactly one write
    expect(repo.writeCount).toBe(1)
  })
})

// ─── 2. endTurn by the wrong player → forbidden ───────────────────────────────

describe('identity gate', () => {
  it('rejects endTurn from a player who is not the current player', async () => {
    const repo = new FakeGameRepo()
    repo.seed('g1', makeState({ currentPlayerId: 'p0' }))
    const res = await submitAction(repo, { gameId: 'g1', userId: 'p1', action: { type: 'endTurn' }, now: NOW })
    expect(res).toEqual({ ok: false, kind: 'forbidden', reason: 'not your turn' })
    expect(repo.writeCount).toBe(0)
  })

  it('returns not_found for an unknown game', async () => {
    const repo = new FakeGameRepo()
    const res = await submitAction(repo, { gameId: 'ghost', userId: 'p0', action: { type: 'endTurn' }, now: NOW })
    expect(res).toEqual({ ok: false, kind: 'not_found', reason: 'game not found' })
  })
})

// ─── 3. Two simultaneous dispute resolutions → exactly one wins ───────────────

describe('CAS: concurrent dispute resolution', () => {
  it('attacker and defender both resolve the same dispute → 1 ok + 1 conflict', async () => {
    const attacker = makeUnit('u-atk', 'p0', { q: 0, r: 0 }, { attack: 8 })
    const defender = makeUnit('u-def', 'p1', { q: 1, r: 0 }, { defense: 2, hp: 10 })
    const dispute = makeDispute('d1', 'u-atk', 'u-def', 'p0', 'p1', NOW + 1_000)
    const state = makeState({ units: [attacker, defender], disputes: [dispute], currentPlayerId: 'p1' })

    const repo = new FakeGameRepo()
    repo.seed('g1', state)

    repo.freezeLoads('g1')
    const byDefender = await resolveDispute(repo, { gameId: 'g1', userId: 'p1', disputeId: 'd1', now: NOW })
    const byAttacker = await resolveDispute(repo, { gameId: 'g1', userId: 'p0', disputeId: 'd1', now: NOW })
    repo.unfreezeLoads()

    expect(byDefender.ok).toBe(true)
    expect(byAttacker).toEqual({ ok: false, kind: 'conflict', reason: expect.any(String) })

    expect(repo.current('g1').disputes.get('d1')!.status).toBe('resolvedByAction')
    expect(repo.writeCount).toBe(1)
  })

  it('forbids a player who is not party to the dispute', async () => {
    const attacker = makeUnit('u-atk', 'p0', { q: 0, r: 0 })
    const defender = makeUnit('u-def', 'p1', { q: 1, r: 0 })
    const dispute = makeDispute('d1', 'u-atk', 'u-def', 'p0', 'p1', NOW + 1_000)
    const players = [makePlayer('p0'), makePlayer('p1'), makePlayer('p2')]
    const repo = new FakeGameRepo()
    repo.seed('g1', makeState({ players, units: [attacker, defender], disputes: [dispute] }))

    const res = await resolveDispute(repo, { gameId: 'g1', userId: 'p2', disputeId: 'd1', now: NOW })
    expect(res).toEqual({ ok: false, kind: 'forbidden', reason: 'not a party to this dispute' })
  })
})

// ─── 4. state_version catches the intra-turn race the turn tuple would miss ────

describe('CAS: intra-turn race (initiateCombat does not change the turn tuple)', () => {
  function combatState(): GameState {
    const u = makeUnit('p0-u', 'p0', { q: 0, r: 0 }, { attack: 20 })
    const e1 = makeUnit('p1-e1', 'p1', { q: 1, r: 0 }, { defense: 0, hp: 4 })
    const e2 = makeUnit('p1-e2', 'p1', { q: -1, r: 0 }, { defense: 0, hp: 4 })
    return makeState({ units: [u, e1, e2], currentPlayerId: 'p0' })
  }
  const atk1: SubmitableAction = { type: 'initiateCombat', attackerUnitId: 'p0-u', defenderUnitId: 'p1-e1' }
  const atk2: SubmitableAction = { type: 'initiateCombat', attackerUnitId: 'p0-u', defenderUnitId: 'p1-e2' }

  it('sequential: the second attack by the same unit is rejected (hasAttacked)', async () => {
    const repo = new FakeGameRepo()
    repo.seed('g1', combatState())
    const first = await submitAction(repo, { gameId: 'g1', userId: 'p0', action: atk1, now: NOW })
    const second = await submitAction(repo, { gameId: 'g1', userId: 'p0', action: atk2, now: NOW })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    if (second.ok) throw new Error('unreachable')
    expect(second.kind).toBe('rejected') // engine saw hasAttacked=true
    expect(repo.writeCount).toBe(1)
  })

  it('concurrent (same snapshot): the second attack loses on state_version CAS', async () => {
    // Note: neither attack changes (turnNumber, currentPlayerId) — only state_version
    // distinguishes them. A tuple-only guard would let BOTH commit. This is the test
    // that justifies the state_version column.
    const repo = new FakeGameRepo()
    repo.seed('g1', combatState())

    repo.freezeLoads('g1')
    const first = await submitAction(repo, { gameId: 'g1', userId: 'p0', action: atk1, now: NOW })
    const second = await submitAction(repo, { gameId: 'g1', userId: 'p0', action: atk2, now: NOW })
    repo.unfreezeLoads()

    expect(first.ok).toBe(true)
    expect(second).toEqual({ ok: false, kind: 'conflict', reason: expect.any(String) })
    expect(repo.current('g1').disputes.size).toBe(1) // only the first attack persisted
    expect(repo.writeCount).toBe(1)
  })
})

// ─── 5. Dispute timeout sweep — resolves + idempotent ─────────────────────────

describe('sweepTimeouts: expired combat disputes', () => {
  it('auto-resolves an expired dispute (loser removed) and is idempotent', async () => {
    const attacker = makeUnit('u-atk', 'p0', { q: 0, r: 0 }, { attack: 20 })
    const defender = makeUnit('u-def', 'p1', { q: 1, r: 0 }, { defense: 2, hp: 5 })
    const dispute = makeDispute('d1', 'u-atk', 'u-def', 'p0', 'p1', NOW - 1) // already expired
    const repo = new FakeGameRepo()
    repo.seed('g1', makeState({ units: [attacker, defender], disputes: [dispute], currentPlayerId: 'p0' }))

    const first = await sweepTimeouts(repo, { now: NOW })
    expect(first.disputesResolved).toBe(1)

    const row = repo.current('g1')
    expect(row.disputes.get('d1')!.status).toBe('resolvedByTimeout')
    expect(row.gameState.units.some(u => u.id === 'u-def')).toBe(false) // loser removed
    expect(row.gameState.units.some(u => u.id === 'u-atk')).toBe(true)

    // Second sweep: nothing left to do.
    const second = await sweepTimeouts(repo, { now: NOW })
    expect(second.disputesResolved).toBe(0)
    expect(repo.writeCount).toBe(1) // exactly one persist across both sweeps
  })
})

// ─── 6. Turn timeout sweep — substitute AI plays ──────────────────────────────

describe('sweepTimeouts: absent-player turns', () => {
  it('substitute AI defends its pending dispute and ends the turn', async () => {
    const myDefender = makeUnit('p0-def', 'p0', { q: 0, r: 0 }, { defense: 3, hp: 20 })
    const enemyRaider = makeUnit('p1-raid', 'p1', { q: 1, r: 0 }, { attack: 5 })
    const dispute = makeDispute('d1', 'p1-raid', 'p0-def', 'p1', 'p0', NOW + 100_000) // p0 is defender
    const state = makeState({ units: [myDefender, enemyRaider], disputes: [dispute], currentPlayerId: 'p0' })

    const repo = new FakeGameRepo()
    repo.seed('g1', state, NOW - 1) // turn deadline already passed

    const summary = await sweepTimeouts(repo, { now: NOW })
    expect(summary.turnsAdvanced).toBe(1)

    const row = repo.current('g1')
    expect(row.currentPlayerId).toBe('p1')                       // turn advanced
    expect(row.disputes.get('d1')!.status).toBe('resolvedByAction') // AI defended
    expect(row.gameState.units.some(u => u.id === 'p0-def')).toBe(true) // strong defender survived
  })

  it('a real action landing first makes the sweep a no-op (CAS conflict)', async () => {
    const state = makeState({ currentPlayerId: 'p0' })
    const repo = new FakeGameRepo()
    repo.seed('g1', state, NOW - 1)

    // Simulate a concurrent real write committing between the sweep's load and its applyTurn.
    let bumped = false
    repo.beforeApplyTurn = (gameId) => {
      if (bumped) return
      bumped = true
      const row = repo.current(gameId)
      row.stateVersion += 1 // a real action already advanced the version
    }

    const summary = await sweepTimeouts(repo, { now: NOW })
    expect(summary.turnsAdvanced).toBe(0)
    expect(summary.conflicts).toBe(1)
  })
})

// ─── 7 & 8. Winner determination proves full hooks are wired ──────────────────

describe('full hooks: maxTurns finish sets the winner', () => {
  it('endTurn that completes the final round writes winnerId from determineWinner', async () => {
    // p1 is the last player in order; ending their turn on the final round finishes
    // the game. determineWinner must pick p0 (stronger city). If FULL_HOOKS lacked
    // determineWinner, winnerId would be null — so this asserts the hooks are passed.
    const players = [makePlayer('p0'), makePlayer('p1')]
    const cities = [makeCity('c0', 'p0', 5, 5), makeCity('c1', 'p1', 1, 1)]
    const state = makeState({
      players,
      cities,
      currentPlayerId: 'p1',
      turnNumber: 3,
      maxTurns: 3,
    })
    const repo = new FakeGameRepo()
    repo.seed('g1', state)

    const res = await submitAction(repo, { gameId: 'g1', userId: 'p1', action: { type: 'endTurn' }, now: NOW })
    expect(res.ok).toBe(true)

    const row = repo.current('g1')
    expect(row.isFinished).toBe(true)
    expect(row.gameState.winner).toBe('p0')
    expect(row.turnDeadline).toBeNull() // finished games have no turn deadline
  })
})

// ─── turnDeadline bookkeeping ─────────────────────────────────────────────────

describe('turnDeadline', () => {
  it('an accepted, non-finishing action sets the next deadline to now + TURN_TIMEOUT_MS', async () => {
    const repo = new FakeGameRepo()
    repo.seed('g1', makeState({ currentPlayerId: 'p0' }))
    await submitAction(repo, { gameId: 'g1', userId: 'p0', action: { type: 'endTurn' }, now: NOW })
    expect(repo.current('g1').turnDeadline).toBe(NOW + TURN_TIMEOUT_MS)
  })
})
