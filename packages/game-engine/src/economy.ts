import { CitySpecialization } from './types.js'
import type { City, Resources } from './types.js'

// ─── Constants ────────────────────────────────────────────────────────────────

export const BASE_GOLD_PER_POP = 1
export const BASE_FOOD_PER_POP = 2
export const BASE_PRODUCTION_PER_POP = 1

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

// ─── City production ──────────────────────────────────────────────────────────

/**
 * Computes how many resources a city produces in one turn.
 * Output = population × base_rate × specialization_multiplier × level_multiplier.
 * Results are rounded to the nearest integer; a pop-0 city produces nothing.
 *
 * Civilization ability bonuses (productionBonus, goldBonus) are applied by
 * turn.ts on top of this value, not here, to keep this function pure and simple.
 */
export function computeCityProduction(city: City): Resources {
  if (city.population === 0) return { gold: 0, food: 0, production: 0 }

  const m = SPECIALIZATION_MULTIPLIERS[city.specialization]
  const lv = 1 + (city.level - 1) * LEVEL_BONUS_PER_LEVEL

  return {
    gold:       Math.round(city.population * BASE_GOLD_PER_POP        * m.gold       * lv),
    food:       Math.round(city.population * BASE_FOOD_PER_POP        * m.food       * lv),
    production: Math.round(city.population * BASE_PRODUCTION_PER_POP  * m.production * lv),
  }
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

/**
 * Adds food income to a city's food storage and triggers a population increase
 * if the growth threshold is reached.
 * Returns a new City — does not mutate the input.
 */
export function applyGrowth(city: City, foodIncome: number): City {
  const newFoodStored = city.foodStored + foodIncome
  const threshold = growthThreshold(city.population)

  if (newFoodStored >= threshold) {
    return {
      ...city,
      population: city.population + 1,
      foodStored: newFoodStored - threshold,
    }
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
): { updatedCities: City[]; updatedResources: Resources } {
  let gold       = existingResources.gold
  let food       = existingResources.food
  let production = existingResources.production

  const updatedCities: City[] = []

  for (const city of cities) {
    const produced = computeCityProduction(city)
    gold       += produced.gold
    food       += produced.food
    production += produced.production
    updatedCities.push(applyGrowth(city, produced.food))
  }

  return {
    updatedCities,
    updatedResources: { gold, food, production },
  }
}
