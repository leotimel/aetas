import { TurnState, CombatDisputeStatus, Era } from './types.js'
import type { GameState, Player, CombatDispute } from './types.js'
import { updateFogOfWar } from './map.js'
import { determineWinner as computeWinner, finalizeIfDominated } from './scoring.js'
import { processTurnEconomy, applyUnitMaintenance, cityMaxHp } from './economy.js'
import { getCivEconomyMultipliers } from './civilizations.js'
import { getCityEraProgressBonus } from './buildings.js'
import { wonderEconomyMultipliers, wonderEraProgressBonus } from './wonders.js'

const ERA_ORDER = [Era.Ancient, Era.Classical, Era.Medieval] as const
const ERA_SCIENCE_THRESHOLDS = [5, 5] as const // Ancient→Classical: 5, Classical→Medieval: 5
export const ERA_ORDER_ARRAY: readonly Era[] = ERA_ORDER
export const ERA_SCIENCE_THRESHOLDS_ARRAY: readonly number[] = ERA_SCIENCE_THRESHOLDS

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
  // Then unit maintenance (a flat gold cost) is deducted AFTER the income multiplier.
  let actorUnderMaintenance = false
  const actor = players.find(p => p.id === actorId)
  if (actor) {
    const actorCities = cities.filter(c => c.ownerId === actorId)
    const preResources = { ...actor.resources }
    const { updatedCities, updatedResources } = processTurnEconomy(actorCities, actor.resources, state.map.tiles)
    const updatedById = new Map(updatedCities.map(c => [c.id, c]))
    cities = cities.map(c => updatedById.get(c.id) ?? c)
    const m = getCivEconomyMultipliers(actor.civilizationId)
    // Wonders (ENT-5) stack on top of the civ multiplier, owner-wide.
    const wm = wonderEconomyMultipliers(state, actorId)
    actor.resources = {
      gold:       Math.round(preResources.gold       + (updatedResources.gold       - preResources.gold)       * m.gold       * wm.gold),
      food:       Math.round(preResources.food       + (updatedResources.food       - preResources.food)       * m.food       * wm.food),
      production: Math.round(preResources.production + (updatedResources.production - preResources.production) * m.production * wm.production),
    }
    // Aztec Expansão Ritual: flat production bonus per captured city
    if (actor.conquestBonusProduction) {
      actor.resources = {
        ...actor.resources,
        production: actor.resources.production + actor.conquestBonusProduction,
      }
    }
    const actorUnitCount = state.units.filter(u => u.ownerId === actorId).length
    const maint = applyUnitMaintenance(actor.resources.gold, actorUnitCount)
    actor.resources = { ...actor.resources, gold: maint.gold }
    actorUnderMaintenance = maint.underMaintenance
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
  // Shares finalizeIfDominated with actions.ts so the mid-turn (city capture)
  // and end-of-turn paths apply an identical domination rule.
  if (activeNow.length <= 1) {
    return { ok: true, state: finalizeIfDominated({ ...working, currentPlayerId: actorId }) }
  }

  // Step 5(b) — game ends after maxTurns complete rounds.
  if (wrap && state.turnNumber === state.maxTurns) {
    const winner = hooks.determineWinner ? hooks.determineWinner(working) : computeWinner(working)
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
  const units = state.units.map(u => {
    if (u.ownerId === actorId) return { ...u, isUnderMaintenance: actorUnderMaintenance }
    if (u.ownerId === nextId)  return { ...u, hasMoved: false, hasAttacked: false, isUnderMaintenance: false }
    return u
  })
  const nextCities = working.cities.map(c =>
    c.ownerId === nextId
      ? { ...c, hp: Math.min(cityMaxHp(c.level), (c.hp ?? cityMaxHp(c.level)) + 1), maxHp: cityMaxHp(c.level) }
      : c,
  )

  // Step 6b — recompute fog for the next player so they see tiles around their
  // current unit/city positions at the start of their turn.
  let nextFogOfWar = working.fogOfWar
  if (nextId) {
    const nextFogEntry = working.fogOfWar.find(f => f.playerId === nextId)
    if (nextFogEntry) {
      const nextPlayerUnits  = units.filter(u => u.ownerId === nextId)
      const nextPlayerCities = nextCities.filter(c => c.ownerId === nextId)
      const updatedFog = updateFogOfWar(nextFogEntry, nextPlayerUnits, nextPlayerCities, state.map.radius)
      nextFogOfWar = working.fogOfWar.map(f => f.playerId === nextId ? updatedFog : f)
    }
  }

  // Step 6.5 — accumulate science from the actor's cities; advance era when threshold reached.
  const eraIdx = ERA_ORDER.indexOf(working.era as Era)
  let nextEra: Era = working.era as Era
  let nextEraProgress = working.eraProgress ?? 0
  if (eraIdx >= 0 && eraIdx < ERA_ORDER.length - 1) {
    const threshold = ERA_SCIENCE_THRESHOLDS[eraIdx]
    const actorCities = working.cities.filter(c => c.ownerId === actorId)
    const science = 1 + actorCities.reduce(
      (s, c) => s + getCityEraProgressBonus(c.buildings ?? []) + wonderEraProgressBonus(working, c.id), 0,
    )
    nextEraProgress += science
    if (nextEraProgress >= threshold) {
      nextEra = ERA_ORDER[eraIdx + 1] as Era
      nextEraProgress -= threshold
    }
  }

  return {
    ok: true,
    state: {
      ...working,
      units,
      cities: nextCities,
      fogOfWar: nextFogOfWar,
      era: nextEra,
      eraProgress: nextEraProgress,
      currentPlayerId: nextId ?? actorId,
      turnNumber: state.turnNumber + (wrap ? 1 : 0),
      turnState: TurnState.WaitingForAction,
    },
  }
}
