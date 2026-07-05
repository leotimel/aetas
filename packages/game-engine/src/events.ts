import { TerrainType, UnitType, BARBARIAN_OWNER_ID } from './types.js'
import type { GameState, HexCoord, WorldEvent, WorldEventType } from './types.js'
import { rngForTurn } from './prng.js'
import { hexKey, hexDistance, hexesInRadius } from './map.js'
import { createUnitInstance } from './units.js'
import { resolveCombatImmediate } from './combat.js'
import { cityMaxHp } from './economy.js'

// ─── Tuning (deterministic; tweak via playtesting) ─────────────────────────────

/** No events before this round — early game stays calm. */
export const EVENT_START_TURN = 5
/** Chance per round (from EVENT_START_TURN) that an event fires at all. */
export const EVENT_CHANCE = 0.30
/** Golden Age duration in full rounds. */
export const GOLDEN_AGE_DURATION = 3
/** HP a besieging barbarian chips off an adjacent city each round (floored at 1). */
export const BARB_CITY_DAMAGE = 3

/** Weighted event-type table. Cumulative thresholds over a single [0,1) draw. */
const TYPE_WEIGHTS: readonly (readonly [WorldEventType, number])[] = [
  ['barbarians', 0.40],
  ['plague',     0.35],
  ['goldenAge',  0.25],
]

function pickType(roll: number): WorldEventType {
  let acc = 0
  for (const [type, w] of TYPE_WEIGHTS) {
    acc += w
    if (roll < acc) return type
  }
  return TYPE_WEIGHTS[TYPE_WEIGHTS.length - 1]![0]
}

// ─── Barbarian behaviour (no RNG — pure function of board state) ────────────────

function isLand(state: GameState, coord: HexCoord): boolean {
  const tile = state.map.tiles.find(t => hexKey(t.coord) === hexKey(coord))
  return tile !== undefined &&
    tile.terrainType !== TerrainType.Water &&
    tile.terrainType !== TerrainType.Mountain
}

/**
 * Active barbarians: each stationary barbarian unit attacks one adjacent enemy
 * unit (weakest first), or besieges an adjacent city (chip HP, never capture).
 * Deterministic: barbarians processed by id, targets tie-broken by id.
 */
function resolveBarbarianAttacks(state: GameState): GameState {
  let s = state
  const barbIds = s.units
    .filter(u => u.ownerId === BARBARIAN_OWNER_ID)
    .map(u => u.id)
    .sort()

  for (const barbId of barbIds) {
    const barb = s.units.find(u => u.id === barbId)
    if (!barb) continue // died to a counterattack earlier this pass

    // Prefer an adjacent enemy unit — weakest hp first, then id.
    const targets = s.units
      .filter(u => u.ownerId !== BARBARIAN_OWNER_ID && hexDistance(barb.position, u.position) === 1)
      .sort((a, b) => a.stats.hp - b.stats.hp || a.id.localeCompare(b.id))

    if (targets[0]) {
      s = resolveCombatImmediate(s, barb, targets[0])
      continue
    }

    // No unit adjacent → besiege an adjacent city (deterministic by id). Never
    // captures or destroys: HP floored at 1, ownership untouched.
    const city = s.cities
      .filter(c => hexDistance(barb.position, c.position) === 1)
      .sort((a, b) => a.id.localeCompare(b.id))[0]
    if (city) {
      const curHp = city.hp ?? cityMaxHp(city.level)
      const nextHp = Math.max(1, curHp - BARB_CITY_DAMAGE)
      s = {
        ...s,
        cities: s.cities.map(c =>
          c.id === city.id ? { ...c, hp: nextHp, maxHp: cityMaxHp(c.level) } : c,
        ),
      }
    }
  }
  return s
}

// ─── Event application (each returns the new state + optional WorldEvent) ───────

function spawnBarbarian(
  state: GameState,
  round: number,
  rng: () => number,
): { state: GameState; event?: WorldEvent } {
  if (state.cities.length === 0) return { state }
  const city = state.cities[Math.floor(rng() * state.cities.length)]!

  const occupied = new Set<string>([
    ...state.units.map(u => hexKey(u.position)),
    ...state.cities.map(c => hexKey(c.position)),
  ])
  const candidates = hexesInRadius(city.position, 2)
    .filter(h => hexDistance(city.position, h) >= 1)
    .filter(h => isLand(state, h) && !occupied.has(hexKey(h)))
    .sort((a, b) => hexKey(a).localeCompare(hexKey(b)))

  if (candidates.length === 0) return { state } // fizzle — nowhere valid to spawn
  const spot = candidates[Math.floor(rng() * candidates.length)]!

  const barb = createUnitInstance(`barb-${round}-${city.id}`, UnitType.Warrior, BARBARIAN_OWNER_ID, spot)
  return {
    state: { ...state, units: [...state.units, barb] },
    event: { type: 'barbarians', round, cityId: city.id, cityName: city.name },
  }
}

function applyPlague(
  state: GameState,
  round: number,
  rng: () => number,
): { state: GameState; event?: WorldEvent } {
  if (state.cities.length === 0) return { state }
  const city = state.cities[Math.floor(rng() * state.cities.length)]!
  const cities = state.cities.map(c =>
    c.id === city.id ? { ...c, population: Math.max(1, c.population - 1) } : c,
  )
  return {
    state: { ...state, cities },
    event: { type: 'plague', round, cityId: city.id, cityName: city.name },
  }
}

function applyGoldenAge(state: GameState, round: number): { state: GameState; event?: WorldEvent } {
  return {
    state: { ...state, goldenAgeTurnsRemaining: GOLDEN_AGE_DURATION },
    event: { type: 'goldenAge', round },
  }
}

// ─── Public entry point ─────────────────────────────────────────────────────────

/**
 * Resolves world events at a round boundary. PURE and DETERMINISTIC by
 * (map.seed, round): same inputs → same events on the same turns, so the daily
 * challenge stays comparable. Injected into endTurn via TurnHooks (keeps turn.ts
 * free of the combat.ts dependency this pulls in). Runs once per round on wrap.
 *
 * Order (fixed for determinism):
 *  1. Existing barbarians attack (no RNG).
 *  2. Decrement an active Golden Age.
 *  3. From EVENT_START_TURN, roll at most one new event (barbarian spawn / plague
 *     / Golden Age). A freshly-set Golden Age is NOT decremented this round.
 *  4. Record fired events in `lastEvents` (barbarian attacks are silent).
 */
export function resolveWorldEvents(state: GameState, round: number): GameState {
  // 1 — active barbarians strike before any new spawn.
  let s = resolveBarbarianAttacks(state)

  // 2 — tick down an existing Golden Age (before a possible fresh set below).
  const remaining = s.goldenAgeTurnsRemaining ?? 0
  if (remaining > 0) s = { ...s, goldenAgeTurnsRemaining: remaining - 1 }

  // 3 — roll at most one new event.
  const events: WorldEvent[] = []
  if (round >= EVENT_START_TURN) {
    const rng = rngForTurn(s.map.seed, round)
    if (rng() < EVENT_CHANCE) {
      const type = pickType(rng())
      const applied =
        type === 'barbarians' ? spawnBarbarian(s, round, rng) :
        type === 'plague'     ? applyPlague(s, round, rng) :
                                applyGoldenAge(s, round)
      s = applied.state
      if (applied.event) events.push(applied.event)
    }
  }

  // 4 — expose fired events (empty array = nothing this round).
  return { ...s, lastEvents: events }
}
