import type { HexCoord } from './types.js'
import { UnitType, Era } from './types.js'
import type { Unit, UnitStats } from './types.js'

// ─── Era ordering ─────────────────────────────────────────────────────────────

const ERA_ORDER: Record<Era, number> = {
  [Era.Ancient]:   0,
  [Era.Classical]: 1,
  [Era.Medieval]:  2,
}

// ─── UnitDefinition ───────────────────────────────────────────────────────────

/**
 * Blueprint for a unit type. Describes how a unit is trained and what stats a
 * fresh instance starts with. Not a Unit itself — createUnitInstance() produces
 * the actual Unit from this definition.
 */
export interface UnitDefinition {
  readonly type:           UnitType
  readonly name:           string
  readonly eraRequired:    Era
  readonly productionCost: number
  /** Template stats. `hp` is omitted here; `createUnitInstance` sets hp = maxHp. */
  readonly stats: Omit<UnitStats, 'hp'>
  readonly canFoundCity:   boolean
  readonly description:    string
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const CATALOG_ENTRIES: readonly UnitDefinition[] = [
  // ── Era Ancient ──────────────────────────────────────────────────────────
  {
    type:           UnitType.Warrior,
    name:           'Guerreiro',
    eraRequired:    Era.Ancient,
    productionCost: 20,
    stats:          { attack: 10, defense: 5, maxHp: 10, movement: 2 },
    canFoundCity:   false,
    description:    'Infantaria básica. Corpo-a-corpo confiável na era antiga.',
  },
  {
    type:           UnitType.Archer,
    name:           'Arqueiro',
    eraRequired:    Era.Ancient,
    productionCost: 25,
    stats:          { attack: 8, defense: 3, maxHp: 8, movement: 2, range: 2 },
    canFoundCity:   false,
    description:    'Ataque à distância. Fraco em defesa próxima.',
  },
  {
    type:           UnitType.Settler,
    name:           'Colono',
    eraRequired:    Era.Ancient,
    productionCost: 40,
    stats:          { attack: 0, defense: 1, maxHp: 6, movement: 2 },
    canFoundCity:   true,
    description:    'Funda novas cidades. Inútil em combate — proteja-o.',
  },

  // ── Era Classical ─────────────────────────────────────────────────────────
  {
    type:           UnitType.Cavalry,
    name:           'Cavalaria',
    eraRequired:    Era.Classical,
    productionCost: 35,
    stats:          { attack: 12, defense: 6, maxHp: 10, movement: 4 },
    canFoundCity:   false,
    description:    'Movimento alto — ideal para exploração e flanqueamento.',
  },
  {
    type:           UnitType.Catapult,
    name:           'Catapulta',
    eraRequired:    Era.Classical,
    productionCost: 50,
    stats:          { attack: 15, defense: 2, maxHp: 8, movement: 1, range: 2, cityAttackBonus: 8 },
    canFoundCity:   false,
    description:    'Lenta, mas devastadora contra cidades e guarnições.',
  },

  // ── Era Medieval ──────────────────────────────────────────────────────────
  {
    type:           UnitType.Knight,
    name:           'Cavaleiro',
    eraRequired:    Era.Medieval,
    productionCost: 60,
    stats:          { attack: 18, defense: 10, maxHp: 14, movement: 3 },
    canFoundCity:   false,
    description:    'A unidade corpo-a-corpo mais forte. Custa caro, vale cada produção.',
  },
  {
    type:           UnitType.Crossbowman,
    name:           'Besteiro',
    eraRequired:    Era.Medieval,
    productionCost: 45,
    stats:          { attack: 14, defense: 5, maxHp: 10, movement: 2, range: 2 },
    canFoundCity:   false,
    description:    'Arqueiro avançado com mais ataque e resistência.',
  },
]

/** Lookup map: UnitType → UnitDefinition. O(1) access. */
export const UNIT_CATALOG: ReadonlyMap<UnitType, UnitDefinition> = new Map(
  CATALOG_ENTRIES.map(d => [d.type, d]),
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the definition for a unit type. Throws if the type is unknown. */
export function getUnitDef(type: UnitType): UnitDefinition {
  const def = UNIT_CATALOG.get(type)
  if (!def) throw new Error(`Unknown UnitType: ${type}`)
  return def
}

/**
 * Returns true if the unit can be trained given the game's current era.
 * A unit requires ERA_ORDER[eraRequired] <= ERA_ORDER[currentEra].
 */
export function canTrainUnit(unitType: UnitType, currentEra: Era): boolean {
  const def = getUnitDef(unitType)
  return ERA_ORDER[currentEra] >= ERA_ORDER[def.eraRequired]
}

/** All unit definitions available to train in `era` (cumulative — earlier eras included). */
export function unitsAvailableInEra(era: Era): readonly UnitDefinition[] {
  return CATALOG_ENTRIES.filter(d => canTrainUnit(d.type, era))
}

/**
 * Produces a fresh Unit instance from a definition. Stats are copied from the
 * blueprint and hp is set to maxHp (full health on creation).
 */
export function createUnitInstance(
  id:       string,
  type:     UnitType,
  ownerId:  string,
  position: HexCoord,
): Unit {
  const def = getUnitDef(type)
  return {
    id,
    unitType:     type,
    position,
    ownerId,
    hasMoved:     false,
    hasAttacked:  false,
    canFoundCity: def.canFoundCity || undefined,
    stats: {
      attack:          def.stats.attack,
      defense:         def.stats.defense,
      hp:              def.stats.maxHp,
      maxHp:           def.stats.maxHp,
      movement:        def.stats.movement,
      ...(def.stats.range           !== undefined && { range: def.stats.range }),
      ...(def.stats.cityAttackBonus !== undefined && { cityAttackBonus: def.stats.cityAttackBonus }),
    },
  }
}

/**
 * Like createUnitInstance but accepts any unit blueprint (standard or special).
 * Callers that have already resolved a UnitDefinition or SpecialUnitDefinition
 * should prefer this over re-deriving the type through the enum catalog.
 */
export function createUnitFromDef(
  id:       string,
  def:      { type: string; stats: Omit<UnitStats, 'hp'>; canFoundCity: boolean },
  ownerId:  string,
  position: HexCoord,
): Unit {
  return {
    id,
    unitType:     def.type,
    position,
    ownerId,
    hasMoved:     false,
    hasAttacked:  false,
    canFoundCity: def.canFoundCity || undefined,
    stats: {
      attack:          def.stats.attack,
      defense:         def.stats.defense,
      hp:              def.stats.maxHp,
      maxHp:           def.stats.maxHp,
      movement:        def.stats.movement,
      ...(def.stats.range           !== undefined && { range: def.stats.range }),
      ...(def.stats.cityAttackBonus !== undefined && { cityAttackBonus: def.stats.cityAttackBonus }),
    },
  }
}
