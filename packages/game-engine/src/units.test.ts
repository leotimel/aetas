import { describe, it, expect } from 'vitest'
import { UnitType, Era } from './types.js'
import {
  UNIT_CATALOG,
  getUnitDef,
  canTrainUnit,
  unitsAvailableInEra,
  createUnitInstance,
  trainingCost,
} from './units.js'

// ─── Suite 1 — Integridade do catálogo ───────────────────────────────────────

describe('UNIT_CATALOG — integridade', () => {
  it('tem uma entrada para cada valor de UnitType', () => {
    for (const type of Object.values(UnitType)) {
      expect(UNIT_CATALOG.has(type), `UnitType.${type} ausente do catálogo`).toBe(true)
    }
  })

  it('nenhuma unidade tem stats negativos ou zero inválido', () => {
    for (const [, def] of UNIT_CATALOG) {
      expect(def.stats.attack,   `${def.type}: attack`).toBeGreaterThanOrEqual(0)
      expect(def.stats.defense,  `${def.type}: defense`).toBeGreaterThanOrEqual(0)
      expect(def.stats.maxHp,    `${def.type}: maxHp`).toBeGreaterThan(0)
      expect(def.stats.movement, `${def.type}: movement`).toBeGreaterThan(0)
    }
  })

  it('productionCost é positivo para todas as unidades', () => {
    for (const [, def] of UNIT_CATALOG) {
      expect(def.productionCost, `${def.type}: productionCost`).toBeGreaterThan(0)
    }
  })

  it('Settler é a única unidade com canFoundCity = true', () => {
    for (const [type, def] of UNIT_CATALOG) {
      if (type === UnitType.Settler) {
        expect(def.canFoundCity).toBe(true)
      } else {
        expect(def.canFoundCity, `${type} não deveria fundar cidades`).toBe(false)
      }
    }
  })

  it('Catapult tem cityAttackBonus positivo', () => {
    const cat = getUnitDef(UnitType.Catapult)
    expect(cat.stats.cityAttackBonus).toBeGreaterThan(0)
  })

  it('unidades melee (range = 1 ou omitido) não têm cityAttackBonus, exceto Catapult', () => {
    for (const [type, def] of UNIT_CATALOG) {
      if (type === UnitType.Catapult) continue
      const isRanged = (def.stats.range ?? 1) > 1
      if (!isRanged) {
        expect(
          def.stats.cityAttackBonus ?? 0,
          `${type}: não deveria ter cityAttackBonus`,
        ).toBe(0)
      }
    }
  })

  it('Archer e Crossbowman têm range > 1', () => {
    expect(getUnitDef(UnitType.Archer).stats.range).toBeGreaterThan(1)
    expect(getUnitDef(UnitType.Crossbowman).stats.range).toBeGreaterThan(1)
  })

  it('unidades medievais são mais caras que as antigas equivalentes', () => {
    expect(getUnitDef(UnitType.Knight).productionCost)
      .toBeGreaterThan(getUnitDef(UnitType.Warrior).productionCost)
    expect(getUnitDef(UnitType.Crossbowman).productionCost)
      .toBeGreaterThan(getUnitDef(UnitType.Archer).productionCost)
  })
})

// ─── Suite 2 — canTrainUnit ───────────────────────────────────────────────────

describe('canTrainUnit — progressão de era', () => {
  it('unidades Ancient disponíveis em Ancient', () => {
    expect(canTrainUnit(UnitType.Warrior,  Era.Ancient)).toBe(true)
    expect(canTrainUnit(UnitType.Archer,   Era.Ancient)).toBe(true)
    expect(canTrainUnit(UnitType.Settler,  Era.Ancient)).toBe(true)
  })

  it('unidades Classical bloqueadas em Ancient', () => {
    expect(canTrainUnit(UnitType.Cavalry,  Era.Ancient)).toBe(false)
    expect(canTrainUnit(UnitType.Catapult, Era.Ancient)).toBe(false)
  })

  it('unidades Classical disponíveis em Classical', () => {
    expect(canTrainUnit(UnitType.Cavalry,  Era.Classical)).toBe(true)
    expect(canTrainUnit(UnitType.Catapult, Era.Classical)).toBe(true)
  })

  it('unidades Ancient ainda disponíveis em Classical', () => {
    expect(canTrainUnit(UnitType.Warrior, Era.Classical)).toBe(true)
    expect(canTrainUnit(UnitType.Archer,  Era.Classical)).toBe(true)
  })

  it('unidades Medieval bloqueadas em Classical', () => {
    expect(canTrainUnit(UnitType.Knight,      Era.Classical)).toBe(false)
    expect(canTrainUnit(UnitType.Crossbowman, Era.Classical)).toBe(false)
  })

  it('unidades Medieval disponíveis em Medieval', () => {
    expect(canTrainUnit(UnitType.Knight,      Era.Medieval)).toBe(true)
    expect(canTrainUnit(UnitType.Crossbowman, Era.Medieval)).toBe(true)
  })

  it('todas as unidades disponíveis em Medieval', () => {
    for (const type of Object.values(UnitType)) {
      expect(canTrainUnit(type, Era.Medieval), `${type} deveria estar disponível em Medieval`).toBe(true)
    }
  })
})

// ─── Suite 3 — unitsAvailableInEra ───────────────────────────────────────────

describe('unitsAvailableInEra', () => {
  it('Ancient → 3 unidades', () => {
    const units = unitsAvailableInEra(Era.Ancient)
    expect(units).toHaveLength(3)
    const types = units.map(u => u.type)
    expect(types).toContain(UnitType.Warrior)
    expect(types).toContain(UnitType.Archer)
    expect(types).toContain(UnitType.Settler)
  })

  it('Classical → 5 unidades (Ancient + Cavalry + Catapult)', () => {
    const units = unitsAvailableInEra(Era.Classical)
    expect(units).toHaveLength(5)
    const types = units.map(u => u.type)
    expect(types).toContain(UnitType.Cavalry)
    expect(types).toContain(UnitType.Catapult)
  })

  it('Medieval → 7 unidades (todas)', () => {
    const units = unitsAvailableInEra(Era.Medieval)
    expect(units).toHaveLength(Object.values(UnitType).length)
  })
})

// ─── Suite 4 — createUnitInstance ────────────────────────────────────────────

describe('createUnitInstance', () => {
  const POS = { q: 2, r: -1 }

  it('hp começa igual a maxHp', () => {
    const u = createUnitInstance('u1', UnitType.Warrior, 'p1', POS)
    expect(u.stats.hp).toBe(u.stats.maxHp)
    expect(u.stats.maxHp).toBe(getUnitDef(UnitType.Warrior).stats.maxHp)
  })

  it('hasMoved e hasAttacked começam false', () => {
    const u = createUnitInstance('u1', UnitType.Knight, 'p1', POS)
    expect(u.hasMoved).toBe(false)
    expect(u.hasAttacked).toBe(false)
  })

  it('unitType e ownerId corretos', () => {
    const u = createUnitInstance('u1', UnitType.Cavalry, 'player-42', POS)
    expect(u.unitType).toBe(UnitType.Cavalry)
    expect(u.ownerId).toBe('player-42')
  })

  it('Settler tem canFoundCity = true', () => {
    const u = createUnitInstance('u1', UnitType.Settler, 'p1', POS)
    expect(u.canFoundCity).toBe(true)
  })

  it('Warrior não tem canFoundCity', () => {
    const u = createUnitInstance('u1', UnitType.Warrior, 'p1', POS)
    expect(u.canFoundCity).toBeFalsy()
  })

  it('Catapult tem stats de range e cityAttackBonus', () => {
    const u = createUnitInstance('u1', UnitType.Catapult, 'p1', POS)
    expect(u.stats.range).toBeGreaterThan(1)
    expect(u.stats.cityAttackBonus).toBeGreaterThan(0)
  })

  it('Warrior não tem range nem cityAttackBonus nas stats', () => {
    const u = createUnitInstance('u1', UnitType.Warrior, 'p1', POS)
    expect(u.stats.range).toBeUndefined()
    expect(u.stats.cityAttackBonus).toBeUndefined()
  })

  it('posição é copiada corretamente', () => {
    const u = createUnitInstance('u1', UnitType.Archer, 'p1', POS)
    expect(u.position).toEqual(POS)
  })
})

// ─── trainingCost — custo escalado (ENT-3 + BAL-3) ────────────────────────────

describe('trainingCost', () => {
  const settler = getUnitDef(UnitType.Settler)    // base 40
  const catapult = getUnitDef(UnitType.Catapult)  // base 45
  const warrior = getUnitDef(UnitType.Warrior)

  it('Colono escala +50% por cidade possuída', () => {
    expect(trainingCost(settler, 0, 'romans').production).toBe(settler.productionCost)      // 40
    expect(trainingCost(settler, 1, 'romans').production).toBe(60)
    expect(trainingCost(settler, 2, 'romans').production).toBe(80)
    expect(trainingCost(settler, 3, 'romans').production).toBe(100)
  })

  it('food e gold derivam do custo de produção efetivo do Colono', () => {
    const cost = trainingCost(settler, 3, 'romans') // production 100
    expect(cost.food).toBe(50)  // ceil(100/2)
    expect(cost.gold).toBe(34)  // ceil(100/3)
  })

  it('Catapulta Otomana custa 30% menos; não-Otomana custa o base', () => {
    expect(trainingCost(catapult, 2, 'ottomans').production).toBe(Math.floor(catapult.productionCost * 0.7))
    expect(trainingCost(catapult, 2, 'romans').production).toBe(catapult.productionCost)
  })

  it('unidades que não são Colono não escalam com o nº de cidades', () => {
    expect(trainingCost(warrior, 0, 'romans').production).toBe(warrior.productionCost)
    expect(trainingCost(warrior, 5, 'romans').production).toBe(warrior.productionCost)
  })
})
