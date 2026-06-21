// POST /create-daily-game — creates (or returns existing) daily challenge game.
//
// Seed = today's UTC date string (e.g. "2026-06-21"), shared by all players,
// so everyone gets the same map. Radius 3 / 8 turns — fast solo vs. AI.
// Idempotent: calling twice on the same day returns the same game ID.

import {
  generateMap,
  computeVisibleHexes,
} from '../_shared/backend-core.js'
import { serviceClient, getUserId } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

const MAP_RADIUS = 3
const MAX_TURNS  = 8

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const userId = await getUserId(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  // Today's seed — UTC date string, same for all players
  const today = new Date().toISOString().slice(0, 10)  // e.g. "2026-06-21"

  const svc = serviceClient()

  // Fetch user's selected civ (upsert profile if missing)
  const { data: profile } = await svc.from('profiles').select('selected_civ').eq('user_id', userId).single()
  const selectedCiv = (profile?.selected_civ as string | null) ?? 'romans'

  // Idempotency: check if user already has today's daily game
  const { data: existing } = await svc
    .from('game_players')
    .select('game_id, games!inner(is_daily, daily_date)')
    .eq('user_id', userId)
    .eq('is_ai', false)
    .eq('games.is_daily', true)
    .eq('games.daily_date', today)
    .limit(1)
    .single()

  if (existing) {
    return json({ gameId: existing.game_id, isNew: false }, 200)
  }

  // Create new daily game
  const gameId = crypto.randomUUID()
  const aiId   = `${gameId.slice(0, 8)}-ai`

  // Seed = today's date → same map for everyone today
  const gameMap = generateMap(MAP_RADIUS, today, 2)
  const [p0Start, p1Start] = gameMap.startPositions

  const now = Date.now()

  const w0 = {
    id: `u-${userId.slice(0, 6)}-${now}`,
    unitType: 'warrior',
    position: p0Start ?? { q: 0, r: 0 },
    stats: { attack: 10, defense: 5, hp: 10, maxHp: 10, movement: 2 },
    ownerId: userId,
    hasMoved: false,
    hasAttacked: false,
  }
  const w1 = {
    id: `u-${aiId.slice(0, 6)}-${now + 1}`,
    unitType: 'warrior',
    position: p1Start ?? { q: 1, r: 0 },
    stats: { attack: 10, defense: 5, hp: 10, maxHp: 10, movement: 2 },
    ownerId: aiId,
    hasMoved: false,
    hasAttacked: false,
  }

  const c0 = {
    id: `c-${userId.slice(0, 6)}-${now}`,
    name: 'Capital',
    position: p0Start ?? { q: 0, r: 0 },
    ownerId: userId,
    population: 1,
    specialization: 'commercial',
    level: 1,
    foodStored: 0,
  }
  const c1 = {
    id: `c-${aiId.slice(0, 6)}-${now + 1}`,
    name: 'AI Capital',
    position: p1Start ?? { q: 1, r: 0 },
    ownerId: aiId,
    population: 1,
    specialization: 'commercial',
    level: 1,
    foodStored: 0,
  }

  const fow0 = {
    playerId: userId,
    visibleHexes: computeVisibleHexes([w0] as Parameters<typeof computeVisibleHexes>[0], [c0] as Parameters<typeof computeVisibleHexes>[1], MAP_RADIUS),
    exploredHexes: computeVisibleHexes([w0] as Parameters<typeof computeVisibleHexes>[0], [c0] as Parameters<typeof computeVisibleHexes>[1], MAP_RADIUS),
  }
  const fow1 = {
    playerId: aiId,
    visibleHexes: computeVisibleHexes([w1] as Parameters<typeof computeVisibleHexes>[0], [c1] as Parameters<typeof computeVisibleHexes>[1], MAP_RADIUS),
    exploredHexes: computeVisibleHexes([w1] as Parameters<typeof computeVisibleHexes>[0], [c1] as Parameters<typeof computeVisibleHexes>[1], MAP_RADIUS),
  }

  const gameState = {
    gameId,
    players: [
      {
        id: userId,
        displayName: 'You',
        civilizationId: selectedCiv,
        resources: { gold: 10, food: 10, production: 10 },
        isEliminated: false,
        isAIControlled: false,
      },
      {
        id: aiId,
        displayName: 'AI Opponent',
        civilizationId: 'greeks',
        resources: { gold: 10, food: 10, production: 10 },
        isEliminated: false,
        isAIControlled: true,
      },
    ],
    map: gameMap,
    units: [w0, w1],
    cities: [c0, c1],
    turnNumber: 1,
    currentPlayerId: userId,
    turnState: 'waitingForAction',
    era: 'ancient',
    maxTurns: MAX_TURNS,
    combatDisputes: [],
    nonAggressionPacts: [],
    diplomaticProposals: [],
    fogOfWar: [fow0, fow1],
    winner: null,
    isFinished: false,
  }

  const { error: gameError } = await svc.from('games').insert({
    id: gameId,
    game_state: gameState,
    turn_number: 1,
    current_player_id: userId,
    is_finished: false,
    winner_id: null,
    max_turns: MAX_TURNS,
    state_version: 0,
    turn_deadline: null,
    is_daily: true,
    daily_date: today,
  })

  if (gameError) return json({ error: gameError.message }, 500)

  const { error: playersError } = await svc.from('game_players').insert([
    {
      game_id: gameId,
      user_id: userId,
      engine_player_id: userId,
      slot_order: 0,
      is_ai: false,
      is_eliminated: false,
    },
    {
      game_id: gameId,
      user_id: null,
      engine_player_id: aiId,
      slot_order: 1,
      is_ai: true,
      is_eliminated: false,
    },
  ])

  if (playersError) return json({ error: playersError.message }, 500)

  return json({ gameId, isNew: true }, 201)
})
