import { CitySpecialization, BuildingType } from './types.js'
import type { City, Resources } from './types.js'

// ─── Effect types ─────────────────────────────────────────────────────────────

/**
 * Discriminated union of all effect kinds a building can have.
 * Economy effects (multipliers) are applied each turn by economy.ts.
 * Non-economy effects (defense, era progress, score) are queried by combat /
 * era / scoring modules via the helper functions below.
 */
export type BuildingEffect =
  | { type: 'productionMultiplier'; value: number }
  | { type: 'goldMultiplier';       value: number }
  | { type: 'foodMultiplier';       value: number }
  | { type: 'cityDefenseBonus';     value: number }
  | { type: 'eraProgressBonus';     value: number }
  | { type: 'scoreBonus';           value: number }

// ─── BuildingDefinition ───────────────────────────────────────────────────────

export interface BuildingDefinition {
  readonly type:              BuildingType
  readonly name:              string
  readonly specialization:    CitySpecialization
  /** Production resource paid upfront to start construction. */
  readonly productionCost:    number
  /** Turns from start to completion. */
  readonly constructionTurns: number
  readonly effect:            BuildingEffect
  readonly description:       string
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const CATALOG_ENTRIES: readonly BuildingDefinition[] = [
  // ── Military ─────────────────────────────────────────────────────────────
  {
    type:              BuildingType.Barracks,
    name:              'Quartel',
    specialization:    CitySpecialization.Military,
    productionCost:    8,
    constructionTurns: 3,
    effect:            { type: 'productionMultiplier', value: 1.5 },
    description:       'Aumenta a produção da cidade em 50%. Treina unidades mais rapidamente.',
  },
  {
    type:              BuildingType.Wall,
    name:              'Muralha',
    specialization:    CitySpecialization.Military,
    productionCost:    12,
    constructionTurns: 4,
    effect:            { type: 'cityDefenseBonus', value: 5 },
    description:       'Concede +5 de defesa a todas as unidades dentro dos limites da cidade.',
  },
  // ── Commercial ───────────────────────────────────────────────────────────
  {
    type:              BuildingType.Market,
    name:              'Mercado',
    specialization:    CitySpecialization.Commercial,
    productionCost:    10,
    constructionTurns: 2,
    effect:            { type: 'goldMultiplier', value: 1.5 },
    description:       'Aumenta a produção de ouro em 50%.',
  },
  {
    type:              BuildingType.Port,
    name:              'Porto',
    specialization:    CitySpecialization.Commercial,
    productionCost:    15,
    constructionTurns: 3,
    effect:            { type: 'foodMultiplier', value: 1.3 },
    description:       'Rede de pesca costeira — aumenta a produção de alimento em 30%.',
  },
  // ── Scientific ───────────────────────────────────────────────────────────
  {
    type:              BuildingType.Library,
    name:              'Biblioteca',
    specialization:    CitySpecialization.Scientific,
    productionCost:    10,
    constructionTurns: 3,
    effect:            { type: 'eraProgressBonus', value: 1 },
    description:       'Gera 1 ponto de pesquisa por turno, acelerando a progressão de era.',
  },
  {
    type:              BuildingType.Temple,
    name:              'Templo',
    specialization:    CitySpecialization.Scientific,
    productionCost:    10,
    constructionTurns: 4,
    effect:            { type: 'scoreBonus', value: 10 },
    description:       'Concede +10 pontos de pontuação cultural ao final da partida.',
  },
]

export const BUILDING_CATALOG: ReadonlyMap<BuildingType, BuildingDefinition> = new Map(
  CATALOG_ENTRIES.map(d => [d.type, d]),
)

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getBuildingDef(type: BuildingType): BuildingDefinition {
  const def = BUILDING_CATALOG.get(type)
  if (!def) throw new Error(`Unknown BuildingType: ${type}`)
  return def
}

/** All building definitions that belong to a given city specialization. */
export function getBuildingsBySpecialization(
  spec: CitySpecialization,
): readonly BuildingDefinition[] {
  return CATALOG_ENTRIES.filter(d => d.specialization === spec)
}

// ─── City-level operations ────────────────────────────────────────────────────

/**
 * Whether `type` can be built in `city` right now.
 * Fails when: wrong specialization, already built, or construction already queued.
 */
export function canBuildBuilding(city: City, type: BuildingType): boolean {
  const def = getBuildingDef(type)
  if (def.specialization !== city.specialization) return false
  if ((city.buildings ?? []).includes(type)) return false
  if (city.construction != null) return false
  return true
}

/**
 * Begins construction of `type` in `city`. Does NOT deduct resources — the
 * caller is responsible for checking `canBuildBuilding` and paying the cost.
 * Returns a new City with `construction` set.
 */
export function startConstruction(city: City, type: BuildingType): City {
  const def = getBuildingDef(type)
  return {
    ...city,
    construction: {
      buildingType:   type,
      turnsRemaining: def.constructionTurns,
      totalTurns:     def.constructionTurns,
    },
  }
}

/**
 * Advances the active construction by one turn. When `turnsRemaining` reaches
 * zero the building moves to `city.buildings` and `construction` is cleared.
 * Pure: returns a new City; city without active construction is returned as-is.
 */
export function tickConstruction(city: City): City {
  if (!city.construction) return city
  const remaining = city.construction.turnsRemaining - 1
  if (remaining <= 0) {
    return {
      ...city,
      buildings:    [...(city.buildings ?? []), city.construction.buildingType],
      construction: null,
    }
  }
  return {
    ...city,
    construction: { ...city.construction, turnsRemaining: remaining },
  }
}

// ─── Effect aggregators ───────────────────────────────────────────────────────

/**
 * Applies economy-affecting building effects (gold / food / production
 * multipliers) to a base `Resources` value.
 * Effects are multiplicative and applied in catalog order.
 */
export function applyBuildingBonuses(
  buildings: readonly BuildingType[],
  resources:  Resources,
): Resources {
  let { gold, food, production } = resources
  for (const type of buildings) {
    const e = getBuildingDef(type).effect
    switch (e.type) {
      case 'goldMultiplier':       gold       = Math.round(gold       * e.value); break
      case 'foodMultiplier':       food       = Math.round(food       * e.value); break
      case 'productionMultiplier': production = Math.round(production * e.value); break
      // Non-economy effects handled by their respective modules
    }
  }
  return { gold, food, production }
}

/** Sum of `cityDefenseBonus` across all completed buildings. */
export function getCityDefenseBonus(buildings: readonly BuildingType[]): number {
  return buildings.reduce((sum, type) => {
    const e = getBuildingDef(type).effect
    return e.type === 'cityDefenseBonus' ? sum + e.value : sum
  }, 0)
}

/** Sum of `eraProgressBonus` across all completed buildings (research pts / turn). */
export function getCityEraProgressBonus(buildings: readonly BuildingType[]): number {
  return buildings.reduce((sum, type) => {
    const e = getBuildingDef(type).effect
    return e.type === 'eraProgressBonus' ? sum + e.value : sum
  }, 0)
}

/** Sum of `scoreBonus` across all completed buildings (end-game points). */
export function getCityScoreBonus(buildings: readonly BuildingType[]): number {
  return buildings.reduce((sum, type) => {
    const e = getBuildingDef(type).effect
    return e.type === 'scoreBonus' ? sum + e.value : sum
  }, 0)
}
