import { CitySpecialization, TerrainType } from './types.js'
import type { City, Resources, HexTile } from './types.js'
import { applyBuildingBonuses, tickConstruction } from './buildings.js'
import { hexesInRadius, hexDistance, hexKey } from './map.js'

// ─── Constants ────────────────────────────────────────────────────────────────

export const BASE_GOLD_PER_POP = 1.5
export const BASE_FOOD_PER_POP = 2
export const BASE_PRODUCTION_PER_POP = 1.5

/** Gold each living unit costs its owner per turn (the gold sink). */
export const UNIT_MAINTENANCE_GOLD = 2

/** City HP máximo escalado por nível: nível 1=10, 2=15, 3=20. Pure. */
export function cityMaxHp(level: number): number {
  return 10 + (level - 1) * 5
}

/** Defesa de cidade contra siege (attackCity): 3 + nível. Pure. */
export function cityDefense(level: number): number {
  return 3 + level
}

/**
 * Deducts unit maintenance from a player's gold. Does NOT allow debt: gold floors
 * at 0, but the returned `underMaintenance` flag signals the deficit so callers can
 * apply the combat penalty. Pure.
 */
export function applyUnitMaintenance(
  gold: number,
  unitCount: number,
): { gold: number; underMaintenance: boolean } {
  const after = gold - unitCount * UNIT_MAINTENANCE_GOLD
  return { gold: Math.max(0, after), underMaintenance: after < 0 }
}

/** Each city level above 1 adds this fraction to all resource output. */
export const LEVEL_BONUS_PER_LEVEL = 0.2

/**
 * Food units required per current population point to grow by 1.
 * growthThreshold(pop) = pop * FOOD_PER_POPULATION_GROWTH
 * Since food production also scales linearly with pop, growth interval stays
 * constant per specialization regardless of city size.
 */
export const FOOD_PER_POPULATION_GROWTH = 20

// ─── Specialization multipliers ───────────────────────────────────────────────

type ResourceMultipliers = {
  readonly gold:       number
  readonly food:       number
  readonly production: number
}

/**
 * Per-specialization multipliers applied on top of base production.
 * Each row sums to ~3.0 so total output is roughly equal across specializations.
 *
 * Military  → max production for units; reduced economy.
 * Commercial → max gold for diplomacy / unit maintenance; neutral food.
 * Scientific → max food for population growth; neutral gold and production.
 */
const SPECIALIZATION_MULTIPLIERS: Record<CitySpecialization, ResourceMultipliers> = {
  [CitySpecialization.Military]: {
    gold:       0.75,
    food:       0.75,
    production: 1.5,
  },
  [CitySpecialization.Commercial]: {
    gold:       1.5,
    food:       1.0,
    production: 0.75,
  },
  [CitySpecialization.Scientific]: {
    gold:       0.9,
    food:       1.25,
    production: 0.9,
  },
}

// ─── City borders / territory ───────────────────────────────────────────────

/** Per-turn resource yield a city draws from each claimed terrain tile. */
const TERRAIN_RESOURCE_BONUS: Record<TerrainType, Resources> = {
  [TerrainType.Plains]:   { gold: 0, food: 2, production: 0 },
  [TerrainType.Forest]:   { gold: 0, food: 0, production: 2 },
  [TerrainType.Hills]:    { gold: 1, food: 0, production: 1 },
  [TerrainType.Mountain]: { gold: 0, food: 0, production: 0 },
  [TerrainType.Water]:    { gold: 0, food: 0, production: 0 },
}

/**
 * Resource bonus a city earns from the terrain it controls.
 * A city claims a tile within `radius` if it is the nearest city to that tile;
 * ties break toward the city with the lexicographically smaller `id` (stable).
 * Returns the summed terrain yield of all claimed tiles. Pure.
 */
export function computeCityTerritoryBonus(
  city: City,
  allCities: readonly City[],
  tiles: readonly HexTile[],
  radius = 2,
): Resources {
  const tileByKey = new Map<string, HexTile>()
  for (const t of tiles) tileByKey.set(hexKey(t.coord), t)

  const bonus: Resources = { gold: 0, food: 0, production: 0 }

  for (const coord of hexesInRadius(city.position, radius)) {
    const tile = tileByKey.get(hexKey(coord))
    if (!tile) continue

    // The owning city is the nearest one; ties go to the smaller id.
    let owner = city
    for (const other of allCities) {
      if (other.id === city.id) continue
      const dOther = hexDistance(other.position, coord)
      const dOwner = hexDistance(owner.position, coord)
      if (dOther < dOwner || (dOther === dOwner && other.id < owner.id)) {
        owner = other
      }
    }
    if (owner.id !== city.id) continue

    const yld = TERRAIN_RESOURCE_BONUS[tile.terrainType]
    bonus.gold       += yld.gold
    bonus.food       += yld.food
    bonus.production += yld.production
  }

  return bonus
}

// ─── City production ──────────────────────────────────────────────────────────

/**
 * Computes how many resources a city produces in one turn.
 * Output = population × base_rate × specialization_multiplier × level_multiplier,
 * plus the terrain yield of its claimed territory when `tiles` are supplied.
 * Results are rounded to the nearest integer; a pop-0 city produces nothing.
 *
 * `allCities` and `tiles` are optional for backward compatibility: callers that
 * omit them get the base (pre-territory) output. When provided, territory yield
 * is added BEFORE building multipliers so buildings amplify it too.
 *
 * Civilization ability bonuses (productionBonus, goldBonus) are applied by
 * turn.ts on top of this value, not here, to keep this function pure and simple.
 */
export function computeCityProduction(
  city: City,
  allCities: readonly City[] = [],
  tiles: readonly HexTile[] = [],
): Resources {
  if (city.population === 0) return { gold: 0, food: 0, production: 0 }

  const m = SPECIALIZATION_MULTIPLIERS[city.specialization]
  const lv = 1 + (city.level - 1) * LEVEL_BONUS_PER_LEVEL

  const base: Resources = {
    gold:       Math.round(city.population * BASE_GOLD_PER_POP        * m.gold       * lv),
    food:       Math.round(city.population * BASE_FOOD_PER_POP        * m.food       * lv),
    production: Math.round(city.population * BASE_PRODUCTION_PER_POP  * m.production * lv),
  }

  if (tiles.length > 0) {
    const territoryRadius = city.level >= 3 ? 3 : 2
    const terr = computeCityTerritoryBonus(city, allCities, tiles, territoryRadius)
    base.gold       += terr.gold
    base.food       += terr.food
    base.production += terr.production
  }

  return applyBuildingBonuses(city.buildings ?? [], base)
}

// ─── Population growth ────────────────────────────────────────────────────────

/**
 * Food required to grow a city of the given population by 1.
 * Scales linearly with population so that the number of turns to grow remains
 * roughly constant as the city expands (food production also scales linearly).
 */
export function growthThreshold(population: number): number {
  return population * FOOD_PER_POPULATION_GROWTH
}

function popToLevel(pop: number): number {
  if (pop >= 4) return 3
  if (pop >= 2) return 2
  return 1
}

/**
 * Adds food income to a city's food storage and triggers a population increase
 * if the growth threshold is reached. Also promotes city level when population
 * crosses the popToLevel thresholds (pop ≥ 2 → lv2, pop ≥ 4 → lv3).
 * Returns a new City — does not mutate the input.
 */
export function applyGrowth(city: City, foodIncome: number): City {
  const newFoodStored = city.foodStored + foodIncome
  const threshold = growthThreshold(city.population)

  if (newFoodStored >= threshold) {
    const grown: City = {
      ...city,
      population: city.population + 1,
      foodStored: newFoodStored - threshold,
    }
    const newLevel = popToLevel(grown.population)
    if (newLevel > grown.level) {
      const newMaxHp = cityMaxHp(newLevel)
      const hp = Math.min(
        newMaxHp,
        (grown.hp ?? cityMaxHp(grown.level)) + (newMaxHp - cityMaxHp(grown.level)),
      )
      return { ...grown, level: newLevel, maxHp: newMaxHp, hp }
    }
    return grown
  }
  return { ...city, foodStored: newFoodStored }
}

// ─── Turn processing ──────────────────────────────────────────────────────────

/**
 * Processes one turn of economy for all of a player's cities.
 *
 * For each city:
 * - Computes resource production.
 * - Adds gold, food, and production to the player's existing resource pool.
 *   (Food flows to the player pool for potential trading AND to the city's
 *   growth buffer — cities that specialize in food are both fast-growing
 *   and food-rich for diplomacy.)
 * - Applies food income to city growth (population may increase).
 *
 * Returns new cities array and updated resources. Does not mutate inputs.
 */
export function processTurnEconomy(
  cities: readonly City[],
  existingResources: Resources,
  tiles: readonly HexTile[] = [],
): { updatedCities: City[]; updatedResources: Resources } {
  let gold       = existingResources.gold
  let food       = existingResources.food
  let production = existingResources.production

  const updatedCities: City[] = []

  for (const city of cities) {
    const produced = computeCityProduction(city, cities, tiles)
    gold       += produced.gold
    food       += produced.food
    production += produced.production
    const grown = applyGrowth(city, produced.food)
    updatedCities.push(tickConstruction(grown))
  }

  return {
    updatedCities,
    updatedResources: { gold, food, production },
  }
}
