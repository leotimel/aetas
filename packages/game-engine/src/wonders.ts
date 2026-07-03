import { Era } from './types.js'
import type { GameState } from './types.js'

// ─── World Wonders (ENT-5) ────────────────────────────────────────────────────
//
// Globally unique buildings: only ONE player in the world can own each wonder,
// and the first to build it locks it for everyone (enforced in actions.ts).
// Every effect here plugs into an aggregator site that is already live in the
// engine (turn.ts economy/era, combat.ts, scoring.ts) — no dead systems wired.
//
// Effect scope:
//   gold/food/productionMultiplier → owner-wide, applied to turn income.
//   eraProgressBonus               → the wonder's own city, applied to research.
//   scoreBonus                     → owner's end/live score.
//   combatMultiplier               → all of the owner's units in combat.

export type WonderEffect =
  | { readonly type: 'goldMultiplier';       readonly value: number }
  | { readonly type: 'foodMultiplier';       readonly value: number }
  | { readonly type: 'productionMultiplier'; readonly value: number }
  | { readonly type: 'eraProgressBonus';     readonly value: number }
  | { readonly type: 'scoreBonus';           readonly value: number }
  | { readonly type: 'combatMultiplier';     readonly value: number }

export interface WonderDefinition {
  readonly id:             string
  readonly name:           string
  readonly eraRequired:    Era
  readonly productionCost: number
  readonly effect:         WonderEffect
  readonly description:    string
}

// ─── Era ordering (local — mirrors units.ts; no exported era comparator) ──────

const ERA_RANK: Record<Era, number> = {
  [Era.Ancient]:   0,
  [Era.Classical]: 1,
  [Era.Medieval]:  2,
}

/** True if `current` is at least as advanced as `required`. */
export function eraAtLeast(current: Era, required: Era): boolean {
  return ERA_RANK[current] >= ERA_RANK[required]
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const CATALOG_ENTRIES: readonly WonderDefinition[] = [
  {
    id:             'hanging_gardens',
    name:           'Jardins Suspensos',
    eraRequired:    Era.Ancient,
    productionCost: 90,
    effect:         { type: 'foodMultiplier', value: 1.30 },
    description:    '+30% de comida em todas as cidades do dono.',
  },
  {
    id:             'grand_bazaar',
    name:           'Grande Bazar',
    eraRequired:    Era.Ancient,
    productionCost: 90,
    effect:         { type: 'goldMultiplier', value: 1.25 },
    description:    '+25% de ouro em todas as cidades do dono.',
  },
  {
    id:             'great_forge',
    name:           'Grande Forja',
    eraRequired:    Era.Classical,
    productionCost: 110,
    effect:         { type: 'productionMultiplier', value: 1.25 },
    description:    '+25% de produção em todas as cidades do dono.',
  },
  {
    id:             'great_library',
    name:           'Grande Biblioteca',
    eraRequired:    Era.Classical,
    productionCost: 100,
    effect:         { type: 'eraProgressBonus', value: 2 },
    description:    '+2 de pesquisa por turno na cidade que a abriga.',
  },
  {
    id:             'colosseum',
    name:           'Coliseu',
    eraRequired:    Era.Classical,
    productionCost: 100,
    effect:         { type: 'scoreBonus', value: 15 },
    description:    '+15 pontos de pontuação para o dono.',
  },
  {
    id:             'art_of_war',
    name:           'Arte da Guerra',
    eraRequired:    Era.Medieval,
    productionCost: 130,
    effect:         { type: 'combatMultiplier', value: 1.15 },
    description:    '+15% de dano em combate para todas as unidades do dono.',
  },
]

export const WONDER_CATALOG: ReadonlyMap<string, WonderDefinition> = new Map(
  CATALOG_ENTRIES.map(w => [w.id, w]),
)

/** All wonder definitions, for UIs that list the roster. */
export const WONDERS: readonly WonderDefinition[] = CATALOG_ENTRIES

/** Lookup a wonder definition; returns undefined for an unknown id. */
export function getWonderDef(id: string): WonderDefinition | undefined {
  return WONDER_CATALOG.get(id)
}

// ─── Effect aggregators ───────────────────────────────────────────────────────
//
// All read `state.wonders ?? []` and silently ignore unknown ids, so legacy
// saves and partial states stay safe (same defensive pattern as the civ
// aggregators in civilizations.ts).

/** Effect defs of the wonders owned by `ownerId`. */
function ownedEffects(state: GameState, ownerId: string): WonderEffect[] {
  const out: WonderEffect[] = []
  for (const built of state.wonders ?? []) {
    if (built.ownerId !== ownerId) continue
    const def = WONDER_CATALOG.get(built.wonderId)
    if (def) out.push(def.effect)
  }
  return out
}

/** Owner-wide economy multipliers from wonders (product of matching effects). */
export function wonderEconomyMultipliers(
  state: GameState,
  ownerId: string,
): { gold: number; food: number; production: number } {
  let gold = 1, food = 1, production = 1
  for (const e of ownedEffects(state, ownerId)) {
    if (e.type === 'goldMultiplier')       gold       *= e.value
    if (e.type === 'foodMultiplier')       food       *= e.value
    if (e.type === 'productionMultiplier') production *= e.value
  }
  return { gold, food, production }
}

/** Extra research/turn from wonders that sit in `cityId` (sum of eraProgressBonus). */
export function wonderEraProgressBonus(state: GameState, cityId: string): number {
  let sum = 0
  for (const built of state.wonders ?? []) {
    if (built.cityId !== cityId) continue
    const def = WONDER_CATALOG.get(built.wonderId)
    if (def?.effect.type === 'eraProgressBonus') sum += def.effect.value
  }
  return sum
}

/** Score points contributed by the wonders owned by `ownerId` (sum). */
export function wonderScoreBonus(state: GameState, ownerId: string): number {
  return ownedEffects(state, ownerId).reduce(
    (sum, e) => (e.type === 'scoreBonus' ? sum + e.value : sum),
    0,
  )
}

/** Combined combat multiplier for the owner's units (product of combatMultiplier). */
export function wonderCombatMultiplier(state: GameState, ownerId: string): number {
  return ownedEffects(state, ownerId).reduce(
    (acc, e) => (e.type === 'combatMultiplier' ? acc * e.value : acc),
    1,
  )
}
