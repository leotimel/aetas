import { CombatDisputeStatus } from './types.js'
import type { GameState, Unit } from './types.js'
import { canSubmitAction, endTurn, type TurnHooks } from './turn.js'
import {
  createCombatDispute,
  resolveDisputeByAction,
  resolveTimedOutDispute,
} from './combat.js'
import { hexDistance } from './map.js'

// ─── Action model ─────────────────────────────────────────────────────────────

/**
 * The canonical set of player actions the engine currently supports. Both the
 * AI (ai.ts) and future human action handlers (Edge Functions) go through this
 * SAME layer, so "the AI passes the same validation a human passes" is literal.
 *
 * Movement and city founding are deliberately absent — those systems do not
 * exist yet, so no legal action references them.
 */
export type GameAction =
  | { type: 'endTurn' }
  | { type: 'respondToDispute'; disputeId: string }
  | { type: 'initiateCombat'; attackerUnitId: string; defenderUnitId: string }

export type ActionValidation =
  | { valid: true }
  | { valid: false; reason: string }

export type ApplyActionResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string; state: GameState }

const DEFAULT_HOOKS: TurnHooks = { resolveTimedOutDispute }

// ─── Validation ───────────────────────────────────────────────────────────────

function findUnit(state: GameState, id: string): Unit | undefined {
  return state.units.find(u => u.id === id)
}

/**
 * The single legality gate for any action. EVERY action first requires that it
 * is the player's turn (canSubmitAction). This is what the AI's output must
 * satisfy and what a human action handler must also call.
 */
export function validateAction(
  state: GameState,
  playerId: string,
  action: GameAction,
  _now: number,
): ActionValidation {
  const gate = canSubmitAction(state, playerId)
  if (!gate.valid) return gate

  switch (action.type) {
    case 'endTurn':
      return { valid: true }

    case 'respondToDispute': {
      const dispute = state.combatDisputes.find(d => d.id === action.disputeId)
      if (!dispute) return { valid: false, reason: 'dispute not found' }
      if (dispute.status !== CombatDisputeStatus.Pending) {
        return { valid: false, reason: 'dispute already resolved' }
      }
      if (
        playerId !== dispute.attackerPlayerId &&
        playerId !== dispute.defenderPlayerId
      ) {
        return { valid: false, reason: 'player not involved in this dispute' }
      }
      return { valid: true }
    }

    case 'initiateCombat': {
      const attacker = findUnit(state, action.attackerUnitId)
      const defender = findUnit(state, action.defenderUnitId)
      if (!attacker || !defender) return { valid: false, reason: 'unit not found' }
      if (attacker.id === defender.id) {
        return { valid: false, reason: 'a unit cannot attack itself' }
      }
      if (attacker.ownerId !== playerId) {
        return { valid: false, reason: 'attacker is not yours' }
      }
      if (attacker.ownerId === defender.ownerId) {
        return { valid: false, reason: 'cannot attack your own unit' }
      }
      if (hexDistance(attacker.position, defender.position) !== 1) {
        return { valid: false, reason: 'target is not adjacent' }
      }
      if (attacker.hasAttacked) {
        return { valid: false, reason: 'unit has already attacked this turn' }
      }
      const alreadyDisputing = state.combatDisputes.some(
        d => d.status === CombatDisputeStatus.Pending && d.attackerUnitId === attacker.id,
      )
      if (alreadyDisputing) {
        return { valid: false, reason: 'unit already has a pending dispute' }
      }
      return { valid: true }
    }
  }
}

// ─── Application ──────────────────────────────────────────────────────────────

/**
 * Applies an action to the state by dispatching to the existing engine
 * functions a human action would hit. Re-validates first, so it never throws
 * and never produces an illegal transition. Pure: returns a new state.
 */
export function applyAction(
  state: GameState,
  playerId: string,
  action: GameAction,
  now: number,
  hooks: TurnHooks = DEFAULT_HOOKS,
): ApplyActionResult {
  const validation = validateAction(state, playerId, action, now)
  if (!validation.valid) return { ok: false, reason: validation.reason, state }

  switch (action.type) {
    case 'endTurn':
      return endTurn(state, playerId, now, hooks)

    case 'respondToDispute': {
      const res = resolveDisputeByAction(state, action.disputeId, playerId, now)
      return res.ok
        ? { ok: true, state: res.state }
        : { ok: false, reason: res.reason, state: res.state }
    }

    case 'initiateCombat': {
      // validateAction guarantees both units exist and are a legal pairing.
      const attacker = findUnit(state, action.attackerUnitId)!
      const defender = findUnit(state, action.defenderUnitId)!
      const dispute = createCombatDispute(attacker, defender, now)
      const units = state.units.map(u =>
        u.id === attacker.id ? { ...u, hasAttacked: true } : u,
      )
      return {
        ok: true,
        state: {
          ...state,
          units,
          combatDisputes: [...state.combatDisputes, dispute],
        },
      }
    }
  }
}
