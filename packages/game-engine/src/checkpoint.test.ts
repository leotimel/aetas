/**
 * CHECKPOINT DO MOTOR — PLAYBOOK_PROMPTS.md
 *
 * Simula uma partida completa entre "bots" chamando o game-engine diretamente
 * (sem rede, sem UI, sem Supabase). Cobre todos os cenários obrigatórios:
 *   1. Eliminação por 0 cidades (scoring.eliminatePlayersWithNoCities)
 *   2. Combate criado pela IA (decideOpponentTurn)
 *   3. Disputa resolvida por TIMEOUT (endTurn com now > expiresAt)
 *   4. Partida encerrada por pontuação (maxTurns atingido, determineWinner)
 *
 * Se esse teste passar, o motor está consistente para a Fase 2 (backend).
 */
import { describe, it, expect } from 'vitest'
import { applyAction } from './actions.js'
import { decideOpponentTurn } from './ai.js'
import { resolveTimedOutDispute, COMBAT_TIMEOUT_MS } from './combat.js'
import { eliminatePlayersWithNoCities, determineWinner } from './scoring.js'
import { CombatDisputeStatus, CitySpecialization, Era, TurnState } from './types.js'
import type { GameState, Player, City, Unit, GameMap } from './types.js'
import type { TurnHooks } from './turn.js'

// ─── Hooks ────────────────────────────────────────────────────────────────────
// Wire up the full hooks that the Edge Function will use in production.

const FULL_HOOKS: TurnHooks = { resolveTimedOutDispute, determineWinner }

// ─── Builders ─────────────────────────────────────────────────────────────────

function player(id: string): Player {
  return {
    id,
    displayName: id.toUpperCase(),
    civilizationId: 'rome',
    resources: { gold: 0, food: 0, production: 0 },
    isEliminated: false,
    isAIControlled: false,
  }
}

function city(id: string, ownerId: string, population: number, level: number): City {
  return {
    id,
    name: id,
    position: { q: 0, r: 0 }, // off to the side — units do the fighting
    ownerId,
    population,
    specialization: CitySpecialization.Commercial,
    level,
    foodStored: 0,
  }
}

function warrior(id: string, ownerId: string, q: number, r: number, overrides: Partial<{
  attack: number; defense: number; hp: number
}> = {}): Unit {
  return {
    id,
    unitType: 'warrior',
    position: { q, r },
    stats: { attack: 6, defense: 2, hp: 10, maxHp: 10, movement: 2, ...overrides },
    ownerId,
    hasMoved: false,
    hasAttacked: false,
  }
}

const EMPTY_MAP: GameMap = { tiles: [], radius: 10, seed: 'checkpoint', startPositions: [] }

// ─── Checkpoint ───────────────────────────────────────────────────────────────

describe('CHECKPOINT — full bot simulation', () => {
  it('runs a 2-round game covering all critical engine paths', () => {

    // ── Setup ─────────────────────────────────────────────────────────────────
    //
    // Players:
    //   p0 — strong city (pop=3, level=2) + strong warrior adjacent to p1
    //   p1 — weak city (pop=1, level=1) + fragile warrior
    //   p2 — NO city, no units → eliminated immediately
    //
    // Warriors:
    //   p0-warrior at {q:1,r:0}, attack=20
    //   p1-warrior at {q:2,r:0}, defense=2, hp=5  ← adjacent; attack=20 kills it
    //
    // maxTurns=2 so the game ends after round 2 by score.

    let state: GameState = {
      gameId: 'checkpoint-game',
      players: [player('p0'), player('p1'), player('p2')],
      map: EMPTY_MAP,
      units: [
        warrior('p0-warrior', 'p0', 1, 0, { attack: 20 }),
        warrior('p1-warrior', 'p1', 2, 0, { defense: 2, hp: 5 }),
      ],
      cities: [
        city('p0-city', 'p0', 3, 2), // score advantage
        city('p1-city', 'p1', 1, 1),
        // p2 intentionally has no city
      ],
      turnNumber: 1,
      currentPlayerId: 'p0',
      turnState: TurnState.WaitingForAction,
      era: Era.Ancient,
      maxTurns: 2,
      combatDisputes: [],
      nonAggressionPacts: [],
      diplomaticProposals: [],
      fogOfWar: [],
      winner: null,
      isFinished: false,
    }

    // ── Phase 1: Eliminate p2 (no cities) ─────────────────────────────────────
    state = eliminatePlayersWithNoCities(state)

    expect(state.players.find(p => p.id === 'p2')!.isEliminated).toBe(true)
    expect(state.players.filter(p => !p.isEliminated).map(p => p.id)).toEqual(['p0', 'p1'])

    // ── Round 1 — p0 (now=0) ──────────────────────────────────────────────────
    // decideOpponentTurn sees p1-warrior adjacent and attack=20 is favorable
    // even under active defense (+2): damage=20-(2+2)=16 ≥ hp=5 → kill confirmed.
    const p0r1actions = decideOpponentTurn(state, 'p0', 0)

    expect(p0r1actions.some(a => a.type === 'initiateCombat')).toBe(true) // AI chose to attack
    expect(p0r1actions[p0r1actions.length - 1]!.type).toBe('endTurn')      // ends with endTurn

    for (const action of p0r1actions) {
      const res = applyAction(state, 'p0', action, 0, FULL_HOOKS)
      expect(res.ok, `p0 action "${action.type}" rejected: ${res.ok ? '' : res.reason}`).toBe(true)
      if (res.ok) state = res.state
    }

    expect(state.combatDisputes).toHaveLength(1)
    expect(state.combatDisputes[0]!.status).toBe(CombatDisputeStatus.Pending)
    expect(state.combatDisputes[0]!.attackerPlayerId).toBe('p0')
    expect(state.combatDisputes[0]!.defenderPlayerId).toBe('p1')
    expect(state.currentPlayerId).toBe('p1')

    // ── Round 1 — p1 (now=0): end turn WITHOUT responding ─────────────────────
    // A human player who ignores the pending dispute (skips their active defense).
    const res1p1 = applyAction(state, 'p1', { type: 'endTurn' }, 0, FULL_HOOKS)
    expect(res1p1.ok).toBe(true)
    if (res1p1.ok) state = res1p1.state

    expect(state.combatDisputes[0]!.status).toBe(CombatDisputeStatus.Pending) // still pending
    expect(state.turnNumber).toBe(2)    // wrap happened, round advanced
    expect(state.currentPlayerId).toBe('p0')
    expect(state.isFinished).toBe(false)

    // ── Round 2 — p0 (now = past expiresAt): endTurn triggers timeout ─────────
    const past = COMBAT_TIMEOUT_MS + 1  // 24h + 1ms

    const res2p0 = applyAction(state, 'p0', { type: 'endTurn' }, past, FULL_HOOKS)
    expect(res2p0.ok).toBe(true)
    if (res2p0.ok) state = res2p0.state

    // Dispute resolved by timeout (attacker favored, no active-defense bonus)
    expect(state.combatDisputes[0]!.status).toBe(CombatDisputeStatus.ResolvedByTimeout)
    // p1's warrior destroyed: attack=20 vs defense=2, hp=5 → damage=18 kills it
    expect(state.units.find(u => u.id === 'p1-warrior')).toBeUndefined()
    // p0's warrior survived
    expect(state.units.find(u => u.id === 'p0-warrior')).toBeDefined()
    expect(state.isFinished).toBe(false) // game still running

    // ── Round 2 — p1 (wrap + turnNumber=maxTurns → score determines winner) ───
    const res2p1 = applyAction(state, 'p1', { type: 'endTurn' }, past, FULL_HOOKS)
    expect(res2p1.ok).toBe(true)
    if (res2p1.ok) state = res2p1.state

    expect(state.isFinished).toBe(true)
    expect(state.winner).toBe('p0') // p0: stronger city → higher combined score
    // p0 score: territory=10, pop=3×3=9+, dev=2×5=10+ vs p1: 10+3+5=18 — p0 wins
  })
})
