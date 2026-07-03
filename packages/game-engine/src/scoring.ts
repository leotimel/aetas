import { TurnState } from './types.js'
import type { GameState, City, BuiltWonder } from './types.js'
import { WONDER_CATALOG } from './wonders.js'

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
 * Computes the score for `playerId` given the full cities array. Pure: only the
 * cities owned by `playerId` are counted. `wonders` is optional (backward compat,
 * like computeCityProduction's allCities/tiles); when supplied, each scoreBonus
 * wonder the player owns folds into the development component.
 */
export function computePlayerScore(
  playerId: string,
  cities: readonly City[],
  wonders: readonly BuiltWonder[] = [],
): PlayerScore {
  const owned = cities.filter(c => c.ownerId === playerId)
  const territory   = owned.length * TERRITORY_POINTS_PER_CITY
  const population  = owned.reduce((s, c) => s + c.population, 0) * POPULATION_POINTS_PER_POP
  const wonderPts   = wonders.reduce((s, w) => {
    if (w.ownerId !== playerId) return s
    const e = WONDER_CATALOG.get(w.wonderId)?.effect
    return e?.type === 'scoreBonus' ? s + e.value : s
  }, 0)
  const development = owned.reduce((s, c) => s + c.level, 0) * DEVELOPMENT_POINTS_PER_LEVEL + wonderPts
  return { playerId, territory, population, development, total: territory + population + development }
}

/**
 * Convenience wrapper that takes a full GameState instead of a cities array.
 * Used by web components that have the state available.
 */
export function scorePlayer(state: GameState, playerId: string): PlayerScore {
  return computePlayerScore(playerId, state.cities, state.wonders ?? [])
}

/**
 * Scores all players (including eliminated) keyed by playerId.
 */
export function scoreAll(state: GameState): Record<string, PlayerScore> {
  return Object.fromEntries(
    state.players.map(p => [p.id, computePlayerScore(p.id, state.cities, state.wonders ?? [])])
  )
}

/**
 * Returns active (non-eliminated) players ranked by total score descending.
 * Ties broken by playerId ascending (deterministic).
 */
export function rankPlayers(state: GameState): PlayerScore[] {
  return state.players
    .filter(p => !p.isEliminated)
    .map(p => computePlayerScore(p.id, state.cities, state.wonders ?? []))
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
 * Domination end-game rule, single-sourced. If ≤1 player remains active,
 * returns a finished state with the lone survivor as winner (or null on
 * mutual annihilation). Otherwise returns the input unchanged (same ref).
 * Called mid-turn after a city capture (actions.ts) and at end-of-turn (turn.ts).
 */
export function finalizeIfDominated(state: GameState): GameState {
  const active = state.players.filter(p => !p.isEliminated)
  if (active.length > 1) return state
  return {
    ...state,
    isFinished: true,
    winner: active[0]?.id ?? null,
    turnState: TurnState.Completed,
  }
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
