import { CombatDisputeStatus, BuildingType, TerrainType, CitySpecialization } from './types.js'
import type { GameState, Unit, HexCoord, City, Resources } from './types.js'
import { canSubmitAction, endTurn, getPlayerById, type TurnHooks } from './turn.js'
import {
  createCombatDispute,
  resolveCombatImmediate,
  resolveDisputeByAction,
  resolveTimedOutDispute,
} from './combat.js'
import {
  relationBetween,
  proposeNonAggressionPact,
  proposeResourceTrade,
  declareWar,
  proposePeace,
  breakNonAggressionPact,
  respondToProposal,
  type DiplomacyResult,
} from './diplomacy.js'
import { hexDistance, hexKey, territoryOwnerAt, updateFogOfWar } from './map.js'
import { createUnitFromDef } from './units.js'
import { unitsForCiv } from './civilizations.js'
import { getBuildingDef, startConstruction } from './buildings.js'
import { cityMaxHp, cityDefense } from './economy.js'
import { eliminatePlayersWithNoCities, finalizeIfDominated } from './scoring.js'

// ─── Action model ─────────────────────────────────────────────────────────────

/**
 * The canonical set of player actions the engine currently supports. Both the
 * AI (ai.ts) and future human action handlers (Edge Functions) go through this
 * SAME layer, so "the AI passes the same validation a human passes" is literal.
 */
export type GameAction =
  | { type: 'endTurn' }
  | { type: 'respondToDispute'; disputeId: string }
  | { type: 'initiateCombat'; attackerUnitId: string; defenderUnitId: string }
  | { type: 'trainUnit'; cityId: string; unitType: string; unitId: string }
  | { type: 'constructBuilding'; cityId: string; buildingType: BuildingType }
  | { type: 'moveUnit'; unitId: string; targetCoord: HexCoord }
  | { type: 'foundCity'; unitId: string; cityId: string; cityName: string; specialization: CitySpecialization }
  | { type: 'attackCity'; unitId: string; cityId: string }
  | { type: 'proposePact'; targetId: string }
  | { type: 'proposeTrade'; targetId: string; offer: Resources; request: Resources }
  | { type: 'declareWar'; targetId: string }
  | { type: 'proposePeace'; targetId: string }
  | { type: 'breakPact'; targetId: string }
  | { type: 'respondToDiplomacy'; proposalId: string; accept: boolean }
  | { type: 'fortifyCity'; cityId: string; goldAmount: number }

export type ActionValidation =
  | { valid: true }
  | { valid: false; reason: string }

export type ApplyActionResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: string; state: GameState }

const DEFAULT_HOOKS: TurnHooks = { resolveTimedOutDispute }

// ─── Validation ───────────────────────────────────────────────────────────────

function findUnit(state: GameState, id: string): Unit | undefined {
  return state.units.find(u => u.id === id)
}

/**
 * Declares war if the two players are currently neutral; otherwise a no-op.
 * Attacking is itself an act of war: combat against a pact is already rejected
 * in validateAction, so the only auto-war case is a neutral target.
 */
function ensureWarDeclared(
  state: GameState, attackerId: string, targetOwnerId: string,
): GameState {
  if (relationBetween(state, attackerId, targetOwnerId) === 'neutral') {
    const res = declareWar(state, attackerId, targetOwnerId)
    if (res.ok) return res.state
  }
  return state
}

/**
 * The single legality gate for any action. EVERY action first requires that it
 * is the player's turn (canSubmitAction). This is what the AI's output must
 * satisfy and what a human action handler must also call.
 */
export function validateAction(
  state: GameState,
  playerId: string,
  action: GameAction,
  _now: number,
): ActionValidation {
  const gate = canSubmitAction(state, playerId)
  if (!gate.valid) return gate

  switch (action.type) {
    case 'endTurn':
      return { valid: true }

    case 'respondToDispute': {
      const dispute = state.combatDisputes.find(d => d.id === action.disputeId)
      if (!dispute) return { valid: false, reason: 'dispute not found' }
      if (dispute.status !== CombatDisputeStatus.Pending) {
        return { valid: false, reason: 'dispute already resolved' }
      }
      if (
        playerId !== dispute.attackerPlayerId &&
        playerId !== dispute.defenderPlayerId
      ) {
        return { valid: false, reason: 'player not involved in this dispute' }
      }
      return { valid: true }
    }

    case 'initiateCombat': {
      const attacker = findUnit(state, action.attackerUnitId)
      const defender = findUnit(state, action.defenderUnitId)
      if (!attacker || !defender) return { valid: false, reason: 'unit not found' }
      if (attacker.id === defender.id) {
        return { valid: false, reason: 'a unit cannot attack itself' }
      }
      if (attacker.ownerId !== playerId) {
        return { valid: false, reason: 'attacker is not yours' }
      }
      if (attacker.ownerId === defender.ownerId) {
        return { valid: false, reason: 'cannot attack your own unit' }
      }
      if (hexDistance(attacker.position, defender.position) !== 1) {
        return { valid: false, reason: 'target is not adjacent' }
      }
      if (attacker.hasAttacked) {
        return { valid: false, reason: 'unit has already attacked this turn' }
      }
      if (relationBetween(state, playerId, defender.ownerId) === 'pact') {
        return { valid: false, reason: 'non-aggression pact prevents this attack' }
      }
      const alreadyDisputing = state.combatDisputes.some(
        d => d.status === CombatDisputeStatus.Pending && d.attackerUnitId === attacker.id,
      )
      if (alreadyDisputing) {
        return { valid: false, reason: 'unit already has a pending dispute' }
      }
      return { valid: true }
    }

    case 'trainUnit': {
      const city = state.cities.find(c => c.id === action.cityId)
      if (!city) return { valid: false, reason: 'city not found' }
      if (city.ownerId !== playerId) return { valid: false, reason: 'not your city' }

      const player = getPlayerById(state, playerId)!
      const allUnits = unitsForCiv(player.civilizationId, state.era)
      const unitDef = allUnits.find(u => u.type === action.unitType)
      if (!unitDef) return { valid: false, reason: 'unit not available in this era' }

      const rawCost = unitDef.productionCost
      const effectiveCost =
        player.civilizationId === 'ottomans' && unitDef.type === 'catapult'
          ? Math.floor(rawCost * 0.7)
          : rawCost
      if (player.resources.production < effectiveCost) {
        return { valid: false, reason: 'insufficient production' }
      }

      const foodCost = Math.ceil(effectiveCost / 2)
      const goldCost = Math.ceil(effectiveCost / 3)
      if (player.resources.food < foodCost) return { valid: false, reason: 'insufficient food' }
      if (player.resources.gold < goldCost) return { valid: false, reason: 'insufficient gold' }

      const totalPop = state.cities
        .filter(c => c.ownerId === playerId)
        .reduce((s, c) => s + c.population, 0)
      const currentUnits = state.units.filter(u => u.ownerId === playerId).length
      if (currentUnits >= totalPop) return { valid: false, reason: 'insufficient population' }

      const alreadyThere = state.units.some(
        u => u.ownerId === playerId && hexKey(u.position) === hexKey(city.position),
      )
      if (alreadyThere) return { valid: false, reason: 'city hex occupied' }

      return { valid: true }
    }

    case 'constructBuilding': {
      const city = state.cities.find(c => c.id === action.cityId)
      if (!city) return { valid: false, reason: 'city not found' }
      if (city.ownerId !== playerId) return { valid: false, reason: 'not your city' }

      const buildingDef = getBuildingDef(action.buildingType)
      if (buildingDef.specialization !== city.specialization) {
        return { valid: false, reason: 'wrong city specialization' }
      }
      if ((city.buildings ?? []).includes(action.buildingType)) {
        return { valid: false, reason: 'building already constructed' }
      }
      if (city.construction != null) {
        return { valid: false, reason: 'construction already in progress' }
      }

      const builtForSpec = (city.buildings ?? []).filter(b =>
        getBuildingDef(b).specialization === buildingDef.specialization
      )
      if (builtForSpec.length >= 1 && city.level < 2) {
        return { valid: false, reason: 'city level too low' }
      }

      const player = getPlayerById(state, playerId)!
      if (player.resources.production < buildingDef.productionCost) {
        return { valid: false, reason: 'insufficient production' }
      }
      if (player.resources.gold < buildingDef.goldCost) {
        return { valid: false, reason: 'insufficient gold' }
      }

      return { valid: true }
    }

    case 'moveUnit': {
      const unit = findUnit(state, action.unitId)
      if (!unit) return { valid: false, reason: 'unit not found' }
      if (unit.ownerId !== playerId) return { valid: false, reason: 'unit is not yours' }
      if (unit.hasMoved) return { valid: false, reason: 'unit has already moved this turn' }

      const tile = state.map.tiles.find(t => hexKey(t.coord) === hexKey(action.targetCoord))
      if (!tile) return { valid: false, reason: 'target hex not on map' }
      if (tile.terrainType === TerrainType.Water) return { valid: false, reason: 'cannot move to water' }

      const dist = hexDistance(unit.position, action.targetCoord)
      if (dist === 0) return { valid: false, reason: 'unit is already there' }
      if (dist > unit.stats.movement) return { valid: false, reason: 'target out of movement range' }

      const occupied = state.units.some(u => hexKey(u.position) === hexKey(action.targetCoord))
      if (occupied) return { valid: false, reason: 'target hex is occupied' }

      // Cannot enter the territory of a neutral civ. A pact (friendly passage)
      // or a war (invasion) lifts the block — keeping conquest possible.
      const owner = territoryOwnerAt(state.cities, action.targetCoord)
      if (owner && owner !== playerId &&
          relationBetween(state, playerId, owner) === 'neutral') {
        return { valid: false, reason: 'enemy territory' }
      }

      return { valid: true }
    }

    case 'foundCity': {
      const unit = findUnit(state, action.unitId)
      if (!unit) return { valid: false, reason: 'unit not found' }
      if (unit.ownerId !== playerId) return { valid: false, reason: 'unit is not yours' }
      if (!unit.canFoundCity) return { valid: false, reason: 'unit cannot found a city' }

      const tile = state.map.tiles.find(t => hexKey(t.coord) === hexKey(unit.position))
      if (!tile || tile.terrainType === TerrainType.Water) {
        return { valid: false, reason: 'cannot found a city on water' }
      }

      const tooClose = state.cities.some(c => hexDistance(c.position, unit.position) <= 1)
      if (tooClose) return { valid: false, reason: 'too close to an existing city' }

      return { valid: true }
    }

    case 'attackCity': {
      const unit = findUnit(state, action.unitId)
      if (!unit) return { valid: false, reason: 'unit not found' }
      if (unit.ownerId !== playerId) return { valid: false, reason: 'unit is not yours' }
      if (unit.hasAttacked) return { valid: false, reason: 'unit has already attacked this turn' }
      const city = state.cities.find(c => c.id === action.cityId)
      if (!city) return { valid: false, reason: 'city not found' }
      if (city.ownerId === playerId) return { valid: false, reason: 'cannot attack your own city' }
      if (hexDistance(unit.position, city.position) !== 1) return { valid: false, reason: 'city is not adjacent' }
      if (relationBetween(state, playerId, city.ownerId) === 'pact') {
        return { valid: false, reason: 'non-aggression pact prevents this attack' }
      }
      return { valid: true }
    }

    case 'proposePact':
    case 'declareWar':
    case 'proposePeace':
    case 'breakPact': {
      if (action.targetId === playerId) return { valid: false, reason: 'cannot target yourself' }
      if (!state.players.some(p => p.id === action.targetId)) {
        return { valid: false, reason: 'target player not found' }
      }
      return { valid: true }
    }

    case 'proposeTrade': {
      if (action.targetId === playerId) return { valid: false, reason: 'cannot target yourself' }
      if (!state.players.some(p => p.id === action.targetId)) {
        return { valid: false, reason: 'target player not found' }
      }
      return { valid: true }
    }

    case 'respondToDiplomacy': {
      const proposal = state.diplomaticProposals.find(p => p.id === action.proposalId)
      if (!proposal) return { valid: false, reason: 'proposal not found' }
      if (proposal.targetId !== playerId) return { valid: false, reason: 'only the proposal target can respond' }
      return { valid: true }
    }

    case 'fortifyCity': {
      const city = state.cities.find(c => c.id === action.cityId)
      if (!city) return { valid: false, reason: 'city not found' }
      if (city.ownerId !== playerId) return { valid: false, reason: 'not your city' }
      if (action.goldAmount < 5) return { valid: false, reason: 'minimum 5 gold' }
      const player = getPlayerById(state, playerId)!
      if (player.resources.gold < action.goldAmount) return { valid: false, reason: 'insufficient gold' }
      const maxHp = cityMaxHp(city.level)
      if ((city.hp ?? maxHp) >= maxHp) return { valid: false, reason: 'city already at full hp' }
      return { valid: true }
    }
  }
}

// ─── Application ──────────────────────────────────────────────────────────────

/**
 * Applies an action to the state by dispatching to the existing engine
 * functions a human action would hit. Re-validates first, so it never throws
 * and never produces an illegal transition. Pure: returns a new state.
 */
export function applyAction(
  state: GameState,
  playerId: string,
  action: GameAction,
  now: number,
  hooks: TurnHooks = DEFAULT_HOOKS,
): ApplyActionResult {
  const validation = validateAction(state, playerId, action, now)
  if (!validation.valid) return { ok: false, reason: validation.reason, state }

  switch (action.type) {
    case 'endTurn':
      return endTurn(state, playerId, now, hooks)

    case 'respondToDispute': {
      const res = resolveDisputeByAction(state, action.disputeId, playerId, now)
      return res.ok
        ? { ok: true, state: res.state }
        : { ok: false, reason: res.reason, state: res.state }
    }

    case 'initiateCombat': {
      // validateAction guarantees both units exist and are a legal pairing.
      const attacker = findUnit(state, action.attackerUnitId)!
      const defender = findUnit(state, action.defenderUnitId)!
      // Attacking a neutral civ declares war automatically.
      const warState = ensureWarDeclared(state, playerId, defender.ownerId)

      // Against a dedicated AI opponent there is no separate human session to
      // wait for — resolve the attack immediately (matching the client preview)
      // instead of opening an async dispute. Human defenders keep the async
      // "chess by mail" dispute model so an absent player can still respond.
      const defenderPlayer = warState.players.find(p => p.id === defender.ownerId)
      if (defenderPlayer?.isAIControlled) {
        return { ok: true, state: resolveCombatImmediate(warState, attacker, defender) }
      }

      const dispute = createCombatDispute(attacker, defender, now)
      const units = warState.units.map(u =>
        u.id === attacker.id ? { ...u, hasAttacked: true } : u,
      )
      return {
        ok: true,
        state: {
          ...warState,
          units,
          combatDisputes: [...warState.combatDisputes, dispute],
        },
      }
    }

    case 'trainUnit': {
      const city = state.cities.find(c => c.id === action.cityId)!
      const player = state.players.find(p => p.id === playerId)!
      const allUnits = unitsForCiv(player.civilizationId, state.era)
      const unitDef = allUnits.find(u => u.type === action.unitType)!
      const newUnit = createUnitFromDef(action.unitId, unitDef, playerId, city.position)
      const rawCost = unitDef.productionCost
      const effectiveCost =
        player.civilizationId === 'ottomans' && unitDef.type === 'catapult'
          ? Math.floor(rawCost * 0.7)
          : rawCost
      const foodCost = Math.ceil(effectiveCost / 2)
      const goldCost = Math.ceil(effectiveCost / 3)
      const updatedPlayers = state.players.map(p =>
        p.id !== playerId ? p : {
          ...p,
          resources: {
            ...p.resources,
            production: p.resources.production - effectiveCost,
            food:       p.resources.food       - foodCost,
            gold:       p.resources.gold       - goldCost,
          },
        },
      )
      return {
        ok: true,
        state: { ...state, players: updatedPlayers, units: [...state.units, newUnit] },
      }
    }

    case 'constructBuilding': {
      const city = state.cities.find(c => c.id === action.cityId)!
      const buildingDef = getBuildingDef(action.buildingType)
      const updatedCity = startConstruction(city, action.buildingType)
      const updatedCities = state.cities.map(c => c.id === city.id ? updatedCity : c)
      const updatedPlayers = state.players.map(p =>
        p.id !== playerId ? p : {
          ...p,
          resources: {
            ...p.resources,
            production: p.resources.production - buildingDef.productionCost,
            gold:       p.resources.gold       - buildingDef.goldCost,
          },
        },
      )
      return {
        ok: true,
        state: { ...state, cities: updatedCities, players: updatedPlayers },
      }
    }

    case 'moveUnit': {
      const unit = findUnit(state, action.unitId)!
      const units = state.units.map(u =>
        u.id === unit.id ? { ...u, position: action.targetCoord, hasMoved: true } : u,
      )
      const movedState = { ...state, units }
      const ownerId    = unit.ownerId
      const fogEntry   = movedState.fogOfWar.find(f => f.playerId === ownerId)
      if (fogEntry) {
        const ownerUnits  = movedState.units.filter(u => u.ownerId === ownerId)
        const ownerCities = movedState.cities.filter(c => c.ownerId === ownerId)
        const updatedFog  = updateFogOfWar(fogEntry, ownerUnits, ownerCities, state.map.radius)
        return {
          ok: true,
          state: {
            ...movedState,
            fogOfWar: movedState.fogOfWar.map(f => f.playerId === ownerId ? updatedFog : f),
          },
        }
      }
      return { ok: true, state: movedState }
    }

    case 'foundCity': {
      const unit = findUnit(state, action.unitId)!
      const newCity: City = {
        id:             action.cityId,
        name:           action.cityName,
        position:       { ...unit.position },
        ownerId:        playerId,
        population:     1,
        specialization: action.specialization,
        level:          1,
        foodStored:     0,
        buildings:      [],
        construction:   null,
        hp:             cityMaxHp(1),
        maxHp:          cityMaxHp(1),
      }
      const units = state.units.filter(u => u.id !== action.unitId)
      return { ok: true, state: { ...state, units, cities: [...state.cities, newCity] } }
    }

    case 'attackCity': {
      const unit = findUnit(state, action.unitId)!
      const city = state.cities.find(c => c.id === action.cityId)!
      // Attacking a neutral civ's city declares war automatically.
      const warState = ensureWarDeclared(state, playerId, city.ownerId)
      const cityMaxHpVal = cityMaxHp(city.level)
      const cityHp    = city.hp ?? cityMaxHpVal
      const cityDef   = cityDefense(city.level)
      const dmg       = Math.max(1, unit.stats.attack + (unit.stats.cityAttackBonus ?? 0) - cityDef)
      const newHp     = Math.max(0, cityHp - dmg)
      const captured  = newHp <= 0
      const updatedCity = captured
        ? { ...city, ownerId: playerId, hp: cityMaxHpVal, maxHp: cityMaxHpVal }
        : { ...city, hp: newHp, maxHp: cityMaxHpVal }
      const capturer = warState.players.find(p => p.id === playerId)
      const playersAfterConquest = captured && capturer?.civilizationId === 'aztecs'
        ? warState.players.map(p =>
            p.id !== playerId ? p
            : { ...p, conquestBonusProduction: (p.conquestBonusProduction ?? 0) + 5 },
          )
        : warState.players
      const nextState: GameState = {
        ...warState,
        players: playersAfterConquest,
        cities: warState.cities.map(c => c.id === city.id ? updatedCity : c),
        units:  warState.units.map(u => u.id === unit.id ? { ...u, hasAttacked: true } : u),
      }
      // Capturing a city may leave its former owner with zero cities → eliminate
      // them immediately (marks isEliminated and removes their units). If that
      // leaves a single active player, the game ends right here (instant
      // domination victory) rather than waiting for the attacker to end their turn.
      if (!captured) return { ok: true, state: nextState }
      return { ok: true, state: finalizeIfDominated(eliminatePlayersWithNoCities(nextState)) }
    }

    case 'proposePact':
      return fromDiplomacy(proposeNonAggressionPact(state, playerId, action.targetId))

    case 'proposeTrade':
      return fromDiplomacy(
        proposeResourceTrade(state, playerId, action.targetId, { offer: action.offer, request: action.request }),
      )

    case 'declareWar':
      return fromDiplomacy(declareWar(state, playerId, action.targetId))

    case 'proposePeace':
      return fromDiplomacy(proposePeace(state, playerId, action.targetId))

    case 'breakPact':
      return fromDiplomacy(breakNonAggressionPact(state, playerId, action.targetId))

    case 'respondToDiplomacy':
      return fromDiplomacy(respondToProposal(state, playerId, action.proposalId, action.accept))

    case 'fortifyCity': {
      const city = state.cities.find(c => c.id === action.cityId)!
      const maxHp = cityMaxHp(city.level)
      const currentHp = city.hp ?? maxHp
      const hpGain = Math.floor(action.goldAmount / 5)
      const newHp = Math.min(maxHp, currentHp + hpGain)
      return {
        ok: true,
        state: {
          ...state,
          cities:  state.cities.map(c => c.id === city.id ? { ...c, hp: newHp } : c),
          players: state.players.map(p =>
            p.id !== playerId ? p : {
              ...p,
              resources: { ...p.resources, gold: p.resources.gold - action.goldAmount },
            }
          ),
        },
      }
    }
  }
}

/** Maps a DiplomacyResult onto an ApplyActionResult (same shape, different field name). */
function fromDiplomacy(res: DiplomacyResult): ApplyActionResult {
  return res.ok
    ? { ok: true, state: res.state }
    : { ok: false, reason: res.reason, state: res.state }
}
