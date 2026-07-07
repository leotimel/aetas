import { describe, it, expect } from 'vitest'
import {
  resolveCombat,
  createCombatDispute,
  resolveDisputeByAction,
  resolveTimedOutDispute,
  terrainDefenseBonus,
  COMBAT_TIMEOUT_MS,
  MIN_DAMAGE,
  ACTIVE_DEFENSE_BONUS,
  FORTIFY_DEFENSE_BONUS,
} from './combat.js'
import { endTurn } from './turn.js'
import {
  TerrainType,
  CombatDisputeStatus,
  TurnState,
  Era,
} from './types.js'
import type {
  Unit,
  UnitStats,
  GameState,
  GameMap,
  HexCoord,
  Player,
  CombatDispute,
  HexTile,
} from './types.js'

// ─── Builders ─────────────────────────────────────────────────────────────────

function makeUnit(
  id: string,
  ownerId: string,
  stats: Partial<UnitStats> = {},
  position: HexCoord = { q: 0, r: 0 },
): Unit {
  return {
    id,
    unitType: 'warrior',
    position,
    stats: { attack: 6, defense: 2, hp: 10, maxHp: 10, movement: 2, ...stats },
    ownerId,
    hasMoved: false,
    hasAttacked: false,
  }
}

function makePlayer(id: string): Player {
  return {
    id,
    displayName: id,
    civilizationId: 'rome',
    resources: { gold: 0, food: 0, production: 0 },
    isEliminated: false,
    isAIControlled: false,
  }
}

function makeMap(tiles: HexTile[] = []): GameMap {
  return { tiles, radius: 5, seed: 's', startPositions: [] }
}

function makeState(opts: {
  units?: Unit[]
  disputes?: CombatDispute[]
  tiles?: HexTile[]
  players?: Player[]
} = {}): GameState {
  return {
    gameId: 'g1',
    players: opts.players ?? [makePlayer('p0'), makePlayer('p1')],
    map: makeMap(opts.tiles),
    units: opts.units ?? [],
    cities: [],
    turnNumber: 1,
    currentPlayerId: 'p0',
    turnState: TurnState.WaitingForAction,
    era: Era.Ancient,
    maxTurns: 10,
    combatDisputes: opts.disputes ?? [],
    nonAggressionPacts: [],
    diplomaticProposals: [],
    fogOfWar: [],
    winner: null,
    isFinished: false,
  }
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) deepFreeze(v)
    Object.freeze(obj)
  }
  return obj
}

// ─── Suite 1: resolveCombat (pure) ────────────────────────────────────────────

describe('resolveCombat', () => {
  const plains = { defenderTerrain: TerrainType.Plains }

  it('1: defender survives and counterattacks (both lose hp, winner null)', () => {
    const atk = makeUnit('a', 'p0', { attack: 5, defense: 3, hp: 10 })
    const def = makeUnit('d', 'p1', { attack: 4, defense: 2, hp: 10 })
    const r = resolveCombat(atk, def, plains)
    expect(r.damageToDefender).toBe(3) // 5 - 2
    expect(r.damageToAttacker).toBe(1) // 4 - 3
    expect(r.defenderUnit.stats.hp).toBe(7)
    expect(r.attackerUnit.stats.hp).toBe(9)
    expect(r.attackerDestroyed).toBe(false)
    expect(r.defenderDestroyed).toBe(false)
    expect(r.winnerUnitId).toBeNull()
  })

  it('2: defender destroyed → no counterattack, attacker wins', () => {
    const atk = makeUnit('a', 'p0', { attack: 20, hp: 10 })
    const def = makeUnit('d', 'p1', { defense: 0, hp: 5 })
    const r = resolveCombat(atk, def, plains)
    expect(r.defenderDestroyed).toBe(true)
    expect(r.damageToAttacker).toBe(0)
    expect(r.attackerUnit.stats.hp).toBe(10) // untouched
    expect(r.winnerUnitId).toBe('a')
  })

  it('3: attacker destroyed by the counterattack → defender wins', () => {
    const atk = makeUnit('a', 'p0', { attack: 5, defense: 0, hp: 3 })
    const def = makeUnit('d', 'p1', { attack: 20, defense: 2, hp: 10 })
    const r = resolveCombat(atk, def, plains)
    expect(r.defenderDestroyed).toBe(false)
    expect(r.attackerDestroyed).toBe(true)
    expect(r.winnerUnitId).toBe('d')
  })

  it('4: both survive → winner null', () => {
    const atk = makeUnit('a', 'p0', { attack: 4, defense: 5, hp: 10 })
    const def = makeUnit('d', 'p1', { attack: 4, defense: 2, hp: 10 })
    const r = resolveCombat(atk, def, plains)
    expect(r.attackerDestroyed).toBe(false)
    expect(r.defenderDestroyed).toBe(false)
    expect(r.winnerUnitId).toBeNull()
  })

  it('5: MIN_DAMAGE floor — overwhelming defense still takes 1 (strike and counter)', () => {
    const atk = makeUnit('a', 'p0', { attack: 1, defense: 1, hp: 10 })
    const def = makeUnit('d', 'p1', { attack: 1, defense: 50, hp: 10 })
    const r = resolveCombat(atk, def, plains)
    expect(r.damageToDefender).toBe(MIN_DAMAGE)
    expect(r.damageToAttacker).toBe(MIN_DAMAGE)
  })

  it('6: terrain saves the defender (lethal on Plains, survives on Mountain)', () => {
    const atk = makeUnit('a', 'p0', { attack: 8, hp: 10 })
    const def = makeUnit('d', 'p1', { defense: 2, hp: 4 })
    const onPlains = resolveCombat(atk, def, { defenderTerrain: TerrainType.Plains })
    expect(onPlains.defenderDestroyed).toBe(true) // 8-2=6 ≥ 4

    const onMountain = resolveCombat(atk, def, { defenderTerrain: TerrainType.Mountain })
    expect(onMountain.defenderDestroyed).toBe(false) // 8-(2+4)=2 < 4
    expect(onMountain.defenderUnit.stats.hp).toBe(2)
  })

  it('7: active-defense bonus applies only when defenderActiveDefense is true', () => {
    const atk = makeUnit('a', 'p0', { attack: 8, hp: 10 })
    const def = makeUnit('d', 'p1', { defense: 2, hp: 10 })
    const passive = resolveCombat(atk, def, { defenderTerrain: TerrainType.Plains })
    const active = resolveCombat(atk, def, {
      defenderTerrain: TerrainType.Plains,
      defenderActiveDefense: true,
    })
    expect(passive.damageToDefender - active.damageToDefender).toBe(ACTIVE_DEFENSE_BONUS)
  })

  it('8: pure — frozen inputs are not mutated; outputs are new objects', () => {
    const atk = deepFreeze(makeUnit('a', 'p0', { attack: 5, hp: 10 }))
    const def = deepFreeze(makeUnit('d', 'p1', { defense: 2, hp: 10 }))
    expect(() => resolveCombat(atk, def, plains)).not.toThrow()
    expect(atk.stats.hp).toBe(10)
    expect(def.stats.hp).toBe(10)
  })

  it('9: an already-dead defender short-circuits without reviving', () => {
    const atk = makeUnit('a', 'p0', { attack: 5, hp: 10 })
    const def = makeUnit('d', 'p1', { hp: 0 })
    const r = resolveCombat(atk, def, plains)
    expect(r.defenderDestroyed).toBe(true)
    expect(r.damageToDefender).toBe(0)
    expect(r.defenderUnit.stats.hp).toBe(0)
  })

  it('10: INVARIANT — a single call can never destroy both units', () => {
    // Even a glass-cannon mutual matchup: defender dies first → cannot counter.
    const atk = makeUnit('a', 'p0', { attack: 100, defense: 0, hp: 1 })
    const def = makeUnit('d', 'p1', { attack: 100, defense: 0, hp: 1 })
    const r = resolveCombat(atk, def, plains)
    expect(r.defenderDestroyed).toBe(true)
    expect(r.attackerDestroyed).toBe(false)
  })
})

describe('terrainDefenseBonus', () => {
  it('maps each terrain to its bonus', () => {
    expect(terrainDefenseBonus(TerrainType.Plains)).toBe(0)
    expect(terrainDefenseBonus(TerrainType.Forest)).toBe(2)
    expect(terrainDefenseBonus(TerrainType.Hills)).toBe(3)
    expect(terrainDefenseBonus(TerrainType.Mountain)).toBe(4)
    expect(terrainDefenseBonus(TerrainType.Water)).toBe(0)
  })
})

// ─── Suite 2: createCombatDispute ─────────────────────────────────────────────

describe('createCombatDispute', () => {
  it('11: rejects units of the same owner', () => {
    const a = makeUnit('a', 'p0')
    const b = makeUnit('b', 'p0')
    expect(() => createCombatDispute(a, b, 1000)).toThrow()
  })

  it('12: rejects a unit attacking itself', () => {
    const a = makeUnit('a', 'p0')
    expect(() => createCombatDispute(a, a, 1000)).toThrow()
  })

  it('13: builds a Pending dispute with a 24h deadline and deterministic id', () => {
    const a = makeUnit('a', 'p0')
    const d = makeUnit('d', 'p1')
    const dispute = createCombatDispute(a, d, 1000)
    expect(dispute.status).toBe(CombatDisputeStatus.Pending)
    expect(dispute.createdAt).toBe(1000)
    expect(dispute.expiresAt).toBe(1000 + COMBAT_TIMEOUT_MS)
    expect(dispute.attackerPlayerId).toBe('p0')
    expect(dispute.defenderPlayerId).toBe('p1')
    expect(createCombatDispute(a, d, 1000).id).toBe(dispute.id) // deterministic
  })
})

// ─── Suite 3: resolveDisputeByAction ──────────────────────────────────────────

function disputeState(extra: { now?: number; hp?: number } = {}) {
  const attacker = makeUnit('a', 'p0', { attack: 8, hp: 10 }, { q: 0, r: 0 })
  const defender = makeUnit('d', 'p1', { defense: 2, hp: extra.hp ?? 10 }, { q: 1, r: 0 })
  const dispute = createCombatDispute(attacker, defender, extra.now ?? 1000)
  const state = makeState({ units: [attacker, defender], disputes: [dispute] })
  return { state, dispute, attacker, defender }
}

describe('resolveDisputeByAction', () => {
  it('14: defender responds → active-defense bonus, status ResolvedByAction', () => {
    const { state, dispute } = disputeState()
    const res = resolveDisputeByAction(state, dispute.id, 'p1', 2000)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.state.combatDisputes[0]!.status).toBe(CombatDisputeStatus.ResolvedByAction)
    // defender (active defense): 8 - (2+0+2) = 4 damage → hp 6
    const def = res.state.units.find(u => u.id === 'd')!
    expect(def.stats.hp).toBe(6)
  })

  it('15: race guard — a second resolution is rejected, damage not re-applied', () => {
    const { state, dispute } = disputeState()
    const first = resolveDisputeByAction(state, dispute.id, 'p1', 2000)
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error(first.reason)
    const second = resolveDisputeByAction(first.state, dispute.id, 'p1', 2001)
    expect(second.ok).toBe(false)
    if (second.ok) throw new Error('expected rejection')
    expect(second.reason).toBe('dispute already resolved')
    expect(second.state).toBe(first.state) // unchanged
  })

  it('16: a player not involved in the dispute is rejected', () => {
    const { state, dispute } = disputeState()
    const players = [makePlayer('p0'), makePlayer('p1'), makePlayer('p2')]
    const res = resolveDisputeByAction({ ...state, players }, dispute.id, 'p2', 2000)
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected rejection')
    expect(res.reason).toBe('player not involved in this dispute')
  })

  it('17: AI acting AS the defender grants the active-defense bonus', () => {
    const { state, dispute } = disputeState()
    const asDefender = resolveDisputeByAction(state, dispute.id, 'p1', 2000)
    if (!asDefender.ok) throw new Error(asDefender.reason)
    const def = asDefender.state.units.find(u => u.id === 'd')!
    expect(def.stats.hp).toBe(6) // 8 - (2+2) = 4 dmg
  })

  it('18: attacker forcing resolution → defender gets NO active-defense bonus', () => {
    const { state, dispute } = disputeState()
    const byAttacker = resolveDisputeByAction(state, dispute.id, 'p0', 2000)
    if (!byAttacker.ok) throw new Error(byAttacker.reason)
    const def = byAttacker.state.units.find(u => u.id === 'd')!
    expect(def.stats.hp).toBe(4) // 8 - 2 = 6 dmg (no active bonus)
  })

  it('19: a missing unit yields a graceful no-op with status flipped', () => {
    const { state, dispute } = disputeState()
    const withoutDefender = { ...state, units: state.units.filter(u => u.id !== 'd') }
    const res = resolveDisputeByAction(withoutDefender, dispute.id, 'p1', 2000)
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    expect(res.result).toBeNull()
    expect(res.state.combatDisputes[0]!.status).toBe(CombatDisputeStatus.ResolvedByAction)
  })
})

// ─── Suite 4: resolveTimedOutDispute (turn.ts hook) ───────────────────────────

describe('resolveTimedOutDispute', () => {
  it('20: timeout resolution gives NO active defense → more damage than an action', () => {
    const { state, dispute } = disputeState()
    const timedOut = resolveTimedOutDispute(dispute, state)
    const defTimeout = timedOut.units.find(u => u.id === 'd')!
    expect(defTimeout.stats.hp).toBe(4) // 8 - 2 = 6 dmg, no active bonus

    const action = resolveDisputeByAction(state, dispute.id, 'p1', 2000)
    if (!action.ok) throw new Error(action.reason)
    const defAction = action.state.units.find(u => u.id === 'd')!
    expect(defAction.stats.hp).toBeGreaterThan(defTimeout.stats.hp) // 6 > 4
  })

  it('21: does NOT touch dispute.status (caller owns it)', () => {
    const { state, dispute } = disputeState()
    const alreadyFlipped: CombatDispute = { ...dispute, status: CombatDisputeStatus.ResolvedByTimeout }
    const result = resolveTimedOutDispute(alreadyFlipped, state)
    // the function leaves combatDisputes alone; only state.units change
    expect(result.combatDisputes).toBe(state.combatDisputes)
  })

  it('22: idempotency (lethal case) — both units gone → state unchanged', () => {
    const { state, dispute } = disputeState()
    const noUnits = { ...state, units: [] }
    expect(resolveTimedOutDispute(dispute, noUnits)).toBe(noUnits)
  })

  it('23: idempotency hole (documented) — both survive, a second call re-applies damage', () => {
    // High-hp defender survives two strikes so we can observe the re-damage.
    const { state, dispute } = disputeState({ hp: 20 })
    const once = resolveTimedOutDispute(dispute, state)
    const twice = resolveTimedOutDispute(dispute, once)
    const hpOnce = once.units.find(u => u.id === 'd')!.stats.hp
    const hpTwice = twice.units.find(u => u.id === 'd')!.stats.hp
    expect(hpTwice).toBeLessThan(hpOnce) // re-damaged — Edge CAS prevents this in prod
  })

  it('24: integration through real endTurn — combat applies, no false elimination', () => {
    const attacker = makeUnit('a', 'p0', { attack: 8, hp: 10 }, { q: 0, r: 0 })
    const defender = makeUnit('d', 'p1', { defense: 2, hp: 10 }, { q: 1, r: 0 })
    const dispute = createCombatDispute(attacker, defender, 0) // expires at COMBAT_TIMEOUT_MS
    const state = makeState({ units: [attacker, defender], disputes: [dispute] })

    const now = COMBAT_TIMEOUT_MS + 1 // past the deadline
    const res = endTurn(state, 'p0', now, { resolveTimedOutDispute })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error(res.reason)
    // dispute resolved by timeout, defender damaged
    expect(res.state.combatDisputes[0]!.status).toBe(CombatDisputeStatus.ResolvedByTimeout)
    expect(res.state.units.find(u => u.id === 'd')!.stats.hp).toBe(4)
    // losing units does NOT eliminate (elimination is city-based, scoring.ts)
    expect(res.state.players.every(p => !p.isEliminated)).toBe(true)
    expect(res.state.isFinished).toBe(false)
  })

  it('25: two disputes on the same unit in one turn resolve deterministically', () => {
    const atkA = makeUnit('a1', 'p0', { attack: 7, hp: 10 }, { q: 0, r: 0 })
    const atkB = makeUnit('a2', 'p0', { attack: 7, hp: 10 }, { q: 2, r: 0 })
    const target = makeUnit('t', 'p1', { defense: 1, hp: 10 }, { q: 1, r: 0 })
    const d1 = createCombatDispute(atkA, target, 0)
    const d2 = createCombatDispute(atkB, target, 0)
    const state = makeState({ units: [atkA, atkB, target], disputes: [d1, d2] })

    const res = endTurn(state, 'p0', COMBAT_TIMEOUT_MS + 1, { resolveTimedOutDispute })
    if (!res.ok) throw new Error(res.reason)
    // First dispute (by id order) deals 6, target at 4; second deals 6 → destroyed.
    expect(res.state.units.find(u => u.id === 't')).toBeUndefined()
    // Deterministic: same inputs give the same outcome.
    const res2 = endTurn(state, 'p0', COMBAT_TIMEOUT_MS + 1, { resolveTimedOutDispute })
    if (!res2.ok) throw new Error(res2.reason)
    expect(res2.state.units.map(u => u.id).sort()).toEqual(res.state.units.map(u => u.id).sort())
  })

  it('26: pure — a deep-frozen state is not mutated; new arrays returned', () => {
    const { state, dispute } = disputeState()
    deepFreeze(state)
    expect(() => resolveTimedOutDispute(dispute, state)).not.toThrow()
    expect(state.units.find(u => u.id === 'd')!.stats.hp).toBe(10) // unchanged
  })
})

// ─── fortification bonus ────────────────────────────────────────────────────────

describe('resolveCombat — fortification', () => {
  const plains = { defenderTerrain: TerrainType.Plains }

  it('a fortified defender takes FORTIFY_DEFENSE_BONUS less damage', () => {
    const atk = makeUnit('a', 'p0', { attack: 8 })
    const def = makeUnit('d', 'p1', { defense: 2, hp: 10 })
    const plain = resolveCombat(atk, def, plains)
    const fort  = resolveCombat(atk, { ...def, isFortified: true }, plains)
    expect(plain.damageToDefender - fort.damageToDefender).toBe(FORTIFY_DEFENSE_BONUS)
  })

  it('fortification can save a unit from an otherwise lethal hit', () => {
    const atk = makeUnit('a', 'p0', { attack: 8 })
    const def = makeUnit('d', 'p1', { defense: 2, hp: 6 })
    expect(resolveCombat(atk, def, plains).defenderDestroyed).toBe(true)
    expect(resolveCombat(atk, { ...def, isFortified: true }, plains).defenderDestroyed).toBe(false)
  })
})
