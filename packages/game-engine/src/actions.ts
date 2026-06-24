import { CombatDisputeStatus, BuildingType, TerrainType, CitySpecialization } from './types.js'
import type { GameState, Unit, HexCoord, City, Resources } from './types.js'
import { canSubmitAction, endTurn, getPlayerById, type TurnHooks } from './turn.js'
import {
  createCombatDispute,
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
import { hexDistance, hexKey } from './map.js'
import { createUnitFromDef } from './units.js'
import { unitsForCiv } from './civilizations.js'
import { getBuildingDef, startConstruction } from './buildings.js'

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

      if (player.resources.production < unitDef.productionCost) {
        return { valid: false, reason: 'insufficient production' }
      }

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

      const player = getPlayerById(state, playerId)!
      if (player.resources.production < buildingDef.productionCost) {
        return { valid: false, reason: 'insufficient production' }
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
      const dispute = createCombatDispute(attacker, defender, now)
      const units = state.units.map(u =>
        u.id === attacker.id ? { ...u, hasAttacked: true } : u,
      )
      return {
        ok: true,
        state: {
          ...state,
          units,
          combatDisputes: [...state.combatDisputes, dispute],
        },
      }
    }

    case 'trainUnit': {
      const city = state.cities.find(c => c.id === action.cityId)!
      const player = state.players.find(p => p.id === playerId)!
      const allUnits = unitsForCiv(player.civilizationId, state.era)
      const unitDef = allUnits.find(u => u.type === action.unitType)!
      const newUnit = createUnitFromDef(action.unitId, unitDef, playerId, city.position)
      const updatedPlayers = state.players.map(p =>
        p.id !== playerId ? p : {
          ...p,
          resources: {
            ...p.resources,
            production: p.resources.production - unitDef.productionCost,
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
      return { ok: true, state: { ...state, units } }
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
        hp:             10,
        maxHp:          10,
      }
      const units = state.units.filter(u => u.id !== action.unitId)
      return { ok: true, state: { ...state, units, cities: [...state.cities, newCity] } }
    }

    case 'attackCity': {
      const unit = findUnit(state, action.unitId)!
      const city = state.cities.find(c => c.id === action.cityId)!
      const cityMaxHp = city.maxHp ?? 10
      const cityHp    = city.hp ?? cityMaxHp
      const cityDef   = 2 + city.level
      const dmg       = Math.max(1, unit.stats.attack + (unit.stats.cityAttackBonus ?? 0) - cityDef)
      const newHp     = Math.max(0, cityHp - dmg)
      const captured  = newHp <= 0
      const updatedCity = captured
        ? { ...city, ownerId: playerId, hp: cityMaxHp, maxHp: cityMaxHp }
        : { ...city, hp: newHp, maxHp: cityMaxHp }
      return {
        ok: true,
        state: {
          ...state,
          cities: state.cities.map(c => c.id === city.id ? updatedCity : c),
          units:  state.units.map(u => u.id === unit.id ? { ...u, hasAttacked: true } : u),
        },
      }
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
  }
}

/** Maps a DiplomacyResult onto an ApplyActionResult (same shape, different field name). */
function fromDiplomacy(res: DiplomacyResult): ApplyActionResult {
  return res.ok
    ? { ok: true, state: res.state }
    : { ok: false, reason: res.reason, state: res.state }
}
