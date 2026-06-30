import { UnitType, Era } from './types.js'
import type { Civilization } from './types.js'
import { type UnitDefinition, unitsAvailableInEra } from './units.js'

// ─── SpecialUnitDefinition ────────────────────────────────────────────────────

/**
 * A civilization's unique unit. Replaces one standard unit in the training
 * roster — same era as the replaced unit, strictly better in at least one area.
 */
export interface SpecialUnitDefinition extends Omit<UnitDefinition, 'type'> {
  readonly type:         string    // e.g. 'roman_legionary' (NOT a UnitType enum)
  readonly replacesType: UnitType  // the standard unit this substitutes
}

// ─── Special unit catalog ─────────────────────────────────────────────────────

const SPECIAL_UNITS: readonly SpecialUnitDefinition[] = [
  // Roma — Warrior replacement: stronger defense and HP, slightly more attack
  {
    type:           'roman_legionary',
    name:           'Legionário',
    eraRequired:    Era.Ancient,
    productionCost: 30,
    replacesType:   UnitType.Warrior,
    stats:          { attack: 12, defense: 9, maxHp: 12, movement: 2 },
    canFoundCity:   false,
    description:    'Infantaria romana de elite. Discipline defensiva superior ao Guerreiro.',
  },
  // Mongóis — Cavalry replacement: extra movement, slightly better stats
  {
    type:           'mongol_cavalry',
    name:           'Cavaleiro Mongol',
    eraRequired:    Era.Classical,
    productionCost: 45,
    replacesType:   UnitType.Cavalry,
    stats:          { attack: 14, defense: 7, maxHp: 12, movement: 5 },
    canFoundCity:   false,
    description:    'Cavalaria das estepes. Movimenta-se mais rápido que qualquer unidade da era.',
  },
  // Egito — Cavalry replacement: higher attack, lower defense
  {
    type:           'egypt_war_chariot',
    name:           'Carro de Guerra',
    eraRequired:    Era.Classical,
    productionCost: 40,
    replacesType:   UnitType.Cavalry,
    stats:          { attack: 14, defense: 5, maxHp: 10, movement: 4 },
    canFoundCity:   false,
    description:    'Veículo de combate veloz. Maior poder de ataque, menor resistência.',
  },
  // Grécia — Warrior replacement: muito mais defesa, ataque ligeiramente menor
  {
    type:           'greek_hoplite',
    name:           'Hoplita',
    eraRequired:    Era.Ancient,
    productionCost: 30,
    replacesType:   UnitType.Warrior,
    // Nerf (BAL-2): hp 14→12 to honour the "≤35% stat-sum over base" cap
    // (was 40% over Warrior). Defensive identity (def 12) kept intact.
    stats:          { attack: 9, defense: 12, maxHp: 12, movement: 2 },
    canFoundCity:   false,
    description:    'Infantaria de formação cerrada. Defesa excepcional, ataque contido.',
  },
  // Vikings — Knight replacement: ataque devastador, defesa reduzida
  {
    type:           'viking_berserker',
    name:           'Berserker',
    eraRequired:    Era.Medieval,
    productionCost: 70,
    replacesType:   UnitType.Knight,
    // Nerf (BAL-2): atk 24→20, hp 14→12. With the +15% Viking combat bonus its
    // effective attack stays a threat without one-shotting; sum now below Knight.
    stats:          { attack: 20, defense: 8, maxHp: 12, movement: 3 },
    canFoundCity:   false,
    description:    'Guerreiro em transe de batalha. Ataque excepcional; sem escudo.',
  },
  // China — Crossbowman replacement: mais movimento, range mantido
  {
    type:           'china_horse_archer',
    name:           'Arqueiro de Cavalo',
    eraRequired:    Era.Medieval,
    productionCost: 55,
    replacesType:   UnitType.Crossbowman,
    stats:          { attack: 15, defense: 6, maxHp: 12, movement: 3, range: 2 },
    canFoundCity:   false,
    description:    'Arqueiro montado. Combina mobilidade de cavalaria com alcance de besteiro.',
  },
  // Persas — Warrior replacement: similar ao Guerreiro mas com defesa superior
  {
    type:           'persian_immortal',
    name:           'Imortal',
    eraRequired:    Era.Ancient,
    productionCost: 15,
    replacesType:   UnitType.Warrior,
    stats:          { attack: 9, defense: 6, maxHp: 12, movement: 2 },
    canFoundCity:   false,
    description:    'Guarda imperial persa. Resistente e disciplinado.',
  },
  // Astecas — Cavalry replacement: mais ágil, menos tanque
  {
    type:           'aztec_eagle_warrior',
    name:           'Águia Guerreira',
    eraRequired:    Era.Classical,
    productionCost: 38,
    replacesType:   UnitType.Cavalry,
    stats:          { attack: 13, defense: 4, maxHp: 9, movement: 4 },
    canFoundCity:   false,
    description:    'Guerreiro ágil. Captura prisioneiros em combate.',
  },
  // Japoneses — Knight replacement; counterattack 25% é TODO (resolveCombat não suporta)
  {
    type:           'japanese_samurai',
    name:           'Samurai',
    eraRequired:    Era.Medieval,
    productionCost: 65,
    replacesType:   UnitType.Knight,
    // TODO: counterattack (25% dano recebido devolvido) aguarda refactor de resolveCombat
    stats:          { attack: 20, defense: 9, maxHp: 14, movement: 2 },
    canFoundCity:   false,
    description:    'Guerreiro do bushido. Disciplina inabalável no combate.',
  },
  // Otomanos — Crossbowman replacement: mais ataque
  {
    type:           'ottoman_janissary',
    name:           'Janízaro',
    eraRequired:    Era.Medieval,
    productionCost: 50,
    replacesType:   UnitType.Crossbowman,
    stats:          { attack: 16, defense: 5, maxHp: 12, movement: 2, range: 2 },
    canFoundCity:   false,
    description:    'Elite jenízara com alcance de besteiro.',
  },
]

export const SPECIAL_UNIT_CATALOG: ReadonlyMap<string, SpecialUnitDefinition> = new Map(
  SPECIAL_UNITS.map(u => [u.type, u]),
)

// ─── Civilization catalog ─────────────────────────────────────────────────────

const CATALOG_ENTRIES: readonly Civilization[] = [
  {
    id:          'romans',
    name:        'Romanos',
    description: 'Mestres da engenharia e infraestrutura. Cidades produzem mais em menos tempo.',
    abilities: [
      {
        id:          'roman_infrastructure',
        name:        'Infraestrutura Imperial',
        description: '+25% de produção em todas as cidades.',
        effect:      { type: 'productionBonus', multiplier: 1.25 },
      },
    ],
    specialUnitType: 'roman_legionary',
  },
  {
    id:          'mongols',
    name:        'Mongóis',
    description: 'Conquistadores das estepes. Combate feroz e visão ampla do terreno.',
    abilities: [
      {
        id:          'mongol_fury',
        name:        'Fúria das Estepes',
        description: '+20% de dano em combate.',
        effect:      { type: 'combatBonus', multiplier: 1.2 },
      },
      {
        id:          'mongol_scouting',
        name:        'Exploração Nômade',
        description: '+1 hex de visão para todas as unidades.',
        effect:      { type: 'visionBonus', extraRadius: 1 },
      },
    ],
    specialUnitType: 'mongol_cavalry',
  },
  {
    id:          'egyptians',
    name:        'Egípcios',
    description: 'Civilização do Nilo. Abundância agrícola alimenta grandes populações.',
    abilities: [
      {
        id:          'egypt_nile_bounty',
        name:        'Fartura do Nilo',
        description: '+30% de produção de comida em todas as cidades.',
        effect:      { type: 'foodBonus', multiplier: 1.3 },
      },
    ],
    specialUnitType: 'egypt_war_chariot',
  },
  {
    id:          'greeks',
    name:        'Gregos',
    description: 'Filósofos e estrategistas. Visão aguçada e táticas defensivas superiores.',
    abilities: [
      {
        id:          'greek_philosophy',
        name:        'Filosofia Militar',
        description: '+10% de dano em combate (táticas superiores).',
        effect:      { type: 'combatBonus', multiplier: 1.1 },
      },
      {
        id:          'greek_culture',
        name:        'Cultura Helênica',
        description: '+1 hex de visão (conhecimento geográfico amplo).',
        effect:      { type: 'visionBonus', extraRadius: 1 },
      },
    ],
    specialUnitType: 'greek_hoplite',
  },
  {
    id:          'vikings',
    name:        'Vikings',
    description: 'Guerreiros do norte. Brutais em combate e temíveis exploradores.',
    abilities: [
      {
        id:          'viking_raid',
        name:        'Incursão Nórdica',
        description: '+15% de dano em combate.',
        effect:      { type: 'combatBonus', multiplier: 1.15 },
      },
      {
        id:          'viking_exploration',
        name:        'Espírito Explorador',
        description: '+2 hexes de visão para todas as unidades.',
        effect:      { type: 'visionBonus', extraRadius: 2 },
      },
    ],
    specialUnitType: 'viking_berserker',
  },
  {
    id:          'china',
    name:        'China',
    description: 'Potência comercial e tecnológica. Ouro flui abundantemente.',
    abilities: [
      {
        id:          'china_silk_road',
        name:        'Rota da Seda',
        description: '+25% de produção de ouro em todas as cidades.',
        effect:      { type: 'goldBonus', multiplier: 1.25 },
      },
    ],
    specialUnitType: 'china_horse_archer',
  },
  {
    id:          'persians',
    name:        'Persas',
    description: 'Império mercantil da era antiga. A Rota Real conecta e enriquece.',
    abilities: [
      {
        id:          'persian_royal_road',
        name:        'Rota Real',
        // TODO: desconto de 50% em ouro para propostas de pacto (proposePact sem custo de ouro atual)
        description: '+20% renda de ouro por turno.',
        effect:      { type: 'goldBonus', multiplier: 1.2 },
      },
    ],
    specialUnitType: 'persian_immortal',
  },
  {
    id:          'aztecs',
    name:        'Astecas',
    description: 'Expansão ritual. Cada conquista alimenta a máquina de guerra.',
    abilities: [
      {
        id:          'aztec_ritual_expansion',
        name:        'Expansão Ritual',
        description: '+5 produção permanente por cidade capturada.',
        effect:      { type: 'conquestBonus', resourceType: 'production', amountPerCity: 5 },
      },
    ],
    specialUnitType: 'aztec_eagle_warrior',
  },
  {
    id:          'japanese',
    name:        'Japoneses',
    description: 'Caminho do guerreiro. O Bushido eleva todo combatente.',
    abilities: [
      {
        id:          'japanese_bushido',
        name:        'Bushido',
        description: '+15% de dano em combate para todas as unidades.',
        effect:      { type: 'combatBonus', multiplier: 1.15 },
      },
    ],
    specialUnitType: 'japanese_samurai',
  },
  {
    id:          'ottomans',
    name:        'Otomanos',
    description: 'Mestres do cerco. Catapultas chegam mais cedo e custam menos.',
    abilities: [
      {
        id:          'ottoman_siege_master',
        name:        'Mestre de Cerco',
        description: 'Catapultas custam 30% menos produção.',
        effect:      { type: 'siegeDiscount', unitType: 'catapult', multiplier: 0.7 },
      },
    ],
    specialUnitType: 'ottoman_janissary',
  },
]

export const CIVILIZATION_CATALOG: ReadonlyMap<string, Civilization> = new Map(
  CATALOG_ENTRIES.map(c => [c.id, c]),
)

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getCivilization(id: string): Civilization {
  const civ = CIVILIZATION_CATALOG.get(id)
  if (!civ) throw new Error(`Unknown civilization: ${id}`)
  return civ
}

export function getSpecialUnit(civId: string): SpecialUnitDefinition {
  const civ = getCivilization(civId)
  const unit = SPECIAL_UNIT_CATALOG.get(civ.specialUnitType)
  if (!unit) throw new Error(`Missing special unit definition: ${civ.specialUnitType}`)
  return unit
}

/**
 * Returns all trainable units for a civilization in a given era.
 * The civ's `replacesType` is removed from the standard catalog and the
 * special unit is inserted in its place (if its era is also available).
 */
export function unitsForCiv(
  civId:  string,
  era:    Era,
): readonly (UnitDefinition | SpecialUnitDefinition)[] {
  const special = getSpecialUnit(civId)
  const baseAvailable = unitsAvailableInEra(era)
  const replacedIsAvailable = baseAvailable.some(u => u.type === special.replacesType)
  const filtered = baseAvailable.filter(u => u.type !== special.replacesType)
  return replacedIsAvailable ? [...filtered, special] : filtered
}

// ─── Effect aggregators ───────────────────────────────────────────────────────

/**
 * Economy multipliers for a civilization's turn income (gold, food, production).
 * Returns {1, 1, 1} for unknown civ IDs so the caller stays safe for legacy saves.
 */
export function getCivEconomyMultipliers(
  civId: string,
): { gold: number; food: number; production: number } {
  try {
    const civ = getCivilization(civId)
    let gold = 1, food = 1, production = 1
    for (const ability of civ.abilities) {
      const e = ability.effect
      if (e.type === 'goldBonus')       gold       *= e.multiplier
      if (e.type === 'foodBonus')       food       *= e.multiplier
      if (e.type === 'productionBonus') production *= e.multiplier
    }
    return { gold, food, production }
  } catch {
    return { gold: 1, food: 1, production: 1 }
  }
}

/**
 * Combined combat damage multiplier for a civilization (product of all combatBonus effects).
 * Returns 1 for unknown IDs.
 */
export function getCivCombatMultiplier(civId: string): number {
  try {
    const civ = getCivilization(civId)
    return civ.abilities
      .filter(a => a.effect.type === 'combatBonus')
      .reduce((acc, a) => {
        const e = a.effect as { type: 'combatBonus'; multiplier: number }
        return acc * e.multiplier
      }, 1)
  } catch {
    return 1
  }
}

/** Sum of extra vision hexes from all visionBonus abilities. Returns 0 for unknown IDs. */
export function getCivVisionBonus(civId: string): number {
  try {
    const civ = getCivilization(civId)
    return civ.abilities.reduce((sum, a) => {
      const e = a.effect
      return e.type === 'visionBonus' ? sum + e.extraRadius : sum
    }, 0)
  } catch {
    return 0
  }
}
