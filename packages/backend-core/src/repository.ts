import type { GameState } from '@aetas/game-engine'

// ─────────────────────────────────────────────────────────────────────────────
// GameRepo — the persistence PORT.
//
// Pure interface: no Supabase, no Deno, no I/O concretion. The orchestration
// layer depends only on this. Two implementations exist:
//   • SupabaseGameRepo (Deno-only, in supabase/functions/) — real Postgres CAS
//     via the apply_game_turn / resolve_combat_dispute RPCs.
//   • FakeGameRepo (test-only) — an in-memory model of the same CAS semantics,
//     so the concurrency tests prove the real contract without a database.
//
// The CAS guard is `state_version`: a monotonic counter bumped on EVERY
// successful write. The (turnNumber, currentPlayerId) tuple alone is NOT enough
// — initiateCombat, respondToDispute and other intra-turn actions don't change
// the tuple, so two intra-turn races would both pass a tuple-only guard.
// state_version catches every race. The tuple rides along as defence-in-depth.
// ─────────────────────────────────────────────────────────────────────────────

export type DisputeStatus = 'pending' | 'resolvedByAction' | 'resolvedByTimeout'

export interface LoadedGame {
  gameState: GameState
  stateVersion: number
  turnNumber: number
  currentPlayerId: string
  isFinished: boolean
  /** Unix ms when the substitute AI may take over an absent player's turn; null when finished. */
  turnDeadline: number | null
}

/** The exact (state_version, turn, player) a write expects to still be true. */
export interface CasExpect {
  stateVersion: number
  turnNumber: number
  currentPlayerId: string
}

/** A row mirrored out of GameState.combatDisputes into the combat_disputes table. */
export interface DisputeRow {
  id: string
  gameId: string
  attackerPlayerId: string
  defenderPlayerId: string
  status: DisputeStatus
  /** Unix ms (createdAt + COMBAT_TIMEOUT_MS). */
  expiresAt: number
}

export interface DisputeStatusUpdate {
  id: string
  status: DisputeStatus
}

export interface PlayerElimination {
  enginePlayerId: string
}

/** Everything apply_game_turn needs to persist one turn-advancing action atomically. */
export interface ApplyTurnArgs {
  expected: CasExpect
  next: {
    gameState: GameState
    turnNumber: number
    currentPlayerId: string
    isFinished: boolean
    winnerId: string | null
    turnDeadline: number | null
  }
  /** Disputes that appeared this action (initiateCombat). */
  disputeInserts: DisputeRow[]
  /** Disputes whose status changed (e.g. resolved-by-timeout inside endTurn). */
  disputeStatusUpdates: DisputeStatusUpdate[]
  /** Players newly eliminated this action (sync game_players.is_eliminated). */
  playerEliminations: PlayerElimination[]
}

/** Everything resolve_combat_dispute needs to persist one dispute resolution atomically. */
export interface ResolveDisputeArgs {
  expected: CasExpect
  disputeId: string
  newStatus: DisputeStatus
  next: { gameState: GameState }
  /** Any OTHER disputes the engine resolved as a side effect (defensive; usually empty). */
  disputeStatusUpdates: DisputeStatusUpdate[]
  playerEliminations: PlayerElimination[]
}

export interface GameRepo {
  loadGame(gameId: string): Promise<LoadedGame | null>

  /**
   * Persists a turn-advancing action under the state_version CAS guard.
   * Returns true if the guard matched (write committed), false if it lost the race.
   */
  applyTurn(gameId: string, args: ApplyTurnArgs): Promise<boolean>

  /**
   * Persists a dispute resolution under TWO guards: state_version AND the
   * dispute still being 'pending'. Returns false if either guard fails.
   */
  resolveDisputeCas(gameId: string, args: ResolveDisputeArgs): Promise<boolean>

  /** Disputes past their expiry that are still pending (for the timeout sweep). */
  findExpiredDisputes(now: number): Promise<{ gameId: string; disputeId: string }[]>

  /** Active games whose current turn deadline has passed (substitute-AI sweep). */
  findTimedOutTurns(now: number): Promise<{ gameId: string }[]>
}
