import { describe, it, expect } from 'vitest'
import {
  computeCityProduction,
  growthThreshold,
  applyGrowth,
  processTurnEconomy,
  BASE_GOLD_PER_POP,
  BASE_FOOD_PER_POP,
  BASE_PRODUCTION_PER_POP,
  FOOD_PER_POPULATION_GROWTH,
  LEVEL_BONUS_PER_LEVEL,
  applyUnitMaintenance,
} from './economy.js'
import { computeCityTerritoryBonus } from './economy.js'
import { CitySpecialization, TerrainType } from './types.js'
import type { City, Resources, HexTile, HexCoord } from './types.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id: 'c1',
    name: 'TestCity',
    position: { q: 0, r: 0 },
    ownerId: 'p1',
    population: 1,
    specialization: CitySpecialization.Commercial,
    level: 1,
    foodStored: 0,
    ...overrides,
  }
}

const zero: Resources = { gold: 0, food: 0, production: 0 }

// Pre-computed reference values (pop=1, level=1, used throughout):
//   Military:   gold=1, food=2, production=2
//   Commercial: gold=2, food=2, production=1
//   Scientific: gold=1, food=3, production=1

// ─── Suite 1: computeCityProduction — os 3 recursos ──────────────────────────

describe('computeCityProduction — Military', () => {
  it('produces correct gold (0.75× base)', () => {
    const city = makeCity({ specialization: CitySpecialization.Military, population: 1 })
    expect(computeCityProduction(city).gold).toBe(
      Math.round(1 * BASE_GOLD_PER_POP * 0.75),
    )
  })
  it('produces correct food (0.75× base)', () => {
    const city = makeCity({ specialization: CitySpecialization.Military, population: 1 })
    expect(computeCityProduction(city).food).toBe(
      Math.round(1 * BASE_FOOD_PER_POP * 0.75),
    )
  })
  it('produces correct production (1.5× base)', () => {
    const city = makeCity({ specialization: CitySpecialization.Military, population: 1 })
    expect(computeCityProduction(city).production).toBe(
      Math.round(1 * BASE_PRODUCTION_PER_POP * 1.5),
    )
  })
  it('produces more production than Commercial at the same population', () => {
    const mil = makeCity({ specialization: CitySpecialization.Military,  population: 4 })
    const com = makeCity({ specialization: CitySpecialization.Commercial, population: 4 })
    expect(computeCityProduction(mil).production).toBeGreaterThan(computeCityProduction(com).production)
  })
})

describe('computeCityProduction — Commercial', () => {
  it('produces correct gold (1.5× base)', () => {
    const city = makeCity({ specialization: CitySpecialization.Commercial, population: 1 })
    expect(computeCityProduction(city).gold).toBe(
      Math.round(1 * BASE_GOLD_PER_POP * 1.5),
    )
  })
  it('produces correct food (1.0× base)', () => {
    const city = makeCity({ specialization: CitySpecialization.Commercial, population: 1 })
    expect(computeCityProduction(city).food).toBe(
      Math.round(1 * BASE_FOOD_PER_POP * 1.0),
    )
  })
  it('produces correct production (0.75× base)', () => {
    const city = makeCity({ specialization: CitySpecialization.Commercial, population: 1 })
    expect(computeCityProduction(city).production).toBe(
      Math.round(1 * BASE_PRODUCTION_PER_POP * 0.75),
    )
  })
  it('produces more gold than Military at the same population', () => {
    const com = makeCity({ specialization: CitySpecialization.Commercial, population: 4 })
    const mil = makeCity({ specialization: CitySpecialization.Military,   population: 4 })
    expect(computeCityProduction(com).gold).toBeGreaterThan(computeCityProduction(mil).gold)
  })
})

describe('computeCityProduction — Scientific', () => {
  it('produces correct gold (0.9× base)', () => {
    const city = makeCity({ specialization: CitySpecialization.Scientific, population: 1 })
    expect(computeCityProduction(city).gold).toBe(
      Math.round(1 * BASE_GOLD_PER_POP * 0.9),
    )
  })
  it('produces correct food (1.25× base)', () => {
    const city = makeCity({ specialization: CitySpecialization.Scientific, population: 1 })
    expect(computeCityProduction(city).food).toBe(
      Math.round(1 * BASE_FOOD_PER_POP * 1.25),
    )
  })
  it('produces correct production (0.9× base)', () => {
    const city = makeCity({ specialization: CitySpecialization.Scientific, population: 1 })
    expect(computeCityProduction(city).production).toBe(
      Math.round(1 * BASE_PRODUCTION_PER_POP * 0.9),
    )
  })
  it('produces more food than Military at the same population', () => {
    const sci = makeCity({ specialization: CitySpecialization.Scientific, population: 4 })
    const mil = makeCity({ specialization: CitySpecialization.Military,   population: 4 })
    expect(computeCityProduction(sci).food).toBeGreaterThan(computeCityProduction(mil).food)
  })
})

describe('computeCityProduction — level scaling', () => {
  it('level 2 produces more than level 1 (Commercial, pop 4)', () => {
    // pop 4 keeps the level delta above the rounding granularity for all rates.
    const lv1 = makeCity({ population: 4, level: 1 })
    const lv2 = makeCity({ population: 4, level: 2 })
    const p1 = computeCityProduction(lv1)
    const p2 = computeCityProduction(lv2)
    expect(p2.gold).toBeGreaterThan(p1.gold)
    expect(p2.food).toBeGreaterThan(p1.food)
  })
  it('level multiplier is 1 + (level-1) × LEVEL_BONUS_PER_LEVEL', () => {
    // Pop=4, level=3, Commercial: lv = 1 + 2*0.2 = 1.4
    const city = makeCity({ population: 4, level: 3 })
    const expected = Math.round(4 * BASE_GOLD_PER_POP * 1.5 * (1 + 2 * LEVEL_BONUS_PER_LEVEL))
    expect(computeCityProduction(city).gold).toBe(expected)
  })
  it('population 0 produces zero resources', () => {
    const city = makeCity({ population: 0 })
    expect(computeCityProduction(city)).toEqual(zero)
  })
  it('scales linearly with population', () => {
    const x1 = computeCityProduction(makeCity({ population: 1 }))
    const x3 = computeCityProduction(makeCity({ population: 3 }))
    // gold: round(1*1.5) = 2, round(3*1.5) = 5 — not exactly 3×, but gold×3 ≥ gold×1 * 2
    expect(x3.gold).toBeGreaterThan(x1.gold)
    expect(x3.food).toBeGreaterThan(x1.food)
    expect(x3.production).toBeGreaterThan(x1.production)
  })
})

// ─── Suite 2: growthThreshold ─────────────────────────────────────────────────

describe('growthThreshold', () => {
  it('is population × FOOD_PER_POPULATION_GROWTH', () => {
    expect(growthThreshold(1)).toBe(1 * FOOD_PER_POPULATION_GROWTH)
    expect(growthThreshold(2)).toBe(2 * FOOD_PER_POPULATION_GROWTH)
    expect(growthThreshold(5)).toBe(5 * FOOD_PER_POPULATION_GROWTH)
  })
  it('higher population has higher threshold', () => {
    expect(growthThreshold(3)).toBeGreaterThan(growthThreshold(2))
  })
})

// ─── Suite 3: applyGrowth ─────────────────────────────────────────────────────

describe('applyGrowth', () => {
  it('accumulates food without growing when below threshold', () => {
    const city = makeCity({ population: 1, foodStored: 10 })
    const result = applyGrowth(city, 5)
    expect(result.population).toBe(1)
    expect(result.foodStored).toBe(15)
  })
  it('grows population exactly when threshold is reached', () => {
    const city = makeCity({ population: 1, foodStored: 18 })
    const result = applyGrowth(city, 2) // 18+2 = 20 = threshold(1)
    expect(result.population).toBe(2)
    expect(result.foodStored).toBe(0)
  })
  it('grows population when food exceeds threshold; surplus carries over', () => {
    const city = makeCity({ population: 2, foodStored: 39 })
    const result = applyGrowth(city, 2) // 39+2=41, threshold=40, surplus=1
    expect(result.population).toBe(3)
    expect(result.foodStored).toBe(1)
  })
  it('does not grow when one food short of threshold', () => {
    const city = makeCity({ population: 1, foodStored: 19 })
    const result = applyGrowth(city, 0)
    expect(result.population).toBe(1)
    expect(result.foodStored).toBe(19)
  })
  it('is pure — does not mutate input city', () => {
    const city = makeCity({ population: 1, foodStored: 18 })
    applyGrowth(city, 2)
    expect(city.population).toBe(1)
    expect(city.foodStored).toBe(18)
  })
})

// ─── Suite 4: população ao longo de N turnos ─────────────────────────────────

describe('população ao longo de N turnos — curva de crescimento', () => {
  it('Commercial city pop=1 grows to pop=2 after exactly 10 turns', () => {
    // food production = round(1 * 2 * 1.0) = 2/turn; threshold = 20; 20/2 = 10 turns
    let city = makeCity({ specialization: CitySpecialization.Commercial, population: 1 })
    for (let t = 1; t <= 9; t++) {
      const food = computeCityProduction(city).food
      city = applyGrowth(city, food)
    }
    expect(city.population).toBe(1) // not grown yet after 9 turns

    const food = computeCityProduction(city).food
    city = applyGrowth(city, food)
    expect(city.population).toBe(2) // grows on turn 10
  })

  it('population grows monotonically over many turns', () => {
    let city = makeCity({ specialization: CitySpecialization.Commercial, population: 1 })
    let prevPop = city.population
    for (let t = 0; t < 30; t++) {
      city = applyGrowth(city, computeCityProduction(city).food)
      expect(city.population).toBeGreaterThanOrEqual(prevPop)
      prevPop = city.population
    }
  })

  it('Scientific city grows faster than Military city (more food)', () => {
    const runFor = (spec: CitySpecialization, turns: number): number => {
      let city = makeCity({ specialization: spec, population: 1 })
      for (let t = 0; t < turns; t++) {
        city = applyGrowth(city, computeCityProduction(city).food)
      }
      return city.population
    }
    expect(runFor(CitySpecialization.Scientific, 20))
      .toBeGreaterThan(runFor(CitySpecialization.Military, 20))
  })

  it('foodStored resets (partially) on each population growth', () => {
    let city = makeCity({ specialization: CitySpecialization.Commercial, population: 1 })
    // Run past the first growth event
    for (let t = 0; t < 11; t++) {
      city = applyGrowth(city, computeCityProduction(city).food)
    }
    // After growing from pop=1 to pop=2, foodStored should be ≥ 0 and < threshold(2)
    expect(city.foodStored).toBeGreaterThanOrEqual(0)
    expect(city.foodStored).toBeLessThan(growthThreshold(city.population))
  })
})

// ─── Suite 5: processTurnEconomy ─────────────────────────────────────────────

describe('processTurnEconomy', () => {
  it('accumulates resources from a single city', () => {
    const city = makeCity({ specialization: CitySpecialization.Commercial, population: 1 })
    const { updatedResources } = processTurnEconomy([city], zero)
    expect(updatedResources.gold).toBe(computeCityProduction(city).gold)
    expect(updatedResources.food).toBe(computeCityProduction(city).food)
    expect(updatedResources.production).toBe(computeCityProduction(city).production)
  })

  it('accumulates resources from multiple cities', () => {
    const com = makeCity({ id: 'c1', specialization: CitySpecialization.Commercial, population: 2 })
    const mil = makeCity({ id: 'c2', specialization: CitySpecialization.Military,   population: 3 })
    const { updatedResources } = processTurnEconomy([com, mil], zero)
    const pCom = computeCityProduction(com)
    const pMil = computeCityProduction(mil)
    expect(updatedResources.gold).toBe(pCom.gold + pMil.gold)
    expect(updatedResources.food).toBe(pCom.food + pMil.food)
    expect(updatedResources.production).toBe(pCom.production + pMil.production)
  })

  it('adds to existing resources (does not reset to zero)', () => {
    const city = makeCity({ population: 1 })
    const start: Resources = { gold: 10, food: 5, production: 3 }
    const { updatedResources } = processTurnEconomy([city], start)
    expect(updatedResources.gold).toBeGreaterThan(10)
  })

  it('applies growth to cities inside the economy turn', () => {
    // City needs 20 food to grow; we give it 19 stored + 2 produced = 21 → should grow
    const city = makeCity({
      specialization: CitySpecialization.Commercial,
      population: 1,
      foodStored: 18, // will produce 2 more, total 20 = threshold
    })
    const { updatedCities } = processTurnEconomy([city], zero)
    expect(updatedCities[0]?.population).toBe(2)
  })

  it('Commercial city grows to pop=2 after 10 consecutive turns via processTurnEconomy', () => {
    let cities = [makeCity({ specialization: CitySpecialization.Commercial, population: 1 })]
    let resources = zero
    for (let t = 0; t < 10; t++) {
      const result = processTurnEconomy(cities, resources)
      cities = result.updatedCities
      resources = result.updatedResources
    }
    expect(cities[0]?.population).toBe(2)
    expect(resources.gold).toBe(20)       // 2 gold/turn × 10 turns
    expect(resources.production).toBe(10) // 1 prod/turn × 10 turns
  })

  it('is pure — does not mutate the input cities array', () => {
    const city = makeCity({ foodStored: 18, population: 1 })
    processTurnEconomy([city], zero)
    expect(city.foodStored).toBe(18) // unchanged
    expect(city.population).toBe(1)  // unchanged
  })

  it('empty cities list produces no change to resources', () => {
    const start: Resources = { gold: 7, food: 3, production: 5 }
    const { updatedResources } = processTurnEconomy([], start)
    expect(updatedResources).toEqual(start)
  })
})

// ─── Suite 5b: applyUnitMaintenance — gold sink ──────────────────────────────

describe('applyUnitMaintenance', () => {
  it('deducts 1 gold per unit, no deficit', () => {
    expect(applyUnitMaintenance(5, 2)).toEqual({ gold: 3, underMaintenance: false })
  })
  it('floors gold at 0 and flags the deficit when underfunded', () => {
    expect(applyUnitMaintenance(1, 2)).toEqual({ gold: 0, underMaintenance: true })
  })
  it('no units → no cost, no deficit', () => {
    expect(applyUnitMaintenance(0, 0)).toEqual({ gold: 0, underMaintenance: false })
  })
  it('exactly covering maintenance is not a deficit', () => {
    expect(applyUnitMaintenance(2, 2)).toEqual({ gold: 0, underMaintenance: false })
  })
})

describe('computeCityProduction — production floor', () => {
  it('Commercial city pop=1 still produces at least 1 production (not rounded to 0)', () => {
    const city = makeCity({ specialization: CitySpecialization.Commercial, population: 1 })
    expect(computeCityProduction(city).production).toBeGreaterThanOrEqual(1)
  })
})

// ─── Suite 6: computeCityTerritoryBonus — bordas de cidade ───────────────────

function tile(q: number, r: number, terrainType: TerrainType): HexTile {
  return { coord: { q, r } as HexCoord, terrainType }
}

describe('computeCityTerritoryBonus — território', () => {
  it('cidade isolada com 2 tiles Plains vizinhos → food = 4', () => {
    const city = makeCity({ id: 'a', position: { q: 0, r: 0 } })
    const tiles = [tile(1, 0, TerrainType.Plains), tile(0, 1, TerrainType.Plains)]
    const bonus = computeCityTerritoryBonus(city, [city], tiles)
    expect(bonus.food).toBe(4)
    expect(bonus.production).toBe(0)
    expect(bonus.gold).toBe(0)
  })

  it('tile equidistante entre duas cidades vai para a de menor id', () => {
    const a = makeCity({ id: 'a', position: { q: 0, r: 0 } })
    const b = makeCity({ id: 'b', position: { q: 2, r: 0 } })
    const contested = [tile(1, 0, TerrainType.Plains)] // dist 1 de ambas → empate
    const all = [a, b]
    // 'a' < 'b' → 'a' reivindica o tile do meio.
    expect(computeCityTerritoryBonus(a, all, contested).food).toBe(2)
    expect(computeCityTerritoryBonus(b, all, contested).food).toBe(0)
  })

  it('tile mais próximo de uma cidade vai para ela, não para a distante', () => {
    const a = makeCity({ id: 'a', position: { q: 0, r: 0 } })
    const b = makeCity({ id: 'b', position: { q: 4, r: 0 } })
    const near = [tile(1, 0, TerrainType.Forest)] // dist 1 de 'a', dist 3 de 'b'
    const all = [a, b]
    expect(computeCityTerritoryBonus(a, all, near).production).toBe(2)
    expect(computeCityTerritoryBonus(b, all, near).production).toBe(0)
  })

  it('computeCityProduction com tiles de Forest produz mais production do que sem tiles', () => {
    const city = makeCity({ id: 'a', position: { q: 0, r: 0 }, population: 1 })
    const forest = [tile(1, 0, TerrainType.Forest), tile(0, 1, TerrainType.Forest)]
    const withTiles = computeCityProduction(city, [city], forest)
    const without   = computeCityProduction(city)
    expect(withTiles.production).toBeGreaterThan(without.production)
  })
})
