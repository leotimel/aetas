import { CombatDisputeStatus } from './types.js'
import type { GameState, Unit, Player, Resources } from './types.js'
import { canSubmitAction } from './turn.js'
import { resolveCombat, terrainAt } from './combat.js'
import { hexDistance } from './map.js'
import { haveMadeContact, relationBetween } from './diplomacy.js'
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
 * Pass `hard=true` to skip the +2 active-defense assumption (more aggressive).
 */
export function isFavorableAttack(state: GameState, attacker: Unit, defender: Unit, hard = false): boolean {
  const result = resolveCombat(attacker, defender, {
    defenderTerrain: terrainAt(state, defender.position),
    attackerTerrain: terrainAt(state, attacker.position),
    defenderActiveDefense: !hard,
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

const resourceTotal = (r: { gold: number; food: number; production: number }): number =>
  r.gold + r.food + r.production

/**
 * Folds responses to incoming diplomatic proposals into the working state. The AI
 * accepts non-aggression pacts and peace offers (it prefers stability), and accepts
 * a trade only when it nets a resource gain (offer total ≥ request total). Trades
 * it would lose on, it rejects. Deterministic (stable id ordering).
 */
function planDiplomaticResponses(
  state: GameState,
  playerId: string,
  now: number,
): { state: GameState; actions: GameAction[] } {
  let s = state
  const actions: GameAction[] = []
  const pending = s.diplomaticProposals
    .filter(p => p.status === 'pending' && p.targetId === playerId)
    .slice()
    .sort(byId)

  for (const proposal of pending) {
    const kind = proposal.kind ?? (proposal.terms ? 'trade' : 'pact')
    const accept = kind === 'trade'
      ? !!proposal.terms && resourceTotal(proposal.terms.offer) >= resourceTotal(proposal.terms.request)
      : true
    const action: GameAction = { type: 'respondToDiplomacy', proposalId: proposal.id, accept }
    if (validateAction(s, playerId, action, now).valid) {
      actions.push(action)
      const applied = applyAction(s, playerId, action, now)
      if (applied.ok) s = applied.state
    }
  }
  return { state: s, actions }
}

const isPair = (a1: string, b1: string, a2: string, b2: string): boolean =>
  (a1 === a2 && b1 === b2) || (a1 === b2 && b1 === a2)

/** Builds a trade favorable to the target: offer 5 of the AI's most-abundant resource, ask 3 of its scarcest. */
function aiFavorableTrade(me: Player): { offer: Resources; request: Resources } | null {
  const entries: [keyof Resources, number][] = [
    ['gold', me.resources.gold],
    ['food', me.resources.food],
    ['production', me.resources.production],
  ].sort((a, b) => (b[1] as number) - (a[1] as number)) as [keyof Resources, number][]

  const [giveKey, giveHave] = entries[0]
  const askKey = entries[2][0]
  const giveAmt = Math.min(5, giveHave)
  if (giveAmt <= 0 || askKey === giveKey) return null

  const offer: Resources = { gold: 0, food: 0, production: 0 }
  const request: Resources = { gold: 0, food: 0, production: 0 }
  offer[giveKey] = giveAmt
  request[askKey] = 3
  return { offer, request }
}

/**
 * The AI INITIATES at most one proposal per turn, so a human playing solo actually
 * receives diplomacy to accept/reject. Proposes a pact to a neutral contact (once —
 * never re-proposes one already rejected) or a favorable trade to a pact partner
 * (throttled to every 3rd turn). Only emits pre-validated, pre-applied actions.
 */
function planDiplomaticInitiatives(
  state: GameState,
  playerId: string,
  now: number,
): { state: GameState; actions: GameAction[] } {
  const me = state.players.find(p => p.id === playerId)
  if (!me) return { state, actions: [] }

  const contacts = state.players
    .filter(p => p.id !== playerId && !p.isEliminated && haveMadeContact(state, playerId, p.id))
    .slice()
    .sort(byId)

  for (const other of contacts) {
    const pendingBetween = state.diplomaticProposals.some(
      p => p.status === 'pending' && isPair(p.proposerId, p.targetId, playerId, other.id),
    )
    if (pendingBetween) continue

    const relation = relationBetween(state, playerId, other.id)
    let candidate: GameAction | null = null

    if (relation === 'neutral') {
      const alreadyOfferedPact = state.diplomaticProposals.some(
        p => (p.kind ?? (p.terms ? 'trade' : 'pact')) === 'pact' &&
             p.proposerId === playerId && p.targetId === other.id,
      )
      if (!alreadyOfferedPact) candidate = { type: 'proposePact', targetId: other.id }
    } else if (relation === 'pact') {
      const tradeTurns = state.diplomaticProposals
        .filter(p => (p.kind ?? (p.terms ? 'trade' : 'pact')) === 'trade' &&
                     p.proposerId === playerId && p.targetId === other.id)
        .map(p => p.createdAtTurn)
      const lastTradeTurn = tradeTurns.length ? Math.max(...tradeTurns) : -Infinity
      if (state.turnNumber - lastTradeTurn >= 3) {
        const terms = aiFavorableTrade(me)
        if (terms) candidate = { type: 'proposeTrade', targetId: other.id, offer: terms.offer, request: terms.request }
      }
    }

    if (candidate && validateAction(state, playerId, candidate, now).valid) {
      const applied = applyAction(state, playerId, candidate, now)
      if (applied.ok) return { state: applied.state, actions: [candidate] }
    }
  }

  return { state, actions: [] }
}

/**
 * Conservative substitute AI for an absent player. Defends, answers incoming
 * diplomacy, initiates one proposal of its own, then ends the turn. Returns [] if
 * it is not legally this player's turn.
 */
export function decideSubstituteTurn(state: GameState, playerId: string, now: number): GameAction[] {
  if (!canSubmitAction(state, playerId).valid) return []
  const defensive = planDefensiveResponses(state, playerId, now)
  const diplomatic = planDiplomaticResponses(defensive.state, playerId, now)
  const initiatives = planDiplomaticInitiatives(diplomatic.state, playerId, now)
  return [...defensive.actions, ...diplomatic.actions, ...initiatives.actions, END_TURN]
}

/**
 * Active opponent AI. Defends, then attacks adjacent enemies when favorable,
 * then ends the turn. Returns [] if it is not legally this player's turn.
 * `hard=true` skips the +2 active-defense assumption when evaluating attacks
 * (the AI becomes more aggressive — it takes fights Normal would skip).
 */
export function decideOpponentTurn(state: GameState, playerId: string, now: number, hard = false): GameAction[] {
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
      if (isFavorableAttack(s, current, enemy, hard) && validateAction(s, playerId, action, now).valid) {
        actions.push(action)
        const applied = applyAction(s, playerId, action, now)
        if (applied.ok) s = applied.state
        break // one attack per unit (hasAttacked is now set)
      }
    }
  }

  return [...actions, END_TURN]
}
