// POST /award-xp { gameId }
//
// Idempotent: uses xp_awarded flag to ensure XP is granted exactly once per game.
// The atomicity trick: UPDATE games SET xp_awarded = true WHERE xp_awarded = false —
// only succeeds once, concurrent calls are safe.
//
// XP table:
//   Regular game, lose : +10
//   Regular game, win  : +35  (10 + 25)
//   Daily game,   lose : +15
//   Daily game,   win  : +50  (15 + 35)

import { XP_FOR_PLAYING, XP_WIN_BONUS, XP_DAILY_BASE, XP_DAILY_WIN } from '../_shared/backend-core.js'
import { serviceClient, getUserId } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const userId = await getUserId(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  let body: { gameId?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid JSON' }, 400) }
  if (!body.gameId) return json({ error: 'gameId required' }, 400)

  const svc = serviceClient()

  // Resolve engine_player_id (the user's ID within the game engine state)
  const { data: playerRow } = await svc
    .from('game_players')
    .select('engine_player_id')
    .eq('game_id', body.gameId)
    .eq('user_id', userId)
    .single()

  if (!playerRow) return json({ error: 'player not in game' }, 403)
  const enginePlayerId = playerRow.engine_player_id as string

  // Atomically mark as awarded — returns the row only if this call is the first
  const { data: marked } = await svc
    .from('games')
    .update({ xp_awarded: true })
    .eq('id', body.gameId)
    .eq('is_finished', true)
    .eq('xp_awarded', false)
    .select('is_daily, winner_id')
    .single()

  if (!marked) {
    // Game not finished yet, or XP already awarded in a previous call
    return json({ ok: true, xpGained: 0, alreadyAwarded: true }, 200)
  }

  const didWin    = marked.winner_id === enginePlayerId
  const isDaily   = marked.is_daily as boolean
  const xpGained  = isDaily
    ? (XP_DAILY_BASE + (didWin ? XP_DAILY_WIN : 0))
    : (XP_FOR_PLAYING + (didWin ? XP_WIN_BONUS : 0))

  // Upsert profile and increment XP atomically
  await svc.rpc('increment_xp', { p_user_id: userId, p_xp: xpGained })

  // Fetch new total to detect level-up
  const { data: profile } = await svc
    .from('profiles')
    .select('xp')
    .eq('user_id', userId)
    .single()

  return json({ ok: true, xpGained, newXp: profile?.xp ?? xpGained, alreadyAwarded: false }, 200)
})
