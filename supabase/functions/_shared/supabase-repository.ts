// SupabaseGameRepo — the Deno-side adapter implementing the GameRepo port against
// real Postgres via the apply_game_turn / resolve_combat_dispute RPCs.
//
// This is the ONLY place the orchestration touches a database. It is a thin
// translation layer (rows ⇄ port types, ms ⇄ timestamptz) with no game logic, so
// it is intentionally NOT unit-tested — the orchestration logic it serves is
// fully covered in packages/backend-core via the FakeGameRepo. Real end-to-end
// exercise happens at the integration checkpoint (Phase 3) against a live stack.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GameRepo,
  LoadedGame,
  ApplyTurnArgs,
  ResolveDisputeArgs,
} from '@aetas/backend-core'

const toIso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString())
const toMs = (iso: string | null): number | null => (iso === null ? null : Date.parse(iso))

export class SupabaseGameRepo implements GameRepo {
  constructor(private readonly db: SupabaseClient) {}

  async loadGame(gameId: string): Promise<LoadedGame | null> {
    const { data, error } = await this.db
      .from('games')
      .select('game_state, state_version, turn_number, current_player_id, is_finished, turn_deadline')
      .eq('id', gameId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return {
      gameState: data.game_state,
      stateVersion: Number(data.state_version),
      turnNumber: data.turn_number,
      currentPlayerId: data.current_player_id,
      isFinished: data.is_finished,
      turnDeadline: toMs(data.turn_deadline),
    }
  }

  async applyTurn(gameId: string, args: ApplyTurnArgs): Promise<boolean> {
    const { data, error } = await this.db.rpc('apply_game_turn', {
      p_game_id: gameId,
      p_expected_version: args.expected.stateVersion,
      p_new_state: args.next.gameState,
      p_new_turn: args.next.turnNumber,
      p_new_player: args.next.currentPlayerId,
      p_is_finished: args.next.isFinished,
      p_winner: args.next.winnerId,
      p_turn_deadline: toIso(args.next.turnDeadline),
      p_dispute_inserts: args.disputeInserts.map(d => ({
        id: d.id,
        attacker_player_id: d.attackerPlayerId,
        defender_player_id: d.defenderPlayerId,
        status: d.status,
        expires_at: d.expiresAt, // ms; the RPC converts to timestamptz
      })),
      p_dispute_status_updates: args.disputeStatusUpdates,
      p_eliminations: args.playerEliminations.map(e => e.enginePlayerId),
    })
    if (error) throw error
    return data === true
  }

  async resolveDisputeCas(gameId: string, args: ResolveDisputeArgs): Promise<boolean> {
    const { data, error } = await this.db.rpc('resolve_combat_dispute', {
      p_game_id: gameId,
      p_expected_version: args.expected.stateVersion,
      p_dispute_id: args.disputeId,
      p_new_state: args.next.gameState,
      p_new_status: args.newStatus,
      p_extra_status_updates: args.disputeStatusUpdates,
      p_eliminations: args.playerEliminations.map(e => e.enginePlayerId),
    })
    // The RPC raises 'aetas_version_conflict' (serialization_failure) when the
    // version guard loses after the dispute guard passed — treat as a conflict.
    if (error) {
      if (error.code === '40001' || String(error.message).includes('aetas_version_conflict')) {
        return false
      }
      throw error
    }
    return data === true
  }

  async findExpiredDisputes(now: number): Promise<{ gameId: string; disputeId: string }[]> {
    const { data, error } = await this.db
      .from('combat_disputes')
      .select('id, game_id')
      .eq('status', 'pending')
      .lte('expires_at', new Date(now).toISOString())
    if (error) throw error
    return (data ?? []).map(r => ({ gameId: r.game_id, disputeId: r.id }))
  }

  async findTimedOutTurns(now: number): Promise<{ gameId: string }[]> {
    const { data, error } = await this.db
      .from('games')
      .select('id')
      .eq('is_finished', false)
      .lte('turn_deadline', new Date(now).toISOString())
    if (error) throw error
    return (data ?? []).map(r => ({ gameId: r.id }))
  }
}
