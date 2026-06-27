import { CombatDisputeStatus, TerrainType } from './types.js'
import type { GameState, Unit, Player, Resources, HexCoord } from './types.js'
import { canSubmitAction } from './turn.js'
import { resolveCombat, terrainAt } from './combat.js'
import { hexDistance, hexNeighbors, hexKey } from './map.js'
import { haveMadeContact, relationBetween } from './diplomacy.js'
import { validateAction, applyAction, type GameAction } from './actions.js'
import { unitsForCiv } from './civilizations.js'
import { getBuildingsBySpecialization } from './buildings.js'
import { cityMaxHp } from './economy.js'

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

const MAP_CENTER: HexCoord = { q: 0, r: 0 }

/**
 * Advances each of the AI's not-yet-moved units one hex toward the nearest enemy
 * it can see (unit or city), or toward the map centre when it sees no enemy (so
 * it explores instead of standing still). Only single-hex steps — no pathfinding —
 * which keeps the result deterministic and always within movement range. Folds
 * each `moveUnit` onto the working state; only emits pre-validated actions.
 *
 * Vision uses the player's fog of war: enemies on non-visible hexes are ignored.
 * When the player has no fog entry (some unit tests), everything counts as visible.
 */
function planMovement(
  state: GameState,
  playerId: string,
  now: number,
): { state: GameState; actions: GameAction[] } {
  let s = state
  const actions: GameAction[] = []

  const fog = s.fogOfWar.find(f => f.playerId === playerId)
  const visibleKeys = fog ? new Set(fog.visibleHexes.map(hexKey)) : null
  const isVisible = (pos: HexCoord): boolean => visibleKeys === null || visibleKeys.has(hexKey(pos))

  const myUnits = s.units.filter(u => u.ownerId === playerId).slice().sort(byId)
  for (const unit of myUnits) {
    // Re-read from the working state (an earlier move/defense may have changed it).
    const current = s.units.find(u => u.id === unit.id)
    if (!current || current.hasMoved) continue

    // Nearest visible enemy unit or city; fall back to the map centre when blind.
    const targets: HexCoord[] = [
      ...s.units.filter(u => u.ownerId !== playerId && isVisible(u.position)),
      ...s.cities.filter(c => c.ownerId !== playerId && isVisible(c.position)),
    ]
      .slice()
      .sort(byId)
      .map(t => t.position)

    let targetPos = MAP_CENTER
    let best = Infinity
    for (const pos of targets) {
      const d = hexDistance(current.position, pos)
      if (d < best) { best = d; targetPos = pos }
    }

    const distToTarget = hexDistance(current.position, targetPos)
    if (distToTarget === 0) continue // already on it (e.g. sitting on the centre)

    // Pick the adjacent hex that gets closest to the target and is legal to enter.
    const candidates = hexNeighbors(current.position)
      .slice()
      .sort((a, b) => hexKey(a).localeCompare(hexKey(b)))

    let stepTo: HexCoord | null = null
    let stepDist = distToTarget // must strictly improve to move
    for (const n of candidates) {
      const tile = s.map.tiles.find(t => hexKey(t.coord) === hexKey(n))
      if (!tile || tile.terrainType === TerrainType.Water) continue
      if (s.units.some(u => hexKey(u.position) === hexKey(n))) continue
      const d = hexDistance(n, targetPos)
      if (d < stepDist) { stepDist = d; stepTo = n }
    }
    if (!stepTo) continue

    const action: GameAction = { type: 'moveUnit', unitId: current.id, targetCoord: stepTo }
    if (validateAction(s, playerId, action, now).valid) {
      actions.push(action)
      const applied = applyAction(s, playerId, action, now)
      if (applied.ok) s = applied.state
    }
  }

  return { state: s, actions }
}

/**
 * Besieges adjacent enemy cities. For each of the AI's not-yet-attacked units (by id),
 * attacks the first adjacent enemy city that is "worth it": either already low on HP
 * (<= 40% max) or surrounded by 2+ of the AI's units. One attack per unit (attackCity
 * sets hasAttacked). Runs AFTER the unit combat loop, so a unit that already initiated
 * combat this turn is skipped automatically. Only emits pre-validated actions.
 */
function planCityAttack(
  state: GameState,
  playerId: string,
  now: number,
): { state: GameState; actions: GameAction[] } {
  let s = state
  const actions: GameAction[] = []

  const myUnits = s.units.filter(u => u.ownerId === playerId).slice().sort(byId)
  for (const unit of myUnits) {
    const current = s.units.find(u => u.id === unit.id)
    if (!current || current.hasAttacked) continue

    const targets = s.cities
      .filter(c => c.ownerId !== playerId && hexDistance(current.position, c.position) === 1)
      .slice()
      .sort(byId)

    for (const city of targets) {
      const maxHp = cityMaxHp(city.level)
      const hp = city.hp ?? maxHp
      const adjMine = s.units.filter(
        u => u.ownerId === playerId && hexDistance(u.position, city.position) === 1,
      ).length
      const worth = hp <= maxHp * 0.7 || adjMine >= 1
      if (!worth) continue

      const action: GameAction = { type: 'attackCity', unitId: current.id, cityId: city.id }
      if (validateAction(s, playerId, action, now).valid) {
        actions.push(action)
        const applied = applyAction(s, playerId, action, now)
        if (applied.ok) s = applied.state
        break // one attack per unit
      }
    }
  }

  return { state: s, actions }
}

/**
 * Trains one reinforcement per turn (anti-snowball) when the AI is below a unit cap
 * and can afford the cheapest non-settler unit available to its civilization in the
 * current era. The unit type is DERIVED from `unitsForCiv` (not hardcoded), so civs
 * whose special unit replaces the Warrior still train correctly. Deterministic unitId
 * from the city id + turn number. Only emits pre-validated actions.
 */
function planUnitTraining(
  state: GameState,
  playerId: string,
  now: number,
): { state: GameState; actions: GameAction[] } {
  let s = state
  const actions: GameAction[] = []

  const cap = Math.max(3, Math.ceil(s.maxTurns / 2))
  const myUnitCount = s.units.filter(u => u.ownerId === playerId).length
  if (myUnitCount >= cap) return { state: s, actions }

  const player = s.players.find(p => p.id === playerId)
  if (!player) return { state: s, actions }

  // Cheapest non-founder unit the civ can train this era, that the AI can afford.
  // unitsForCiv throws on an unknown civ id; guard so a bad legacy row can't crash
  // the whole AI turn (same defensive pattern as getCivEconomyMultipliers).
  let affordable
  try {
    affordable = unitsForCiv(player.civilizationId, s.era)
      .filter(d => !d.canFoundCity)
      .slice()
      .sort((a, b) => a.productionCost - b.productionCost || a.type.localeCompare(b.type))
      .find(d => d.productionCost <= player.resources.production)
  } catch {
    return { state: s, actions }
  }
  if (!affordable) return { state: s, actions }

  const myCities = s.cities.filter(c => c.ownerId === playerId).slice().sort(byId)
  for (const city of myCities) {
    const unitId = `ai-u-${city.id.slice(0, 8)}-t${s.turnNumber}`
    const action: GameAction = { type: 'trainUnit', cityId: city.id, unitType: affordable.type, unitId }
    if (validateAction(s, playerId, action, now).valid) {
      actions.push(action)
      const applied = applyAction(s, playerId, action, now)
      if (applied.ok) s = applied.state
      break // one unit per turn
    }
  }

  return { state: s, actions }
}

/**
 * Starts construction of the cheapest building matching each city's specialization
 * that isn't built yet and that the AI can afford. At most one building per city per
 * turn. Only emits pre-validated actions.
 */
function planBuildingConstruction(
  state: GameState,
  playerId: string,
  now: number,
): { state: GameState; actions: GameAction[] } {
  let s = state
  const actions: GameAction[] = []

  const myCities = s.cities.filter(c => c.ownerId === playerId).slice().sort(byId)
  for (const city of myCities) {
    const current = s.cities.find(c => c.id === city.id)
    if (!current || current.construction != null) continue

    const built = new Set(current.buildings ?? [])
    const candidates = getBuildingsBySpecialization(current.specialization)
      .filter(b => !built.has(b.type))
      .slice()
      .sort((a, b) => a.productionCost - b.productionCost || a.type.localeCompare(b.type))

    for (const cand of candidates) {
      const action: GameAction = { type: 'constructBuilding', cityId: current.id, buildingType: cand.type }
      if (validateAction(s, playerId, action, now).valid) {
        actions.push(action)
        const applied = applyAction(s, playerId, action, now)
        if (applied.ok) s = applied.state
        break // one building per city per turn
      }
    }
  }

  return { state: s, actions }
}

/**
 * Active opponent AI. Defends, answers diplomacy, advances units toward the nearest
 * visible enemy (or explores when blind), attacks adjacent enemies, besieges weak
 * cities, trains reinforcements, builds, initiates diplomacy, then ends the turn.
 * Returns [] if it is not legally this player's turn. `hard=true` skips the +2
 * active-defense assumption when evaluating attacks (more aggressive).
 */
export function decideOpponentTurn(state: GameState, playerId: string, now: number, hard = false): GameAction[] {
  if (!canSubmitAction(state, playerId).valid) return []

  const defensive  = planDefensiveResponses(state, playerId, now)
  const diplomatic = planDiplomaticResponses(defensive.state, playerId, now)
  const movement   = planMovement(diplomatic.state, playerId, now)
  let s = movement.state
  const actions = [...defensive.actions, ...diplomatic.actions, ...movement.actions]

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

  const cityAttack = planCityAttack(s, playerId, now)
  s = cityAttack.state
  actions.push(...cityAttack.actions)

  const training = planUnitTraining(s, playerId, now)
  s = training.state
  actions.push(...training.actions)

  const building = planBuildingConstruction(s, playerId, now)
  s = building.state
  actions.push(...building.actions)

  const initiatives = planDiplomaticInitiatives(s, playerId, now)
  return [...actions, ...initiatives.actions, END_TURN]
}
