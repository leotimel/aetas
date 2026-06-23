import type { GameState, City } from './types.js'

// ─── Constants ────────────────────────────────────────────────────────────────

export const TERRITORY_POINTS_PER_CITY    = 10
export const POPULATION_POINTS_PER_POP    = 3
export const DEVELOPMENT_POINTS_PER_LEVEL = 5

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerScore {
  playerId:    string
  territory:   number
  population:  number
  development: number
  total:       number
}

// ─── Core scoring functions ───────────────────────────────────────────────────

/**
 * Computes the score for `playerId` given the full cities array.
 * Pure: only the cities owned by `playerId` are counted.
 */
export function computePlayerScore(playerId: string, cities: readonly City[]): PlayerScore {
  const owned = cities.filter(c => c.ownerId === playerId)
  const territory   = owned.length * TERRITORY_POINTS_PER_CITY
  const population  = owned.reduce((s, c) => s + c.population, 0) * POPULATION_POINTS_PER_POP
  const development = owned.reduce((s, c) => s + c.level, 0) * DEVELOPMENT_POINTS_PER_LEVEL
  return { playerId, territory, population, development, total: territory + population + development }
}

/**
 * Convenience wrapper that takes a full GameState instead of a cities array.
 * Used by web components that have the state available.
 */
export function scorePlayer(state: GameState, playerId: string): PlayerScore {
  return computePlayerScore(playerId, state.cities)
}

/**
 * Scores all players (including eliminated) keyed by playerId.
 */
export function scoreAll(state: GameState): Record<string, PlayerScore> {
  return Object.fromEntries(
    state.players.map(p => [p.id, computePlayerScore(p.id, state.cities)])
  )
}

/**
 * Returns active (non-eliminated) players ranked by total score descending.
 * Ties broken by playerId ascending (deterministic).
 */
export function rankPlayers(state: GameState): PlayerScore[] {
  return state.players
    .filter(p => !p.isEliminated)
    .map(p => computePlayerScore(p.id, state.cities))
    .sort((a, b) =>
      b.total !== a.total
        ? b.total - a.total
        : a.playerId.localeCompare(b.playerId),
    )
}

/**
 * Returns the id of the highest-scoring active player, or null on a tie or
 * if there are no active players.
 */
export function determineWinner(state: GameState): string | null {
  const ranked = rankPlayers(state)
  if (ranked.length === 0) return null
  if (ranked.length >= 2 && ranked[0]!.total === ranked[1]!.total) return null
  return ranked[0]!.playerId
}

/**
 * Mid-game elimination: marks players who have no remaining cities as
 * isEliminated, and removes all their units from the board.
 * Returns the same state reference when no eliminations occur.
 */
export function eliminatePlayersWithNoCities(state: GameState): GameState {
  const toEliminate = state.players.filter(
    p => !p.isEliminated && !state.cities.some(c => c.ownerId === p.id),
  )
  if (toEliminate.length === 0) return state

  const eliminatedIds = new Set(toEliminate.map(p => p.id))
  return {
    ...state,
    players: state.players.map(p =>
      eliminatedIds.has(p.id) ? { ...p, isEliminated: true } : p,
    ),
    units: state.units.filter(u => !eliminatedIds.has(u.ownerId)),
  }
}
