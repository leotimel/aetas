import type { CombatDispute } from '@aetas/game-engine'
import type { DisputeRow, DisputeStatusUpdate } from './repository.js'

// ─────────────────────────────────────────────────────────────────────────────
// The engine never tells the caller "I inserted dispute X / resolved dispute Y".
// It just returns a new GameState. So we DERIVE what to persist by diffing the
// combatDisputes array before and after the engine call.
//
//   • Dispute id in POST but not PRE  → an INSERT (initiateCombat opened it).
//   • Dispute id in BOTH, status changed → a STATUS UPDATE (resolution).
//
// Edge case (named in the plan): a dispute can be created AND resolved-by-timeout
// inside the SAME endTurn — it appears only in POST, already at its final status.
// It is emitted as a single insert carrying that final status; no redundant
// status update. The combat_disputes row is born already resolved.
//
// Disputes never disappear in v1 (status changes, the row stays), so an id present
// in PRE but absent from POST does not occur; the diff would simply ignore it.
// ─────────────────────────────────────────────────────────────────────────────

export interface DisputeDiff {
  inserts: DisputeRow[]
  statusUpdates: DisputeStatusUpdate[]
}

function toRow(dispute: CombatDispute, gameId: string): DisputeRow {
  return {
    id: dispute.id,
    gameId,
    attackerPlayerId: dispute.attackerPlayerId,
    defenderPlayerId: dispute.defenderPlayerId,
    status: dispute.status,
    expiresAt: dispute.expiresAt,
  }
}

export function diffDisputes(
  pre: readonly CombatDispute[],
  post: readonly CombatDispute[],
  gameId: string,
): DisputeDiff {
  const preById = new Map(pre.map(d => [d.id, d]))

  const inserts: DisputeRow[] = []
  const statusUpdates: DisputeStatusUpdate[] = []

  for (const d of post) {
    const before = preById.get(d.id)
    if (!before) {
      // New dispute — persist with whatever status it currently holds (usually
      // 'pending', but 'resolvedByTimeout' if created-and-resolved same turn).
      inserts.push(toRow(d, gameId))
    } else if (before.status !== d.status) {
      statusUpdates.push({ id: d.id, status: d.status })
    }
  }

  return { inserts, statusUpdates }
}
