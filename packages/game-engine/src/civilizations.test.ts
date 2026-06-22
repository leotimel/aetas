import { describe, it, expect } from 'vitest'
import { UnitType, Era } from './types.js'
import { getUnitDef } from './units.js'
import { resolveCombat } from './combat.js'
import { TerrainType } from './types.js'
import {
  CIVILIZATION_CATALOG,
  SPECIAL_UNIT_CATALOG,
  getCivilization,
  getSpecialUnit,
  unitsForCiv,
  getCivEconomyMultipliers,
  getCivCombatMultiplier,
  getCivVisionBonus,
} from './civilizations.js'

// ─── Suite 1 — Integridade do catálogo ───────────────────────────────────────

describe('CIVILIZATION_CATALOG — integridade', () => {
  const CIV_IDS = ['romans', 'mongols', 'egyptians', 'greeks', 'vikings', 'china']

  it('tem exatamente 6 civilizações', () => {
    expect(CIVILIZATION_CATALOG.size).toBe(6)
  })

  it('contém todos os IDs esperados', () => {
    for (const id of CIV_IDS) {
      expect(CIVILIZATION_CATALOG.has(id), `${id} ausente`).toBe(true)
    }
  })

  it('cada civilização tem pelo menos 1 habilidade', () => {
    for (const [id, civ] of CIVILIZATION_CATALOG) {
      expect(civ.abilities.length, `${id}: sem habilidades`).toBeGreaterThanOrEqual(1)
    }
  })

  it('cada civilização tem um specialUnitType com entrada em SPECIAL_UNIT_CATALOG', () => {
    for (const [id, civ] of CIVILIZATION_CATALOG) {
      expect(
        SPECIAL_UNIT_CATALOG.has(civ.specialUnitType),
        `${id}: specialUnitType '${civ.specialUnitType}' não encontrado em SPECIAL_UNIT_CATALOG`,
      ).toBe(true)
    }
  })

  it('getCivilization retorna a civ correta', () => {
    const roma = getCivilization('romans')
    expect(roma.id).toBe('romans')
    expect(roma.name).toBe('Romanos')
  })

  it('getCivilization lança para ID desconhecido', () => {
    expect(() => getCivilization('atlantis')).toThrow()
  })
})

// ─── Suite 2 — Unidades especiais ────────────────────────────────────────────

describe('SPECIAL_UNIT_CATALOG — unidades especiais', () => {
  it('tem 6 entradas (uma por civ)', () => {
    expect(SPECIAL_UNIT_CATALOG.size).toBe(6)
  })

  it('cada unidade especial tem replacesType válido em UnitType', () => {
    const validTypes = new Set(Object.values(UnitType))
    for (const [, unit] of SPECIAL_UNIT_CATALOG) {
      expect(validTypes.has(unit.replacesType), `${unit.type}: replacesType inválido`).toBe(true)
    }
  })

  it('Legionário Romano: melhor defesa e HP que Warrior', () => {
    const legionary = getSpecialUnit('romans')
    const warrior   = getUnitDef(UnitType.Warrior)
    expect(legionary.stats.defense).toBeGreaterThan(warrior.stats.defense)
    expect(legionary.stats.maxHp).toBeGreaterThan(warrior.stats.maxHp)
    expect(legionary.replacesType).toBe(UnitType.Warrior)
  })

  it('Cavaleiro Mongol: mais movimento que Cavalry', () => {
    const mongol  = getSpecialUnit('mongols')
    const cavalry = getUnitDef(UnitType.Cavalry)
    expect(mongol.stats.movement).toBeGreaterThan(cavalry.stats.movement)
    expect(mongol.replacesType).toBe(UnitType.Cavalry)
  })

  it('Carro de Guerra: mais ataque que Cavalry', () => {
    const chariot = getSpecialUnit('egyptians')
    const cavalry = getUnitDef(UnitType.Cavalry)
    expect(chariot.stats.attack).toBeGreaterThan(cavalry.stats.attack)
    expect(chariot.replacesType).toBe(UnitType.Cavalry)
  })

  it('Hoplita: defesa muito maior que Warrior', () => {
    const hoplite = getSpecialUnit('greeks')
    const warrior = getUnitDef(UnitType.Warrior)
    expect(hoplite.stats.defense).toBeGreaterThan(warrior.stats.defense)
    expect(hoplite.replacesType).toBe(UnitType.Warrior)
  })

  it('Berserker: ataque maior que Knight', () => {
    const berserker = getSpecialUnit('vikings')
    const knight    = getUnitDef(UnitType.Knight)
    expect(berserker.stats.attack).toBeGreaterThan(knight.stats.attack)
    expect(berserker.replacesType).toBe(UnitType.Knight)
  })

  it('Arqueiro de Cavalo: range 2 e mais movimento que Crossbowman', () => {
    const horseArcher  = getSpecialUnit('china')
    const crossbowman  = getUnitDef(UnitType.Crossbowman)
    expect(horseArcher.stats.range).toBe(2)
    expect(horseArcher.stats.movement).toBeGreaterThan(crossbowman.stats.movement)
    expect(horseArcher.replacesType).toBe(UnitType.Crossbowman)
  })

  it('nenhuma unidade especial tem canFoundCity = true', () => {
    for (const [, unit] of SPECIAL_UNIT_CATALOG) {
      expect(unit.canFoundCity, `${unit.type} não deveria fundar cidades`).toBe(false)
    }
  })
})

// ─── Suite 3 — unitsForCiv ────────────────────────────────────────────────────

describe('unitsForCiv', () => {
  it('Roma em Ancient: Warrior ausente, Legionário presente', () => {
    const units = unitsForCiv('romans', Era.Ancient)
    const types = units.map(u => u.type)
    expect(types).not.toContain(UnitType.Warrior)
    expect(types).toContain('roman_legionary')
  })

  it('Roma em Ancient: total = 3 (Archer, Settler, Legionário)', () => {
    expect(unitsForCiv('romans', Era.Ancient)).toHaveLength(3)
  })

  it('Mongóis em Classical: Cavalry ausente, Cavaleiro Mongol presente', () => {
    const units = unitsForCiv('mongols', Era.Classical)
    const types = units.map(u => u.type)
    expect(types).not.toContain(UnitType.Cavalry)
    expect(types).toContain('mongol_cavalry')
  })

  it('Mongóis em Ancient: Cavaleiro Mongol ausente (era Classical)', () => {
    const units = unitsForCiv('mongols', Era.Ancient)
    const types = units.map(u => u.type)
    expect(types).not.toContain('mongol_cavalry')
    // Warrior ainda presente em Ancient (não é o replaced dos Mongóis)
    expect(types).toContain(UnitType.Warrior)
  })

  it('Vikings em Medieval: Knight ausente, Berserker presente', () => {
    const units = unitsForCiv('vikings', Era.Medieval)
    const types = units.map(u => u.type)
    expect(types).not.toContain(UnitType.Knight)
    expect(types).toContain('viking_berserker')
  })

  it('China em Medieval: Crossbowman ausente, Arqueiro de Cavalo presente', () => {
    const units = unitsForCiv('china', Era.Medieval)
    const types = units.map(u => u.type)
    expect(types).not.toContain(UnitType.Crossbowman)
    expect(types).toContain('china_horse_archer')
  })

  it('total de unidades em Medieval = 7 para qualquer civ', () => {
    for (const id of CIVILIZATION_CATALOG.keys()) {
      expect(
        unitsForCiv(id, Era.Medieval).length,
        `${id}: deve ter 7 unidades em Medieval`,
      ).toBe(7)
    }
  })
})

// ─── Suite 4 — getCivEconomyMultipliers ──────────────────────────────────────

describe('getCivEconomyMultipliers', () => {
  it('Roma: production > 1, gold = 1, food = 1', () => {
    const m = getCivEconomyMultipliers('romans')
    expect(m.production).toBeGreaterThan(1)
    expect(m.gold).toBe(1)
    expect(m.food).toBe(1)
  })

  it('Roma: production multiplier = 1.25', () => {
    expect(getCivEconomyMultipliers('romans').production).toBe(1.25)
  })

  it('Egito: food > 1, gold = 1, production = 1', () => {
    const m = getCivEconomyMultipliers('egyptians')
    expect(m.food).toBeGreaterThan(1)
    expect(m.gold).toBe(1)
    expect(m.production).toBe(1)
  })

  it('China: gold > 1, food = 1, production = 1', () => {
    const m = getCivEconomyMultipliers('china')
    expect(m.gold).toBeGreaterThan(1)
    expect(m.food).toBe(1)
    expect(m.production).toBe(1)
  })

  it('ID desconhecido retorna {1, 1, 1} (sem lançar)', () => {
    expect(getCivEconomyMultipliers('atlantis')).toEqual({ gold: 1, food: 1, production: 1 })
  })

  it('Mongóis: nenhum bônus de economia (todos = 1)', () => {
    const m = getCivEconomyMultipliers('mongols')
    expect(m.gold).toBe(1)
    expect(m.food).toBe(1)
    expect(m.production).toBe(1)
  })
})

// ─── Suite 5 — getCivCombatMultiplier ────────────────────────────────────────

describe('getCivCombatMultiplier', () => {
  it('Mongóis: multiplier > 1', () => {
    expect(getCivCombatMultiplier('mongols')).toBeGreaterThan(1)
  })

  it('Vikings: multiplier > 1', () => {
    expect(getCivCombatMultiplier('vikings')).toBeGreaterThan(1)
  })

  it('Grécia: multiplier > 1 (combatBonus de táticas)', () => {
    expect(getCivCombatMultiplier('greeks')).toBeGreaterThan(1)
  })

  it('Roma: multiplier = 1 (sem bônus de combate)', () => {
    expect(getCivCombatMultiplier('romans')).toBe(1)
  })

  it('Egito: multiplier = 1 (sem bônus de combate)', () => {
    expect(getCivCombatMultiplier('egyptians')).toBe(1)
  })

  it('China: multiplier = 1 (sem bônus de combate)', () => {
    expect(getCivCombatMultiplier('china')).toBe(1)
  })

  it('ID desconhecido retorna 1 (sem lançar)', () => {
    expect(getCivCombatMultiplier('atlantis')).toBe(1)
  })
})

// ─── Suite 6 — getCivVisionBonus ─────────────────────────────────────────────

describe('getCivVisionBonus', () => {
  it('Vikings: visionBonus = 2 (maior exploração)', () => {
    expect(getCivVisionBonus('vikings')).toBe(2)
  })

  it('Mongóis: visionBonus = 1', () => {
    expect(getCivVisionBonus('mongols')).toBe(1)
  })

  it('Grécia: visionBonus = 1', () => {
    expect(getCivVisionBonus('greeks')).toBe(1)
  })

  it('Roma: visionBonus = 0 (sem bônus de visão)', () => {
    expect(getCivVisionBonus('romans')).toBe(0)
  })

  it('ID desconhecido retorna 0 (sem lançar)', () => {
    expect(getCivVisionBonus('atlantis')).toBe(0)
  })
})

// ─── Suite 7 — Integração: economia ──────────────────────────────────────────

describe('integração: getCivEconomyMultipliers → income', () => {
  it('Roma ganha mais produção que civ sem bônus pelo mesmo income', () => {
    const BASE_INCOME = { gold: 10, food: 20, production: 15 }
    const BASE_STOCKPILE = { gold: 50, food: 50, production: 50 }

    // Simular a lógica de turn.ts (delta de income × multiplier)
    function applyBonus(civId: string) {
      const m = getCivEconomyMultipliers(civId)
      return {
        gold:       Math.round(BASE_STOCKPILE.gold       + BASE_INCOME.gold       * m.gold),
        food:       Math.round(BASE_STOCKPILE.food       + BASE_INCOME.food       * m.food),
        production: Math.round(BASE_STOCKPILE.production + BASE_INCOME.production * m.production),
      }
    }

    const romaResult    = applyBonus('romans')
    const noBonus       = applyBonus('atlantis')  // unknown = 1.0

    expect(romaResult.production).toBeGreaterThan(noBonus.production)
    expect(romaResult.gold).toBe(noBonus.gold)
    expect(romaResult.food).toBe(noBonus.food)
  })

  it('Egito ganha mais comida que civ sem bônus pelo mesmo income', () => {
    const m        = getCivEconomyMultipliers('egyptians')
    const mNeutral = getCivEconomyMultipliers('romans')
    const INCOME   = 20
    expect(Math.round(INCOME * m.food)).toBeGreaterThan(Math.round(INCOME * mNeutral.food))
  })
})

// ─── Suite 8 — Integração: combate ───────────────────────────────────────────

describe('integração: getCivCombatMultiplier → resolveCombat', () => {
  const WARRIOR = {
    id: 'w1', unitType: 'warrior', position: { q: 0, r: 0 },
    ownerId: 'p1', hasMoved: false, hasAttacked: false,
    stats: { attack: 10, defense: 5, hp: 10, maxHp: 10, movement: 2 },
  }
  const DEFENDER = {
    id: 'w2', unitType: 'warrior', position: { q: 1, r: 0 },
    ownerId: 'p2', hasMoved: false, hasAttacked: false,
    stats: { attack: 10, defense: 5, hp: 10, maxHp: 10, movement: 2 },
  }
  const BASE_OPTS = { defenderTerrain: TerrainType.Plains }

  it('attackerCivMultiplier > 1 → damageToDefender maior', () => {
    const normal   = resolveCombat(WARRIOR, DEFENDER, BASE_OPTS)
    const boosted  = resolveCombat(WARRIOR, DEFENDER, {
      ...BASE_OPTS,
      attackerCivMultiplier: getCivCombatMultiplier('mongols'),
    })
    expect(boosted.damageToDefender).toBeGreaterThan(normal.damageToDefender)
  })

  it('multiplier = 1 → resultado igual ao sem multiplicador', () => {
    const normal  = resolveCombat(WARRIOR, DEFENDER, BASE_OPTS)
    const neutral = resolveCombat(WARRIOR, DEFENDER, { ...BASE_OPTS, attackerCivMultiplier: 1 })
    expect(neutral.damageToDefender).toBe(normal.damageToDefender)
  })

  it('Mongóis atacam um Vikings defensivo: Mongóis causam mais dano', () => {
    const mongolMult = getCivCombatMultiplier('mongols')
    const vikingMult = getCivCombatMultiplier('vikings')

    const mongolResult = resolveCombat(WARRIOR, DEFENDER, {
      ...BASE_OPTS,
      attackerCivMultiplier: mongolMult,
    })
    const neutralResult = resolveCombat(WARRIOR, DEFENDER, BASE_OPTS)

    // Mongóis devem causar mais dano que sem bônus
    expect(mongolResult.damageToDefender).toBeGreaterThanOrEqual(neutralResult.damageToDefender)
    // Viking combat bonus > 1 também
    expect(vikingMult).toBeGreaterThan(1)
  })
})
