// POST /create-game — debug tool: creates a test game (current user vs. 1 AI).
//
// The human player's engine ID = their Supabase UUID so the submit-action gate
// (currentPlayerId === userId) works without any mapping.
// Uses service role to bypass RLS on INSERT (games + game_players have no
// INSERT policy for authenticated users — mutations go through Edge Functions).

import {
  generateMap,
  computeVisibleHexes,
} from '../_shared/backend-core.js'
import { serviceClient, getUserId } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const userId = await getUserId(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const gameId = crypto.randomUUID()
  const aiId = `${gameId.slice(0, 8)}-ai`
  const MAP_RADIUS = 4
  const MAX_TURNS = 10

  const svc = serviceClient()
  const { data: profile } = await svc.from('profiles').select('selected_civ').eq('user_id', userId).single()
  const selectedCiv = (profile?.selected_civ as string | null) ?? 'romans'

  const gameMap = generateMap(MAP_RADIUS, gameId, 2)
  const [p0Start, p1Start] = gameMap.startPositions

  const now = Date.now()

  // Debug: warriors placed adjacent at center for immediate combat testing.
  // Cities remain at their natural start positions. Movement is v2, so without
  // this override the warriors would never be close enough to initiate combat.
  const w0Pos = { q: 0, r: 0 }
  const w1Pos = { q: 1, r: 0 }  // axial neighbor of (0,0)

  // Units
  const w0 = {
    id: `u-${userId.slice(0, 6)}-${now}`,
    unitType: 'warrior',
    position: w0Pos,
    stats: { attack: 10, defense: 5, hp: 10, maxHp: 10, movement: 2 },
    ownerId: userId,
    hasMoved: false,
    hasAttacked: false,
  }
  const w1 = {
    id: `u-${aiId.slice(0, 6)}-${now + 1}`,
    unitType: 'warrior',
    position: w1Pos,
    stats: { attack: 10, defense: 5, hp: 10, maxHp: 10, movement: 2 },
    ownerId: aiId,
    hasMoved: false,
    hasAttacked: false,
  }

  // Cities
  const c0 = {
    id: `c-${userId.slice(0, 6)}-${now}`,
    name: 'Capital',
    position: p0Start,
    ownerId: userId,
    population: 1,
    specialization: 'commercial',
    level: 1,
    foodStored: 0,
  }
  const c1 = {
    id: `c-${aiId.slice(0, 6)}-${now + 1}`,
    name: 'AI Capital',
    position: p1Start,
    ownerId: aiId,
    population: 1,
    specialization: 'commercial',
    level: 1,
    foodStored: 0,
  }

  // Fog of war — cast to satisfy computeVisibleHexes param types
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

  return json({ gameId }, 201)
})
