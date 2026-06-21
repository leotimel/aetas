import { TerrainType, CombatDisputeStatus } from './types.js'
import type { Unit, CombatDispute, GameState, HexCoord } from './types.js'
import { hexKey } from './map.js'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Aligns with the COMBAT_TIMEOUT_MS comment on CombatDispute in types.ts. */
export const COMBAT_TIMEOUT_MS = 24 * 60 * 60 * 1000

/** Every strike deals at least this much, so combat never stalls at 0 damage. */
export const MIN_DAMAGE = 1

/** Extra defense granted only to a defender who RESPONDS (vs. an absent one). */
export const ACTIVE_DEFENSE_BONUS = 2

const TERRAIN_DEFENSE_BONUS: Record<TerrainType, number> = {
  [TerrainType.Plains]: 0,
  [TerrainType.Forest]: 2,
  [TerrainType.Hills]: 3,
  [TerrainType.Mountain]: 4,
  [TerrainType.Water]: 0,
}

export function terrainDefenseBonus(terrain: TerrainType): number {
  return TERRAIN_DEFENSE_BONUS[terrain]
}

// ─── Tactical resolution ──────────────────────────────────────────────────────

export interface CombatResult {
  attackerUnit: Unit
  defenderUnit: Unit
  attackerDestroyed: boolean
  defenderDestroyed: boolean
  damageToAttacker: number
  damageToDefender: number
  /** Surviving unit's id if the other was destroyed; null otherwise. */
  winnerUnitId: string | null
}

export interface ResolveCombatOpts {
  defenderTerrain: TerrainType
  attackerTerrain?: TerrainType
  /** True only when the defender actively responded (human or substitute AI). */
  defenderActiveDefense?: boolean
}

function withHp(unit: Unit, hp: number): Unit {
  return { ...unit, stats: { ...unit.stats, hp } }
}

/**
 * Deterministic tactical combat. Integer-only (no RNG, no rounding) so it is
 * exactly reproducible across runtimes/clients. The attacker strikes FIRST;
 * a destroyed defender never counterattacks ("ordem de ataque importa").
 *
 * INVARIANT: a single call can never destroy BOTH units — the defender only
 * counterattacks if it survived the attacker's strike.
 *
 * Pure: returns new Unit objects, never mutates the inputs.
 */
export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  opts: ResolveCombatOpts,
): CombatResult {
  const attackerTerrain = opts.attackerTerrain ?? TerrainType.Plains
  const activeDefense = opts.defenderActiveDefense ?? false

  // Guard: an already-dead defender is treated as destroyed; no revive.
  if (defender.stats.hp <= 0) {
    return {
      attackerUnit: attacker,
      defenderUnit: defender,
      attackerDestroyed: attacker.stats.hp <= 0,
      defenderDestroyed: true,
      damageToAttacker: 0,
      damageToDefender: 0,
      winnerUnitId: attacker.stats.hp > 0 ? attacker.id : null,
    }
  }

  const defenderDefense =
    defender.stats.defense +
    terrainDefenseBonus(opts.defenderTerrain) +
    (activeDefense ? ACTIVE_DEFENSE_BONUS : 0)
  const damageToDefender = Math.max(MIN_DAMAGE, attacker.stats.attack - defenderDefense)
  const defenderHp = defender.stats.hp - damageToDefender

  // Defender destroyed → no counterattack.
  if (defenderHp <= 0) {
    return {
      attackerUnit: attacker,
      defenderUnit: withHp(defender, defenderHp),
      attackerDestroyed: false,
      defenderDestroyed: true,
      damageToAttacker: 0,
      damageToDefender,
      winnerUnitId: attacker.id,
    }
  }

  // Defender survives → counterattacks.
  const attackerDefense = attacker.stats.defense + terrainDefenseBonus(attackerTerrain)
  const damageToAttacker = Math.max(MIN_DAMAGE, defender.stats.attack - attackerDefense)
  const attackerHp = attacker.stats.hp - damageToAttacker
  const attackerDestroyed = attackerHp <= 0

  return {
    attackerUnit: withHp(attacker, attackerHp),
    defenderUnit: withHp(defender, defenderHp),
    attackerDestroyed,
    defenderDestroyed: false,
    damageToAttacker,
    damageToDefender,
    winnerUnitId: attackerDestroyed ? defender.id : null,
  }
}

// ─── Dispute creation ─────────────────────────────────────────────────────────

/**
 * Opens an async combat dispute between two units of DIFFERENT players.
 * Pure: `now` is injected (never Date.now). Deterministic id.
 */
export function createCombatDispute(attacker: Unit, defender: Unit, now: number): CombatDispute {
  if (attacker.id === defender.id) {
    throw new Error('a unit cannot attack itself')
  }
  if (attacker.ownerId === defender.ownerId) {
    throw new Error('cannot open a dispute between units of the same player')
  }
  return {
    id: `dispute-${attacker.id}-${defender.id}-${now}`,
    attackerUnitId: attacker.id,
    defenderUnitId: defender.id,
    attackerPlayerId: attacker.ownerId,
    defenderPlayerId: defender.ownerId,
    createdAt: now,
    expiresAt: now + COMBAT_TIMEOUT_MS,
    status: CombatDisputeStatus.Pending,
  }
}

// ─── State application helpers ────────────────────────────────────────────────

/**
 * Terrain at a position, mirroring how combat resolution derives it.
 * Missing tile → Plains. Exported so ai.ts predicts with identical logic
 * instead of duplicating the lookup.
 */
export function terrainAt(state: GameState, pos: HexCoord): TerrainType {
  const key = hexKey(pos)
  const tile = state.map.tiles.find(t => hexKey(t.coord) === key)
  return tile?.terrainType ?? TerrainType.Plains
}

/**
 * Applies a CombatResult to the game state: surviving units get their new hp,
 * destroyed units are removed from state.units. Returns a NEW state spread from
 * the passed `state` (never an outer reference) so prior same-turn resolutions
 * are preserved.
 *
 * Does NOT touch player.isEliminated — elimination ("player with no cities") is
 * scoring.ts's responsibility (1.8). v1 combat is unit-vs-unit and never destroys
 * cities, so no elimination can originate here. When city capture is added later,
 * the capture path must recompute elimination via scoring.
 */
function applyCombatResult(state: GameState, result: CombatResult): GameState {
  const replacements = new Map<string, Unit>()
  if (!result.attackerDestroyed) replacements.set(result.attackerUnit.id, result.attackerUnit)
  if (!result.defenderDestroyed) replacements.set(result.defenderUnit.id, result.defenderUnit)

  const destroyed = new Set<string>()
  if (result.attackerDestroyed) destroyed.add(result.attackerUnit.id)
  if (result.defenderDestroyed) destroyed.add(result.defenderUnit.id)

  const units = state.units
    .filter(u => !destroyed.has(u.id))
    .map(u => replacements.get(u.id) ?? u)

  return { ...state, units }
}

function findUnit(state: GameState, id: string): Unit | undefined {
  return state.units.find(u => u.id === id)
}

// ─── Resolution: by action ────────────────────────────────────────────────────

export type DisputeActionResult =
  | { ok: true; state: GameState; result: CombatResult | null }
  | { ok: false; reason: string; state: GameState }

function setDisputeStatus(
  state: GameState,
  disputeId: string,
  status: CombatDisputeStatus,
): GameState {
  return {
    ...state,
    combatDisputes: state.combatDisputes.map(d =>
      d.id === disputeId ? { ...d, status } : d,
    ),
  }
}

/**
 * Resolves a pending dispute because a player acted on it before timeout.
 *
 * Concurrency: the `status !== Pending` guard rejects a duplicate near-
 * simultaneous resolution. The REAL idempotency boundary is the Edge Function's
 * compare-and-swap on (disputeId, status) — mirror the (turnNumber, currentPlayerId)
 * CAS already documented in turn.ts.
 *
 * The defender gets ACTIVE_DEFENSE_BONUS only when the DEFENDER is the one acting
 * (their presence — including the substitute AI "showing up" in 1.6). The attacker
 * forcing resolution grants the absent defender no active-defense bonus.
 */
export function resolveDisputeByAction(
  state: GameState,
  disputeId: string,
  actingPlayerId: string,
  _now: number,
): DisputeActionResult {
  const dispute = state.combatDisputes.find(d => d.id === disputeId)
  if (!dispute) return { ok: false, reason: 'dispute not found', state }
  if (dispute.status !== CombatDisputeStatus.Pending) {
    return { ok: false, reason: 'dispute already resolved', state }
  }
  if (
    actingPlayerId !== dispute.attackerPlayerId &&
    actingPlayerId !== dispute.defenderPlayerId
  ) {
    return { ok: false, reason: 'player not involved in this dispute', state }
  }

  const attacker = findUnit(state, dispute.attackerUnitId)
  const defender = findUnit(state, dispute.defenderUnitId)
  // Graceful no-op if a unit is already gone (e.g. destroyed by an earlier dispute).
  if (!attacker || !defender) {
    return {
      ok: true,
      state: setDisputeStatus(state, disputeId, CombatDisputeStatus.ResolvedByAction),
      result: null,
    }
  }

  const result = resolveCombat(attacker, defender, {
    defenderTerrain: terrainAt(state, defender.position),
    attackerTerrain: terrainAt(state, attacker.position),
    defenderActiveDefense: actingPlayerId === dispute.defenderPlayerId,
  })

  const applied = applyCombatResult(state, result)
  return {
    ok: true,
    state: setDisputeStatus(applied, disputeId, CombatDisputeStatus.ResolvedByAction),
    result,
  }
}

// ─── Resolution: by timeout (turn.ts hook) ────────────────────────────────────

/**
 * Auto-resolves a dispute that timed out. Signature matches
 * TurnHooks.resolveTimedOutDispute exactly. turn.ts has ALREADY flipped the
 * dispute's status to ResolvedByTimeout before calling this, so this function
 * MUST NOT touch dispute.status.
 *
 * Timeout rule (user decision): the absent defender gets NO active-defense bonus
 * (only terrain). The attacker is favored by default, but good terrain can still
 * save a well-positioned defender.
 *
 * Idempotency: if either unit is already gone (lethal case already applied),
 * returns the state unchanged. The both-survive duplicate case is NOT idempotent
 * here by design — the Edge Function's transaction/CAS is the real boundary.
 */
export function resolveTimedOutDispute(dispute: CombatDispute, state: GameState): GameState {
  const attacker = findUnit(state, dispute.attackerUnitId)
  const defender = findUnit(state, dispute.defenderUnitId)
  if (!attacker || !defender) return state

  const result = resolveCombat(attacker, defender, {
    defenderTerrain: terrainAt(state, defender.position),
    attackerTerrain: terrainAt(state, attacker.position),
    defenderActiveDefense: false,
  })

  return applyCombatResult(state, result)
}
