import {
  applyAction,
  resolveDisputeByAction,
  resolveTimedOutDispute,
  determineWinner,
  decideSubstituteTurn,
  decideOpponentTurn,
  CombatDisputeStatus,
  type GameAction,
  type GameState,
  type Player,
  type TurnHooks,
} from '@aetas/game-engine'
import {
  type GameRepo,
  type PlayerElimination,
  type ApplyTurnArgs,
} from './repository.js'
import { diffDisputes } from './disputes.js'

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration: load state → engine computes new state → persist under CAS.
//
// The engine is the ONLY rules authority (it re-validates internally). This layer
// adds exactly two things a pure function cannot: (a) an identity/turn gate for
// fast, correct rejection, and (b) atomic persistence under a state_version CAS
// guard so two near-simultaneous requests never both commit.
//
// Everything here is pure given a GameRepo, so it runs and is fully tested under
// Vitest with an in-memory fake repo that models Postgres CAS — no database.
// ─────────────────────────────────────────────────────────────────────────────

/** How long an absent player's turn waits before the substitute AI takes over. */
export const TURN_TIMEOUT_MS = 24 * 60 * 60 * 1000

/** Full hooks for endTurn: WITHOUT determineWinner, a maxTurns finish has winner=null. */
const FULL_HOOKS: TurnHooks = { resolveTimedOutDispute, determineWinner }

/** Actions a player submits on their own turn. Dispute responses use resolveDispute(). */
export type SubmitableAction = Exclude<GameAction, { type: 'respondToDispute' }>

export type OrchestrationResult =
  | { ok: true; state: GameState }
  | { ok: false; kind: 'rejected' | 'conflict' | 'not_found' | 'forbidden'; reason: string }

const NOT_FOUND = (reason: string): OrchestrationResult => ({ ok: false, kind: 'not_found', reason })
const FORBIDDEN = (reason: string): OrchestrationResult => ({ ok: false, kind: 'forbidden', reason })
const REJECTED = (reason: string): OrchestrationResult => ({ ok: false, kind: 'rejected', reason })
const CONFLICT: OrchestrationResult = { ok: false, kind: 'conflict', reason: 'state changed, refetch and retry' }

/** Players eliminated in `post` but not in `pre`. */
function eliminationsDiff(pre: readonly Player[], post: readonly Player[]): PlayerElimination[] {
  const wasEliminated = new Map(pre.map(p => [p.id, p.isEliminated]))
  return post
    .filter(p => p.isEliminated && !wasEliminated.get(p.id))
    .map(p => ({ enginePlayerId: p.id }))
}

function turnDeadlineFor(state: GameState, now: number): number | null {
  return state.isFinished ? null : now + TURN_TIMEOUT_MS
}

/** Builds the ApplyTurnArgs for persisting `next` over `loaded` under CAS. */
function buildApplyTurnArgs(
  gameId: string,
  loaded: { gameState: GameState; stateVersion: number; turnNumber: number; currentPlayerId: string },
  next: GameState,
  now: number,
): ApplyTurnArgs {
  const diff = diffDisputes(loaded.gameState.combatDisputes, next.combatDisputes, gameId)
  return {
    expected: {
      stateVersion: loaded.stateVersion,
      turnNumber: loaded.turnNumber,
      currentPlayerId: loaded.currentPlayerId,
    },
    next: {
      gameState: next,
      turnNumber: next.turnNumber,
      currentPlayerId: next.currentPlayerId,
      isFinished: next.isFinished,
      winnerId: next.winner,
      turnDeadline: turnDeadlineFor(next, now),
    },
    disputeInserts: diff.inserts,
    disputeStatusUpdates: diff.statusUpdates,
    playerEliminations: eliminationsDiff(loaded.gameState.players, next.players),
  }
}

// ─── submitAction (endTurn / initiateCombat) ──────────────────────────────────

export async function submitAction(
  repo: GameRepo,
  params: { gameId: string; userId: string; action: SubmitableAction; now: number },
): Promise<OrchestrationResult> {
  const { gameId, userId, action, now } = params

  const loaded = await repo.loadGame(gameId)
  if (!loaded) return NOT_FOUND('game not found')
  if (loaded.isFinished) return REJECTED('game is finished')

  // Identity gate: a human acts only on their own turn. The engine re-checks this
  // against the loaded state too, but failing fast with a clear 403 is friendlier.
  if (userId !== loaded.currentPlayerId) return FORBIDDEN('not your turn')

  const res = applyAction(loaded.gameState, userId, action, now, FULL_HOOKS)
  if (!res.ok) return REJECTED(res.reason)

  const args = buildApplyTurnArgs(gameId, loaded, res.state, now)
  const committed = await repo.applyTurn(gameId, args)
  return committed ? { ok: true, state: res.state } : CONFLICT
}

// ─── resolveDispute (defender or attacker, possibly out of turn) ───────────────

export async function resolveDispute(
  repo: GameRepo,
  params: { gameId: string; userId: string; disputeId: string; now: number },
): Promise<OrchestrationResult> {
  const { gameId, userId, disputeId, now } = params

  const loaded = await repo.loadGame(gameId)
  if (!loaded) return NOT_FOUND('game not found')

  const dispute = loaded.gameState.combatDisputes.find(d => d.id === disputeId)
  if (!dispute) return NOT_FOUND('dispute not found')

  // A dispute response is NOT turn-gated — the defender (or attacker) may act out
  // of turn. The gate is dispute membership, not currentPlayerId.
  if (userId !== dispute.attackerPlayerId && userId !== dispute.defenderPlayerId) {
    return FORBIDDEN('not a party to this dispute')
  }

  const res = resolveDisputeByAction(loaded.gameState, disputeId, userId, now)
  if (!res.ok) return REJECTED(res.reason)

  const next = res.state
  const diff = diffDisputes(loaded.gameState.combatDisputes, next.combatDisputes, gameId)
  const committed = await repo.resolveDisputeCas(gameId, {
    expected: {
      stateVersion: loaded.stateVersion,
      turnNumber: loaded.turnNumber,
      currentPlayerId: loaded.currentPlayerId,
    },
    disputeId,
    newStatus: 'resolvedByAction',
    next: { gameState: next },
    disputeStatusUpdates: diff.statusUpdates.filter(u => u.id !== disputeId),
    playerEliminations: eliminationsDiff(loaded.gameState.players, next.players),
  })
  return committed ? { ok: true, state: next } : CONFLICT
}

// ─── sweepTimeouts (scheduled job) ─────────────────────────────────────────────

export interface SweepSummary {
  turnsAdvanced: number
  disputesResolved: number
  conflicts: number
}

/** Applies a list of AI actions to a state, folding each onto the next. */
function foldActions(
  state: GameState,
  playerId: string,
  actions: readonly GameAction[],
  now: number,
): GameState | null {
  let s = state
  for (const action of actions) {
    const res = applyAction(s, playerId, action, now, FULL_HOOKS)
    if (!res.ok) return null // AI guarantees legality; bail defensively if not
    s = res.state
  }
  return s
}

export async function sweepTimeouts(
  repo: GameRepo,
  params: { now: number },
): Promise<SweepSummary> {
  const { now } = params
  const summary: SweepSummary = { turnsAdvanced: 0, disputesResolved: 0, conflicts: 0 }

  // 1) Absent-player turns: dedicated AI opponents use decideOpponentTurn; absent
  //    human players fall back to the conservative decideSubstituteTurn.
  for (const { gameId } of await repo.findTimedOutTurns(now)) {
    const loaded = await repo.loadGame(gameId)
    if (!loaded || loaded.isFinished) continue

    const currentPlayer = loaded.gameState.players.find(p => p.id === loaded.currentPlayerId)
    const aiDifficulty = currentPlayer?.aiDifficulty
    const actions = aiDifficulty
      ? decideOpponentTurn(loaded.gameState, loaded.currentPlayerId, now, aiDifficulty === 'hard')
      : decideSubstituteTurn(loaded.gameState, loaded.currentPlayerId, now)
    if (actions.length === 0) continue // not legally this player's turn anymore

    const next = foldActions(loaded.gameState, loaded.currentPlayerId, actions, now)
    if (!next) continue

    const args = buildApplyTurnArgs(gameId, loaded, next, now)
    const committed = await repo.applyTurn(gameId, args)
    if (committed) summary.turnsAdvanced++
    else summary.conflicts++ // a real action landed first — fine, the player is back
  }

  // 2) Expired combat disputes: auto-resolve (attacker favoured, no active defence).
  for (const { gameId, disputeId } of await repo.findExpiredDisputes(now)) {
    const loaded = await repo.loadGame(gameId)
    if (!loaded) continue

    const dispute = loaded.gameState.combatDisputes.find(d => d.id === disputeId)
    if (!dispute || dispute.status !== 'pending') continue // already resolved — idempotent

    const next = resolveTimedOutDispute(dispute, loaded.gameState)
    const updated: GameState = {
      ...next,
      combatDisputes: next.combatDisputes.map(d =>
        d.id === disputeId ? { ...d, status: CombatDisputeStatus.ResolvedByTimeout } : d,
      ),
    }
    const diff = diffDisputes(loaded.gameState.combatDisputes, updated.combatDisputes, gameId)
    const committed = await repo.resolveDisputeCas(gameId, {
      expected: {
        stateVersion: loaded.stateVersion,
        turnNumber: loaded.turnNumber,
        currentPlayerId: loaded.currentPlayerId,
      },
      disputeId,
      newStatus: 'resolvedByTimeout',
      next: { gameState: updated },
      disputeStatusUpdates: diff.statusUpdates.filter(u => u.id !== disputeId),
      playerEliminations: eliminationsDiff(loaded.gameState.players, updated.players),
    })
    if (committed) summary.disputesResolved++
    else summary.conflicts++
  }

  return summary
}
