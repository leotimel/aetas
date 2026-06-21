import type { GameState, City } from './types.js'

// ─── Score weights ─────────────────────────────────────────────────────────────
// These constants drive the combined score formula. Export them so clients can
// display the breakdown and future prompts can tune them without hunting magic numbers.

export const TERRITORY_POINTS_PER_CITY  = 10
export const POPULATION_POINTS_PER_POP  = 3
export const DEVELOPMENT_POINTS_PER_LEVEL = 5

// ─── Score types ──────────────────────────────────────────────────────────────

export interface PlayerScore {
  readonly playerId:   string
  readonly territory:  number  // cityCount × TERRITORY_POINTS_PER_CITY
  readonly population: number  // totalPopulation × POPULATION_POINTS_PER_POP
  readonly development: number // totalLevel × DEVELOPMENT_POINTS_PER_LEVEL
  readonly total:      number
}

// ─── Core computation ─────────────────────────────────────────────────────────

/** Pure per-player score from the current city array. Zero if no cities owned. */
export function computePlayerScore(playerId: string, cities: readonly City[]): PlayerScore {
  const owned = cities.filter(c => c.ownerId === playerId)
  const territory  = owned.length * TERRITORY_POINTS_PER_CITY
  const population = owned.reduce((s, c) => s + c.population, 0) * POPULATION_POINTS_PER_POP
  const development = owned.reduce((s, c) => s + c.level, 0) * DEVELOPMENT_POINTS_PER_LEVEL
  return { playerId, territory, population, development, total: territory + population + development }
}

/**
 * All non-eliminated players sorted by total score descending.
 * Tie-broken by playerId ascending (deterministic, no RNG).
 */
export function rankPlayers(state: GameState): PlayerScore[] {
  return state.players
    .filter(p => !p.isEliminated)
    .map(p => computePlayerScore(p.id, state.cities))
    .sort((a, b) => b.total - a.total || a.playerId.localeCompare(b.playerId))
}

/**
 * Returns the winner's playerId when one player leads outright.
 * Returns `null` on a tie (draw) or when no active players remain.
 *
 * Signature matches `TurnHooks.determineWinner` — pass this directly as the hook.
 */
export function determineWinner(state: GameState): string | null {
  const ranked = rankPlayers(state)
  if (ranked.length === 0) return null
  if (ranked.length === 1) return ranked[0]!.playerId
  if (ranked[0]!.total === ranked[1]!.total) return null
  return ranked[0]!.playerId
}

// ─── Elimination ──────────────────────────────────────────────────────────────

/**
 * Marks every ACTIVE player who owns zero cities as eliminated and removes
 * their units from the board (territory becomes neutral — no unit can exist
 * without a home base). Already-eliminated players are left unchanged.
 *
 * Pure: returns the input state unchanged if no new eliminations occur.
 */
export function eliminatePlayersWithNoCities(state: GameState): GameState {
  const ownerSet = new Set(state.cities.map(c => c.ownerId))
  const toEliminate = new Set(
    state.players
      .filter(p => !p.isEliminated && !ownerSet.has(p.id))
      .map(p => p.id),
  )

  if (toEliminate.size === 0) return state

  return {
    ...state,
    players: state.players.map(p =>
      toEliminate.has(p.id) ? { ...p, isEliminated: true } : p,
    ),
    units: state.units.filter(u => !toEliminate.has(u.ownerId)),
  }
}
