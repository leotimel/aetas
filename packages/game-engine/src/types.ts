// ─── Coordinates ─────────────────────────────────────────────────────────────

/**
 * Axial hex coordinates (q, r). s = -q - r is derived when needed for cubic
 * operations (e.g. rotation). Chosen over full cubic because payloads stay
 * smaller and all v1 operations work directly in axial space.
 */
export interface HexCoord {
  readonly q: number
  readonly r: number
}

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum TurnState {
  WaitingForAction = 'waitingForAction',
  Processing       = 'processing',
  Completed        = 'completed',
}

export enum CitySpecialization {
  Military   = 'military',
  Commercial = 'commercial',
  Scientific = 'scientific',
}

export enum ResourceType {
  Gold       = 'gold',
  Food       = 'food',
  Production = 'production',
}

export enum Era {
  Ancient  = 'ancient',
  Classical = 'classical',
  Medieval = 'medieval',
}

export enum TerrainType {
  Plains   = 'plains',
  Forest   = 'forest',
  Mountain = 'mountain',
  Hills    = 'hills',
  Water    = 'water',
}

/** Base unit types available to all civilizations. */
export enum UnitType {
  // Era Ancient
  Warrior     = 'warrior',
  Archer      = 'archer',
  Settler     = 'settler',
  // Era Classical
  Cavalry     = 'cavalry',
  Catapult    = 'catapult',
  // Era Medieval
  Knight      = 'knight',
  Crossbowman = 'crossbowman',
}

export enum CombatDisputeStatus {
  Pending             = 'pending',
  ResolvedByAction    = 'resolvedByAction',
  ResolvedByTimeout   = 'resolvedByTimeout',
}

export enum DiplomaticProposalStatus {
  Pending  = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
}

// ─── Value objects ────────────────────────────────────────────────────────────

export interface Resources {
  gold:       number
  food:       number
  production: number
}

export interface UnitStats {
  attack:           number
  defense:          number
  hp:               number
  maxHp:            number
  /** Hexes this unit can move per turn. */
  movement:         number
  /** Attack range in hexes. Omitted = 1 (melee). */
  range?:           number
  /** Extra damage against cities (siege units only). */
  cityAttackBonus?: number
}

// ─── Civilization ─────────────────────────────────────────────────────────────

/**
 * Discriminated union of all ability effects the engine knows how to apply.
 * Economy, combat, and map modules switch on `type` to apply the bonus.
 */
export type CivilizationAbilityEffect =
  | { type: 'productionBonus'; multiplier: number }
  | { type: 'combatBonus';     multiplier: number }
  | { type: 'goldBonus';       multiplier: number }
  | { type: 'foodBonus';       multiplier: number }
  | { type: 'visionBonus';     extraRadius: number }

export interface CivilizationAbility {
  readonly id:          string
  readonly name:        string
  readonly description: string
  readonly effect:      CivilizationAbilityEffect
}

export interface Civilization {
  readonly id:             string
  readonly name:           string
  readonly description:    string
  /** 1-2 passive abilities applied by the engine; never an empty array. */
  readonly abilities:      readonly [CivilizationAbility, ...CivilizationAbility[]]
  /**
   * String ID of this civilization's special unit. May be one of UnitType or
   * a civilization-specific string (e.g. 'roman_legionary'). Clients display
   * it; the engine resolves stats from a unit-definition registry (Fase 1.1).
   */
  readonly specialUnitType: string
}

// ─── Player ───────────────────────────────────────────────────────────────────

export type AIDifficulty = 'easy' | 'normal' | 'hard'

export interface Player {
  readonly id:              string  // matches Supabase auth userId
  readonly displayName:     string
  readonly civilizationId:  string
  resources:                Resources
  isEliminated:             boolean
  /** True while the substitute AI is acting on behalf of this player. */
  isAIControlled:           boolean
  /** Set only for dedicated AI opponent players, not for human-substitute turns. */
  aiDifficulty?:            AIDifficulty
}

// ─── Unit ─────────────────────────────────────────────────────────────────────

export interface Unit {
  readonly id:        string
  /**
   * UnitType value or civilization special unit string ID.
   * Note for Swift/Kotlin clients: do NOT name this `unit` — conflicts with
   * the built-in `Unit` type in both languages. Use `gameUnit` or `piece`.
   */
  readonly unitType:  string
  position:           HexCoord
  stats:              UnitStats
  readonly ownerId:   string
  /** Resets to false at the start of the owner's turn. */
  hasMoved:           boolean
  hasAttacked:        boolean
  /** True only for Settler units; allows founding a new city. */
  canFoundCity?:      boolean
}

// ─── Buildings ────────────────────────────────────────────────────────────────

/** One completed building slot per city, keyed by type. Max one of each. */
export enum BuildingType {
  Barracks = 'barracks',
  Wall     = 'wall',
  Market   = 'market',
  Port     = 'port',
  Library  = 'library',
  Temple   = 'temple',
}

/** Tracks a building currently under construction. Cleared when turnsRemaining hits 0. */
export interface BuildingConstruction {
  readonly buildingType:  BuildingType
  turnsRemaining:         number
  /** Original turn count (unchanged after start — used for progress display). */
  readonly totalTurns:    number
}

// ─── City ─────────────────────────────────────────────────────────────────────

export interface City {
  readonly id:        string
  readonly name:      string
  position:           HexCoord
  readonly ownerId:   string
  population:         number
  specialization:     CitySpecialization
  level:              number
  /** Accumulated food toward next population growth. Resets (partially) on growth. */
  foodStored:         number
  /** Completed buildings. Optional for backward compat with existing DB rows (treat as []). */
  buildings?:         readonly BuildingType[]
  /** Active construction slot. Optional; null/undefined = idle. */
  construction?:      BuildingConstruction | null
  /** City HP for siege mechanics. Optional for backward compat; defaults to 10 when absent. */
  hp?:                number
  maxHp?:             number
}

// ─── Map ──────────────────────────────────────────────────────────────────────

export interface HexTile {
  readonly coord:       HexCoord
  readonly terrainType: TerrainType
}

export interface GameMap {
  /** Flat array of all tiles. Use hexKey(coord) for O(1) lookup in map.ts. */
  readonly tiles:          readonly HexTile[]
  /** Radius of the hex-of-hexes map. Total tiles ≈ 3r²+3r+1. */
  readonly radius:         number
  /** Deterministic seed used to regenerate this map. */
  readonly seed:           string
  /** One starting HexCoord per player slot, set during map generation. */
  readonly startPositions: readonly HexCoord[]
}

// ─── Fog of war ───────────────────────────────────────────────────────────────

export interface PlayerFogOfWar {
  readonly playerId:    string
  /** Hexes currently in vision range of at least one unit/city. */
  visibleHexes:         readonly HexCoord[]
  /** All hexes ever seen; never shrinks. Used for map rendering. */
  exploredHexes:        readonly HexCoord[]
}

// ─── Diplomacy ────────────────────────────────────────────────────────────────

export interface NonAggressionPact {
  readonly id:           string
  readonly proposerId:   string
  readonly acceptorId:   string
  readonly agreedAtTurn: number
}

/** An active state of war between two players. Symmetric; either party may have declared it. */
export interface War {
  readonly id:             string
  readonly declarerId:     string
  readonly targetId:       string
  readonly declaredAtTurn: number
}

/** Kind of diplomatic proposal. When absent on legacy rows: terms present → 'trade', else 'pact'. */
export type DiplomaticProposalKind = 'pact' | 'trade' | 'peace'

/** What the proposer offers and what they request in return. Both sides must be satisfied at accept time. */
export interface ResourceTradeTerms {
  offer:   Resources
  request: Resources
}

export interface DiplomaticProposal {
  readonly id:            string
  readonly proposerId:    string
  readonly targetId:      string
  status:                 DiplomaticProposalStatus
  readonly createdAtTurn: number
  /** Discriminator. Optional for backward compat with rows written before it existed. */
  readonly kind?:         DiplomaticProposalKind
  /** Present for resource trade proposals; absent for non-aggression pact / peace proposals. */
  readonly terms?:        ResourceTradeTerms
}

// ─── Combat ───────────────────────────────────────────────────────────────────

export interface CombatDispute {
  readonly id:               string
  readonly attackerUnitId:   string
  readonly defenderUnitId:   string
  readonly attackerPlayerId: string
  readonly defenderPlayerId: string
  /** Unix timestamp ms when the dispute was opened. */
  readonly createdAt:        number
  /** createdAt + COMBAT_TIMEOUT_MS (~24h). Auto-resolves if neither acts. */
  readonly expiresAt:        number
  status:                    CombatDisputeStatus
}

// ─── Daily challenge ─────────────────────────────────────────────────────────

export interface DailyChallenge {
  /** ISO date string: YYYY-MM-DD. Also used as the map seed. */
  readonly date:   string
  readonly gameId: string
}

// ─── GameState ───────────────────────────────────────────────────────────────

/**
 * Immutable snapshot of a game at a point in time. The engine always produces
 * a new GameState rather than mutating the existing one, making state
 * transitions explicit and easy to test.
 */
export interface GameState {
  readonly gameId:            string
  players:                    Player[]
  readonly map:               GameMap
  units:                      Unit[]
  cities:                     City[]
  turnNumber:                 number
  currentPlayerId:            string
  turnState:                  TurnState
  era:                        Era
  eraProgress?:               number   // science points accumulated toward next era; absent = 0
  /** Partida termina quando turnNumber > maxTurns. */
  readonly maxTurns:          number
  combatDisputes:             CombatDispute[]
  nonAggressionPacts:         NonAggressionPact[]
  wars?:                      War[]   // active wars; absent = none (backward compat)
  diplomaticProposals:        DiplomaticProposal[]
  fogOfWar:                   PlayerFogOfWar[]
  /** Set when the game ends; null while in progress. */
  winner:                     string | null
  isFinished:                 boolean
}
