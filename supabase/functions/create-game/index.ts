// POST /create-game — creates a new game with full configuration.
//
// Body:
//   seed?        — map seed string; if omitted, a UUID is generated.
//   mapSize?     — 'small' | 'medium' | 'large'; defaults to 'medium'.
//   gameMode?    — 'solo' | 'mixed' | 'multiplayer'; defaults to 'solo'.
//   playerCount? — total players 2–8; defaults to 2.
//   humanSlots?  — how many slots are human (including creator); defaults to 1 for solo,
//                  playerCount for multiplayer. For mixed: 1 < humanSlots < playerCount.
//   maxTurns?    — 10 | 20 | 40; defaults to 10.
//   aiDifficulty?— 'easy' | 'normal' | 'hard'; defaults to 'normal'.
//   myCiv?       — civilization ID for the creator; falls back to profiles.selected_civ.
//
// The creator's engine ID = their Supabase UUID so the submit-action gate works.
// Open human slots use a random seat UUID stored in game_players.engine_player_id.
// AI slots use a short deterministic ID.
// Uses service role to bypass RLS on INSERT.

import {
  generateMap,
  computeVisibleHexes,
  MAP_SIZES,
} from '../_shared/backend-core.js'
import { serviceClient, getUserId } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

type MapSize = keyof typeof MAP_SIZES
type GameMode = 'solo' | 'mixed' | 'multiplayer'
type AIDifficulty = 'easy' | 'normal' | 'hard'

const AI_CIVS = ['greeks', 'egyptians', 'chinese', 'aztecs', 'vikings', 'persians', 'mongols']
const AI_NAMES = ['Brutus', 'Cleopatra', 'Sun Tzu', 'Montezuma', 'Ragnar', 'Xerxes', 'Genghis']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const userId = await getUserId(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  let body: {
    seed?: string
    mapSize?: string
    gameMode?: string
    playerCount?: number
    humanSlots?: number
    maxTurns?: number
    aiDifficulty?: string
    myCiv?: string
  } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const seed         = body.seed ?? crypto.randomUUID()
  const mapSize      = (body.mapSize as MapSize | undefined) ?? 'medium'
  const gameMode     = (body.gameMode as GameMode | undefined) ?? 'solo'
  const playerCount  = Math.min(8, Math.max(2, body.playerCount ?? 2))
  const maxTurns     = ([10, 20, 40] as number[]).includes(body.maxTurns ?? 0) ? body.maxTurns! : 10
  const aiDifficulty = (body.aiDifficulty as AIDifficulty | undefined) ?? 'normal'
  const radius       = MAP_SIZES[mapSize] ?? MAP_SIZES.medium

  // humanSlots: how many human seats (including creator)
  const defaultHumanSlots = gameMode === 'multiplayer' ? playerCount : 1
  const humanSlots = Math.min(playerCount, Math.max(1, body.humanSlots ?? defaultHumanSlots))

  const svc = serviceClient()

  // Fetch creator's preferred civ
  const { data: profile } = await svc.from('profiles').select('selected_civ').eq('user_id', userId).single()
  const myCiv = body.myCiv ?? (profile?.selected_civ as string | null) ?? 'romans'

  const gameMap = generateMap(radius, seed, playerCount)
  const gameId  = crypto.randomUUID()
  const now     = Date.now()

  // ── Build players and units ───────────────────────────────────────────────

  type PlayerObj = {
    id: string
    displayName: string
    civilizationId: string
    resources: { gold: number; food: number; production: number }
    isEliminated: boolean
    isAIControlled: boolean
    aiDifficulty?: AIDifficulty
  }

  const players: PlayerObj[] = []
  const gamePlayers: {
    game_id: string
    user_id: string | null
    engine_player_id: string
    slot_order: number
    is_ai: boolean
    is_eliminated: boolean
  }[] = []

  // Slot 0: creator (always human)
  players.push({
    id: userId,
    displayName: 'You',
    civilizationId: myCiv,
    resources: { gold: 10, food: 10, production: 10 },
    isEliminated: false,
    isAIControlled: false,
  })
  gamePlayers.push({
    game_id: gameId,
    user_id: userId,
    engine_player_id: userId,
    slot_order: 0,
    is_ai: false,
    is_eliminated: false,
  })

  // Slots 1..(humanSlots-1): open human seats (engine_player_id = seat UUID)
  for (let i = 1; i < humanSlots; i++) {
    const seatId = crypto.randomUUID()
    players.push({
      id: seatId,
      displayName: `Jogador ${i + 1}`,
      civilizationId: AI_CIVS[i % AI_CIVS.length],
      resources: { gold: 10, food: 10, production: 10 },
      isEliminated: false,
      isAIControlled: false,
    })
    gamePlayers.push({
      game_id: gameId,
      user_id: null,
      engine_player_id: seatId,
      slot_order: i,
      is_ai: false,
      is_eliminated: false,
    })
  }

  // Slots humanSlots..(playerCount-1): AI opponents
  for (let i = humanSlots; i < playerCount; i++) {
    const aiIndex = i - humanSlots
    const aiId = `${gameId.slice(0, 8)}-ai${i}`
    players.push({
      id: aiId,
      displayName: AI_NAMES[aiIndex % AI_NAMES.length],
      civilizationId: AI_CIVS[aiIndex % AI_CIVS.length],
      resources: { gold: 10, food: 10, production: 10 },
      isEliminated: false,
      isAIControlled: true,
      aiDifficulty,
    })
    gamePlayers.push({
      game_id: gameId,
      user_id: null,
      engine_player_id: aiId,
      slot_order: i,
      is_ai: true,
      is_eliminated: false,
    })
  }

  // ── Units and cities at start positions ───────────────────────────────────

  const units = players.map((p, i) => ({
    id: `u-${p.id.slice(0, 6)}-${now + i}`,
    unitType: 'warrior',
    position: gameMap.startPositions[i] ?? { q: i, r: 0 },
    stats: { attack: 10, defense: 5, hp: 10, maxHp: 10, movement: 2 },
    ownerId: p.id,
    hasMoved: false,
    hasAttacked: false,
  }))

  const cities = players.map((p, i) => ({
    id: `c-${p.id.slice(0, 6)}-${now + i}`,
    name: i === 0 ? 'Capital' : `Capital ${i + 1}`,
    position: gameMap.startPositions[i] ?? { q: i, r: 0 },
    ownerId: p.id,
    population: 1,
    specialization: 'commercial',
    level: 1,
    foodStored: 0,
  }))

  // ── Fog of war per player ─────────────────────────────────────────────────

  const fogOfWar = players.map((p, i) => ({
    playerId: p.id,
    visibleHexes: computeVisibleHexes(
      [units[i]] as Parameters<typeof computeVisibleHexes>[0],
      [cities[i]] as Parameters<typeof computeVisibleHexes>[1],
      radius,
    ),
    exploredHexes: computeVisibleHexes(
      [units[i]] as Parameters<typeof computeVisibleHexes>[0],
      [cities[i]] as Parameters<typeof computeVisibleHexes>[1],
      radius,
    ),
  }))

  // ── Game state ────────────────────────────────────────────────────────────

  const gameState = {
    gameId,
    players,
    map: gameMap,
    units,
    cities,
    turnNumber: 1,
    currentPlayerId: userId,
    turnState: 'waitingForAction',
    era: 'ancient',
    maxTurns,
    combatDisputes: [],
    nonAggressionPacts: [],
    diplomaticProposals: [],
    fogOfWar,
    winner: null,
    isFinished: false,
  }

  const status = humanSlots > 1 ? 'lobby' : 'active'

  // ── Persist ───────────────────────────────────────────────────────────────

  const { error: gameError } = await svc.from('games').insert({
    id: gameId,
    game_state: gameState,
    turn_number: 1,
    current_player_id: userId,
    is_finished: false,
    winner_id: null,
    max_turns: maxTurns,
    state_version: 0,
    turn_deadline: null,
    seed,
    map_size: mapSize,
    status,
    human_slots: humanSlots,
  })

  if (gameError) return json({ error: gameError.message }, 500)

  const { error: playersError } = await svc.from('game_players').insert(gamePlayers)
  if (playersError) return json({ error: playersError.message }, 500)

  return json({ gameId, status }, 201)
})
