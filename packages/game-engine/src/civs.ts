// ─── Civilization definitions ─────────────────────────────────────────────────
// Pure data — no I/O, no DOM. Safe to import in engine, web, and Edge Functions.

export interface CivDefinition {
  readonly id:           string
  readonly name:         string
  readonly flag:         string  // emoji
  readonly color:        string  // player color in-game
  readonly unlockLevel:  number  // minimum player level required
  readonly description:  string
}

export const CIVILIZATIONS: readonly CivDefinition[] = [
  { id: 'romans',    name: 'Romanos',   flag: '🏛️', color: '#ef4444', unlockLevel: 1, description: 'Mestres da engenharia e da lei.' },
  { id: 'greeks',    name: 'Gregos',    flag: '⚡',  color: '#3b82f6', unlockLevel: 1, description: 'Filósofos e estrategistas.' },
  { id: 'vikings',   name: 'Vikings',   flag: '⚔️',  color: '#6b7280', unlockLevel: 3, description: 'Guerreiros do norte inclemente.' },
  { id: 'egyptians', name: 'Egípcios',  flag: '☀️',  color: '#f59e0b', unlockLevel: 4, description: 'Construtores de civilizações eternas.' },
  { id: 'mongols',   name: 'Mongóis',   flag: '🏹',  color: '#22c55e', unlockLevel: 6, description: 'Conquistadores das estepes sem fim.' },
  { id: 'china',     name: 'China',     flag: '🐉',  color: '#c0392b', unlockLevel: 8, description: 'Comércio e tecnologia avançada.' },
] as const

// ─── Level / XP ──────────────────────────────────────────────────────────────

/** Minimum XP required for each level (index 0 = level 1). */
export const LEVEL_XP_THRESHOLDS = [0, 50, 150, 300, 500, 750, 1050, 1400, 1800] as const

/** XP gained per completed game (base; added for playing regardless of result). */
export const XP_FOR_PLAYING  = 10
/** Bonus XP for winning a regular game. */
export const XP_WIN_BONUS    = 25
/** Base XP for a daily challenge (replaces XP_FOR_PLAYING). */
export const XP_DAILY_BASE   = 15
/** Bonus XP for winning a daily challenge (on top of XP_DAILY_BASE). */
export const XP_DAILY_WIN    = 35

export function xpToLevel(xp: number): number {
  for (let i = LEVEL_XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_XP_THRESHOLDS[i]!) return i + 1
  }
  return 1
}

/** XP required to reach the next level (Infinity if already max level). */
export function xpForNextLevel(currentLevel: number): number {
  return LEVEL_XP_THRESHOLDS[currentLevel] ?? Infinity
}

/** XP progress within the current level: [current, required]. */
export function xpProgress(xp: number): [number, number] {
  const level = xpToLevel(xp)
  const thisFloor = LEVEL_XP_THRESHOLDS[level - 1] ?? 0
  const nextCeil  = LEVEL_XP_THRESHOLDS[level] ?? xp
  return [xp - thisFloor, nextCeil - thisFloor]
}

/** All civilizations unlocked at `xp`. */
export function unlockedCivs(xp: number): readonly CivDefinition[] {
  const level = xpToLevel(xp)
  return CIVILIZATIONS.filter(c => c.unlockLevel <= level)
}

/** Look up a civilization by id (falls back to romans). */
export function getCiv(id: string): CivDefinition {
  return CIVILIZATIONS.find(c => c.id === id) ?? CIVILIZATIONS[0]!
}
