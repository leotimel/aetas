import { TurnState, CombatDisputeStatus } from './types.js'
import type { GameState, Player, CombatDispute } from './types.js'
import { processTurnEconomy } from './economy.js'
import { getCivEconomyMultipliers } from './civilizations.js'

// ─── Public types ─────────────────────────────────────────────────────────────

export type TurnValidation =
  | { valid: true }
  | { valid: false; reason: string }

/**
 * Hooks injected by modules that don't exist yet in phase 1.4:
 * - `resolveTimedOutDispute` will come from combat.ts (1.5): applies the real
 *   combat math when a dispute times out (may eliminate players).
 * - `determineWinner` will come from scoring.ts (1.8): picks the winner by
 *   combined score when the game ends at maxTurns.
 * When absent: timed-out disputes only flip status to ResolvedByTimeout (no
 * combat consequences) and the maxTurns winner stays null.
 */
export interface TurnHooks {
  resolveTimedOutDispute?: (dispute: CombatDispute, state: GameState) => GameState
  determineWinner?: (state: GameState) => string | null
}

export type EndTurnResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string; state: GameState }

// ─── Player queries ───────────────────────────────────────────────────────────

export function getPlayerById(state: GameState, id: string): Player | undefined {
  return state.players.find(p => p.id === id)
}

export function getCurrentPlayer(state: GameState): Player | undefined {
  return getPlayerById(state, state.currentPlayerId)
}

/** Non-eliminated players, preserving the fixed array (turn) order. */
export function activePlayers(players: readonly Player[]): Player[] {
  return players.filter(p => !p.isEliminated)
}

/**
 * The next non-eliminated player after `fromId`, cycling.
 * Anchored on `fromId`'s INDEX in the array — not on whether `fromId` is active —
 * so it still advances correctly when `fromId` was eliminated this very turn.
 * Returns `fromId` if it is the only active player; `null` if none are active.
 */
export function nextActivePlayerId(players: readonly Player[], fromId: string): string | null {
  const n = players.length
  const fromIndex = players.findIndex(p => p.id === fromId)
  if (fromIndex === -1) return null

  for (let step = 1; step <= n; step++) {
    const candidate = players[(fromIndex + step) % n]
    if (candidate && !candidate.isEliminated) return candidate.id
  }
  // No other active player; fall back to fromId if it is itself active.
  const from = players[fromIndex]
  return from && !from.isEliminated ? from.id : null
}

// ─── Action validation ────────────────────────────────────────────────────────

/**
 * Whether `playerId` may submit an action (move/attack/end turn) right now.
 * This is the single gate that enforces "only the current player acts".
 */
export function canSubmitAction(state: GameState, playerId: string): TurnValidation {
  if (state.isFinished) return { valid: false, reason: 'game finished' }

  const player = getPlayerById(state, playerId)
  if (!player) return { valid: false, reason: 'unknown player' }
  if (player.isEliminated) return { valid: false, reason: 'player eliminated' }
  if (playerId !== state.currentPlayerId) return { valid: false, reason: 'not your turn' }
  if (state.turnState !== TurnState.WaitingForAction) {
    return { valid: false, reason: 'turn not awaiting action' }
  }
  return { valid: true }
}

// ─── End of turn ──────────────────────────────────────────────────────────────

/**
 * Processes the end of `playerId`'s turn and advances the sequential state
 * machine. PURE: returns a brand-new GameState; never mutates the input.
 *
 * Concurrency note: the pure function alone cannot stop two near-simultaneous
 * "end turn" requests from both reading the pre-advance state. The Supabase Edge
 * Function (2.3) MUST wrap this in a transaction with a compare-and-swap guard on
 * (turnNumber, currentPlayerId) so only one write lands. A duplicate request from
 * the same player against the already-advanced state is rejected here by the
 * `playerId !== currentPlayerId` check. This function never emits TurnState.Processing.
 *
 * Operation order is deliberate — see inline steps. The wrap (round-completion)
 * flag is computed from the START-OF-TURN active set, BEFORE any eliminations
 * caused by resolving timed-out disputes; otherwise mid-turn eliminations would
 * corrupt the round counter.
 */
export function endTurn(
  state: GameState,
  playerId: string,
  now: number,
  hooks: TurnHooks = {},
): EndTurnResult {
  // Step 0 — validate; on failure return the original, untouched state.
  const validation = canSubmitAction(state, playerId)
  if (!validation.valid) {
    return { ok: false, reason: validation.reason, state }
  }

  const actorId = state.currentPlayerId

  // Step 1 — snapshot BEFORE any mutation. `wrap` is whether the actor is the
  // last active player in turn order at the moment the turn began.
  const activeAtStart = activePlayers(state.players)
  const wrap = activeAtStart[activeAtStart.length - 1]?.id === actorId

  // Build a working copy of the parts we may change. Players/cities get fresh
  // arrays and fresh objects only where they change, so the input stays intact.
  let players: Player[] = state.players.map(p => ({ ...p }))
  let cities = state.cities.map(c => ({ ...c }))
  let combatDisputes = state.combatDisputes.map(d => ({ ...d }))

  // Step 2 — economy for the actor only (civ bonus applied to income, not stockpile).
  const actor = players.find(p => p.id === actorId)
  if (actor) {
    const actorCities = cities.filter(c => c.ownerId === actorId)
    const preResources = { ...actor.resources }
    const { updatedCities, updatedResources } = processTurnEconomy(actorCities, actor.resources)
    const updatedById = new Map(updatedCities.map(c => [c.id, c]))
    cities = cities.map(c => updatedById.get(c.id) ?? c)
    const m = getCivEconomyMultipliers(actor.civilizationId)
    actor.resources = {
      gold:       Math.round(preResources.gold       + (updatedResources.gold       - preResources.gold)       * m.gold),
      food:       Math.round(preResources.food       + (updatedResources.food       - preResources.food)       * m.food),
      production: Math.round(preResources.production + (updatedResources.production - preResources.production) * m.production),
    }
  }

  // Step 3 — resolve expired disputes (deterministic order by id).
  combatDisputes.sort((a, b) => a.id.localeCompare(b.id))
  let working: GameState = { ...state, players, cities, combatDisputes }
  for (const dispute of combatDisputes) {
    if (dispute.status === CombatDisputeStatus.Pending && now >= dispute.expiresAt) {
      dispute.status = CombatDisputeStatus.ResolvedByTimeout
      if (hooks.resolveTimedOutDispute) {
        working = hooks.resolveTimedOutDispute(dispute, working)
        // The hook may have produced new player/city arrays (e.g. eliminations).
        players = working.players
        cities = working.cities
      }
    }
  }
  // Reconcile working with the latest mutable arrays.
  working = { ...working, players, cities, combatDisputes }

  // Step 4 — recompute active set AFTER resolution.
  const activeNow = activePlayers(players)

  // Step 5(a) — last player standing (or mutual annihilation) wins immediately.
  if (activeNow.length <= 1) {
    return {
      ok: true,
      state: {
        ...working,
        currentPlayerId: actorId,
        turnState: TurnState.Completed,
        isFinished: true,
        winner: activeNow[0]?.id ?? null,
      },
    }
  }

  // Step 5(b) — game ends after maxTurns complete rounds.
  if (wrap && state.turnNumber === state.maxTurns) {
    const winner = hooks.determineWinner ? hooks.determineWinner(working) : null
    return {
      ok: true,
      state: {
        ...working,
        currentPlayerId: actorId,
        turnState: TurnState.Completed,
        isFinished: true,
        winner,
      },
    }
  }

  // Step 6 — advance to the next active player + reset their units + regen their cities.
  const nextId = nextActivePlayerId(players, actorId)
  const units = state.units.map(u =>
    u.ownerId === nextId ? { ...u, hasMoved: false, hasAttacked: false } : u,
  )
  const nextCities = working.cities.map(c =>
    c.ownerId === nextId
      ? { ...c, hp: Math.min(c.maxHp ?? 10, (c.hp ?? 10) + 1), maxHp: c.maxHp ?? 10 }
      : c,
  )
  return {
    ok: true,
    state: {
      ...working,
      units,
      cities: nextCities,
      currentPlayerId: nextId ?? actorId,
      turnNumber: state.turnNumber + (wrap ? 1 : 0),
      turnState: TurnState.WaitingForAction,
    },
  }
}
