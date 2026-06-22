import { describe, it, expect } from 'vitest'
import { CitySpecialization, BuildingType } from './types.js'
import type { City } from './types.js'
import {
  BUILDING_CATALOG,
  getBuildingDef,
  getBuildingsBySpecialization,
  canBuildBuilding,
  startConstruction,
  tickConstruction,
  applyBuildingBonuses,
  getCityDefenseBonus,
  getCityEraProgressBonus,
  getCityScoreBonus,
} from './buildings.js'

// ─── Builder helpers ──────────────────────────────────────────────────────────

function makeCity(overrides: Partial<City> = {}): City {
  return {
    id:             'c1',
    name:           'Roma',
    position:       { q: 0, r: 0 },
    ownerId:        'p1',
    population:     2,
    specialization: CitySpecialization.Military,
    level:          1,
    foodStored:     0,
    buildings:      [],
    construction:   null,
    ...overrides,
  }
}

// ─── Suite 1 — Integridade do catálogo ───────────────────────────────────────

describe('BUILDING_CATALOG — integridade', () => {
  it('tem uma entrada para cada BuildingType', () => {
    for (const type of Object.values(BuildingType)) {
      expect(BUILDING_CATALOG.has(type), `BuildingType.${type} ausente`).toBe(true)
    }
  })

  it('productionCost positivo em todos', () => {
    for (const [, def] of BUILDING_CATALOG) {
      expect(def.productionCost, `${def.type}: productionCost`).toBeGreaterThan(0)
    }
  })

  it('constructionTurns positivo em todos', () => {
    for (const [, def] of BUILDING_CATALOG) {
      expect(def.constructionTurns, `${def.type}: constructionTurns`).toBeGreaterThan(0)
    }
  })

  it('Military → Barracks e Wall', () => {
    const mil = getBuildingsBySpecialization(CitySpecialization.Military)
    const types = mil.map(d => d.type)
    expect(types).toContain(BuildingType.Barracks)
    expect(types).toContain(BuildingType.Wall)
    expect(mil).toHaveLength(2)
  })

  it('Commercial → Market e Port', () => {
    const com = getBuildingsBySpecialization(CitySpecialization.Commercial)
    const types = com.map(d => d.type)
    expect(types).toContain(BuildingType.Market)
    expect(types).toContain(BuildingType.Port)
    expect(com).toHaveLength(2)
  })

  it('Scientific → Library e Temple', () => {
    const sci = getBuildingsBySpecialization(CitySpecialization.Scientific)
    const types = sci.map(d => d.type)
    expect(types).toContain(BuildingType.Library)
    expect(types).toContain(BuildingType.Temple)
    expect(sci).toHaveLength(2)
  })

  it('Barracks tem efeito productionMultiplier > 1', () => {
    const e = getBuildingDef(BuildingType.Barracks).effect
    expect(e.type).toBe('productionMultiplier')
    if (e.type === 'productionMultiplier') expect(e.value).toBeGreaterThan(1)
  })

  it('Market tem efeito goldMultiplier > 1', () => {
    const e = getBuildingDef(BuildingType.Market).effect
    expect(e.type).toBe('goldMultiplier')
    if (e.type === 'goldMultiplier') expect(e.value).toBeGreaterThan(1)
  })

  it('Wall tem efeito cityDefenseBonus > 0', () => {
    const e = getBuildingDef(BuildingType.Wall).effect
    expect(e.type).toBe('cityDefenseBonus')
    if (e.type === 'cityDefenseBonus') expect(e.value).toBeGreaterThan(0)
  })

  it('Library tem efeito eraProgressBonus > 0', () => {
    const e = getBuildingDef(BuildingType.Library).effect
    expect(e.type).toBe('eraProgressBonus')
    if (e.type === 'eraProgressBonus') expect(e.value).toBeGreaterThan(0)
  })

  it('Temple tem efeito scoreBonus > 0', () => {
    const e = getBuildingDef(BuildingType.Temple).effect
    expect(e.type).toBe('scoreBonus')
    if (e.type === 'scoreBonus') expect(e.value).toBeGreaterThan(0)
  })
})

// ─── Suite 2 — canBuildBuilding ───────────────────────────────────────────────

describe('canBuildBuilding', () => {
  it('pode construir edifício militar em cidade militar', () => {
    const city = makeCity({ specialization: CitySpecialization.Military })
    expect(canBuildBuilding(city, BuildingType.Barracks)).toBe(true)
    expect(canBuildBuilding(city, BuildingType.Wall)).toBe(true)
  })

  it('pode construir edifício comercial em cidade comercial', () => {
    const city = makeCity({ specialization: CitySpecialization.Commercial })
    expect(canBuildBuilding(city, BuildingType.Market)).toBe(true)
    expect(canBuildBuilding(city, BuildingType.Port)).toBe(true)
  })

  it('pode construir edifício científico em cidade científica', () => {
    const city = makeCity({ specialization: CitySpecialization.Scientific })
    expect(canBuildBuilding(city, BuildingType.Library)).toBe(true)
    expect(canBuildBuilding(city, BuildingType.Temple)).toBe(true)
  })

  it('bloqueia edifício militar em cidade comercial', () => {
    const city = makeCity({ specialization: CitySpecialization.Commercial })
    expect(canBuildBuilding(city, BuildingType.Barracks)).toBe(false)
    expect(canBuildBuilding(city, BuildingType.Wall)).toBe(false)
  })

  it('bloqueia edifício científico em cidade militar', () => {
    const city = makeCity({ specialization: CitySpecialization.Military })
    expect(canBuildBuilding(city, BuildingType.Library)).toBe(false)
    expect(canBuildBuilding(city, BuildingType.Temple)).toBe(false)
  })

  it('bloqueia edifício já construído', () => {
    const city = makeCity({
      specialization: CitySpecialization.Military,
      buildings: [BuildingType.Barracks],
    })
    expect(canBuildBuilding(city, BuildingType.Barracks)).toBe(false)
  })

  it('segundo edifício da especialização ainda permitido', () => {
    const city = makeCity({
      specialization: CitySpecialization.Military,
      buildings: [BuildingType.Barracks],
    })
    expect(canBuildBuilding(city, BuildingType.Wall)).toBe(true)
  })

  it('bloqueia quando construção em andamento', () => {
    const city = makeCity({ specialization: CitySpecialization.Military })
    const withConst = startConstruction(city, BuildingType.Barracks)
    expect(canBuildBuilding(withConst, BuildingType.Wall)).toBe(false)
  })

  it('city sem campo buildings (legado) permite construção', () => {
    const city = makeCity({ specialization: CitySpecialization.Military })
    // simula objeto legado sem campo buildings
    const legacy = { ...city, buildings: undefined, construction: undefined }
    expect(canBuildBuilding(legacy as City, BuildingType.Barracks)).toBe(true)
  })
})

// ─── Suite 3 — applyBuildingBonuses ──────────────────────────────────────────

describe('applyBuildingBonuses', () => {
  const BASE = { gold: 10, food: 20, production: 15 }

  it('sem edifícios → recursos inalterados', () => {
    expect(applyBuildingBonuses([], BASE)).toEqual(BASE)
  })

  it('Barracks → produção ×1.5, ouro e comida inalterados', () => {
    const result = applyBuildingBonuses([BuildingType.Barracks], BASE)
    expect(result.production).toBe(Math.round(15 * 1.5))  // 23
    expect(result.gold).toBe(10)
    expect(result.food).toBe(20)
  })

  it('Market → ouro ×1.5, produção e comida inalterados', () => {
    const result = applyBuildingBonuses([BuildingType.Market], BASE)
    expect(result.gold).toBe(Math.round(10 * 1.5))        // 15
    expect(result.production).toBe(15)
    expect(result.food).toBe(20)
  })

  it('Port → comida ×1.3, ouro e produção inalterados', () => {
    const result = applyBuildingBonuses([BuildingType.Port], BASE)
    expect(result.food).toBe(Math.round(20 * 1.3))        // 26
    expect(result.gold).toBe(10)
    expect(result.production).toBe(15)
  })

  it('Wall → nenhum recurso alterado (efeito é defesa)', () => {
    expect(applyBuildingBonuses([BuildingType.Wall], BASE)).toEqual(BASE)
  })

  it('Library → nenhum recurso alterado (efeito é pesquisa)', () => {
    expect(applyBuildingBonuses([BuildingType.Library], BASE)).toEqual(BASE)
  })

  it('Temple → nenhum recurso alterado (efeito é pontuação)', () => {
    expect(applyBuildingBonuses([BuildingType.Temple], BASE)).toEqual(BASE)
  })

  it('Market + Port acumulam: ouro ×1.5 E comida ×1.3', () => {
    const result = applyBuildingBonuses(
      [BuildingType.Market, BuildingType.Port],
      BASE,
    )
    expect(result.gold).toBe(Math.round(10 * 1.5))
    expect(result.food).toBe(Math.round(20 * 1.3))
    expect(result.production).toBe(15)
  })
})

// ─── Suite 4 — Aggregators de efeitos não-econômicos ─────────────────────────

describe('aggregators de efeitos', () => {
  it('getCityDefenseBonus → 0 sem edifícios', () => {
    expect(getCityDefenseBonus([])).toBe(0)
  })

  it('getCityDefenseBonus → soma das muralhas', () => {
    expect(getCityDefenseBonus([BuildingType.Wall])).toBe(5)
    // Barracks não contribui
    expect(getCityDefenseBonus([BuildingType.Barracks, BuildingType.Wall])).toBe(5)
  })

  it('getCityEraProgressBonus → 0 sem Library', () => {
    expect(getCityEraProgressBonus([])).toBe(0)
    expect(getCityEraProgressBonus([BuildingType.Market])).toBe(0)
  })

  it('getCityEraProgressBonus → 1 com Library', () => {
    expect(getCityEraProgressBonus([BuildingType.Library])).toBe(1)
  })

  it('getCityScoreBonus → 0 sem Temple', () => {
    expect(getCityScoreBonus([])).toBe(0)
    expect(getCityScoreBonus([BuildingType.Library])).toBe(0)
  })

  it('getCityScoreBonus → 10 com Temple', () => {
    expect(getCityScoreBonus([BuildingType.Temple])).toBe(10)
  })
})

// ─── Suite 5 — Ciclo de vida da construção ────────────────────────────────────

describe('startConstruction / tickConstruction', () => {
  it('startConstruction define construction com turnsRemaining correto', () => {
    const city = makeCity({ specialization: CitySpecialization.Military })
    const c = startConstruction(city, BuildingType.Barracks)
    expect(c.construction).not.toBeNull()
    expect(c.construction?.buildingType).toBe(BuildingType.Barracks)
    expect(c.construction?.turnsRemaining).toBe(getBuildingDef(BuildingType.Barracks).constructionTurns)
    expect(c.construction?.totalTurns).toBe(c.construction?.turnsRemaining)
  })

  it('startConstruction não muda buildings existentes', () => {
    const city = makeCity({
      specialization: CitySpecialization.Military,
      buildings: [BuildingType.Wall],
    })
    const c = startConstruction(city, BuildingType.Barracks)
    expect(c.buildings).toEqual([BuildingType.Wall])
  })

  it('tickConstruction sem construção ativa retorna cidade igual', () => {
    const city = makeCity()
    const result = tickConstruction(city)
    expect(result).toBe(city)  // mesma referência — sem mudança
  })

  it('tickConstruction decrementa turnsRemaining', () => {
    const city = makeCity({ specialization: CitySpecialization.Military })
    const c = startConstruction(city, BuildingType.Wall)  // totalTurns = 4
    const after = tickConstruction(c)
    expect(after.construction?.turnsRemaining).toBe(3)
    expect(after.buildings).toEqual([])
  })

  it('tickConstruction completa quando turnsRemaining chega a 1', () => {
    const city: City = {
      ...makeCity({ specialization: CitySpecialization.Military }),
      construction: {
        buildingType:   BuildingType.Wall,
        turnsRemaining: 1,
        totalTurns:     4,
      },
    }
    const completed = tickConstruction(city)
    expect(completed.construction).toBeNull()
    expect(completed.buildings).toContain(BuildingType.Wall)
  })

  it('edifício completo é adicionado a buildings existentes', () => {
    const city: City = {
      ...makeCity({ specialization: CitySpecialization.Military }),
      buildings: [BuildingType.Barracks],
      construction: {
        buildingType:   BuildingType.Wall,
        turnsRemaining: 1,
        totalTurns:     4,
      },
    }
    const completed = tickConstruction(city)
    expect(completed.buildings).toEqual([BuildingType.Barracks, BuildingType.Wall])
    expect(completed.construction).toBeNull()
  })

  it('fluxo completo: N ticks até completar Barracks (3 turnos)', () => {
    const city = makeCity({ specialization: CitySpecialization.Military })
    let c = startConstruction(city, BuildingType.Barracks)
    expect(c.construction?.turnsRemaining).toBe(3)

    c = tickConstruction(c)
    expect(c.construction?.turnsRemaining).toBe(2)
    expect(c.buildings).toEqual([])

    c = tickConstruction(c)
    expect(c.construction?.turnsRemaining).toBe(1)

    c = tickConstruction(c)
    expect(c.construction).toBeNull()
    expect(c.buildings).toContain(BuildingType.Barracks)
  })
})
