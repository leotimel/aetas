import { CombatDisputeStatus } from './types.js'
import type { GameState, Unit } from './types.js'
import { canSubmitAction } from './turn.js'
import { resolveCombat, terrainAt } from './combat.js'
import { hexDistance } from './map.js'
import { validateAction, applyAction, type GameAction } from './actions.js'

// ─────────────────────────────────────────────────────────────────────────────
// Two AIs with DIFFERENT purposes. Both produce a sequence of GameActions ending
// in `endTurn`, and both only ever emit actions that pass the SAME validateAction
// a human action passes. They are deterministic (stable id ordering, no RNG, no
// Date.now) and pure (fold a working copy; never mutate the input state).
//
//   decideSubstituteTurn — "position insurer" for an ABSENT player. Conservative:
//     defends its own pending disputes (active defense, strictly better than
//     letting them time out) and ends the turn. NEVER initiates combat ("não
//     declarar guerra"), NEVER escalates a dispute where it is the attacker. Its
//     goal is to NOT DISRUPT the game, not to play well.
//
//   decideOpponentTurn — fills empty slots / solo-vs-AI. MORE ACTIVE: does the
//     same defensive responses, then attacks adjacent enemies when the attack is
//     favorable. Still never throws away a unit ("não perder unidades de graça").
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether attacking `defender` with `attacker` is worth it. PESSIMISTIC by
 * design: it simulates the defender mounting an active defense (+2), because
 * the defender (or its own substitute AI) may respond before the dispute
 * resolves. Only favorable if the defender still dies AND the attacker survives.
 */
export function isFavorableAttack(state: GameState, attacker: Unit, defender: Unit): boolean {
  const result = resolveCombat(attacker, defender, {
    defenderTerrain: terrainAt(state, defender.position),
    attackerTerrain: terrainAt(state, attacker.position),
    defenderActiveDefense: true,
  })
  return result.defenderDestroyed && !result.attackerDestroyed
}

const byId = <T extends { id: string }>(a: T, b: T): number => a.id.localeCompare(b.id)

/** Pending disputes where `playerId` is the defender, in deterministic order. */
function defendableDisputes(state: GameState, playerId: string) {
  return state.combatDisputes
    .filter(d => d.status === CombatDisputeStatus.Pending && d.defenderPlayerId === playerId)
    .slice()
    .sort(byId)
}

/**
 * Folds defensive dispute responses into the working state, returning the
 * updated state and the actions taken. Shared by both AIs.
 */
function planDefensiveResponses(
  state: GameState,
  playerId: string,
  now: number,
): { state: GameState; actions: GameAction[] } {
  let s = state
  const actions: GameAction[] = []
  for (const dispute of defendableDisputes(s, playerId)) {
    const action: GameAction = { type: 'respondToDispute', disputeId: dispute.id }
    if (validateAction(s, playerId, action, now).valid) {
      actions.push(action)
      const applied = applyAction(s, playerId, action, now)
      if (applied.ok) s = applied.state
    }
  }
  return { state: s, actions }
}

const END_TURN: GameAction = { type: 'endTurn' }

/**
 * Conservative substitute AI for an absent player. Defends, then ends the turn.
 * Returns [] if it is not legally this player's turn (nothing to do).
 */
export function decideSubstituteTurn(state: GameState, playerId: string, now: number): GameAction[] {
  if (!canSubmitAction(state, playerId).valid) return []
  const { actions } = planDefensiveResponses(state, playerId, now)
  return [...actions, END_TURN]
}

/**
 * Active opponent AI. Defends, then attacks adjacent enemies when favorable,
 * then ends the turn. Returns [] if it is not legally this player's turn.
 */
export function decideOpponentTurn(state: GameState, playerId: string, now: number): GameAction[] {
  if (!canSubmitAction(state, playerId).valid) return []

  const defensive = planDefensiveResponses(state, playerId, now)
  let s = defensive.state
  const actions = [...defensive.actions]

  const myUnits = s.units.filter(u => u.ownerId === playerId).slice().sort(byId)
  for (const unit of myUnits) {
    // Re-read the unit from the working state (a defensive response may have changed it).
    const current = s.units.find(u => u.id === unit.id)
    if (!current) continue

    const enemies = s.units
      .filter(e => e.ownerId !== playerId && hexDistance(current.position, e.position) === 1)
      .slice()
      .sort(byId)

    for (const enemy of enemies) {
      const action: GameAction = {
        type: 'initiateCombat',
        attackerUnitId: current.id,
        defenderUnitId: enemy.id,
      }
      if (isFavorableAttack(s, current, enemy) && validateAction(s, playerId, action, now).valid) {
        actions.push(action)
        const applied = applyAction(s, playerId, action, now)
        if (applied.ok) s = applied.state
        break // one attack per unit (hasAttacked is now set)
      }
    }
  }

  return [...actions, END_TURN]
}
