// POST /award-xp
//
// Two modes:
//
// 1. End-of-game  { gameId }
//    Idempotent via games.xp_awarded flag.
//    XP table: regular lose +10, regular win +35, daily lose +15, daily win +50.
//
// 2. Per-action   { event, actionId, amount }
//    Idempotent via xp_events(user_id, action_id) UNIQUE constraint.
//    Caller chooses the event label and amount from the XP table.

import { XP_FOR_PLAYING, XP_WIN_BONUS, XP_DAILY_BASE, XP_DAILY_WIN } from '../_shared/backend-core.js'
import { serviceClient, getUserId } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const userId = await getUserId(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  let body: { gameId?: string; event?: string; actionId?: string; amount?: number }
  try { body = await req.json() } catch { return json({ error: 'invalid JSON' }, 400) }

  const svc = serviceClient()

  // ── Mode 2: per-action granular event ─────────────────────────────────────
  if (body.event && body.actionId && typeof body.amount === 'number') {
    const { error: insertErr } = await svc
      .from('xp_events')
      .insert({ user_id: userId, action_id: body.actionId, event_type: body.event, xp_gained: body.amount })

    if (insertErr) {
      // Unique violation → already awarded
      if (insertErr.code === '23505') return json({ ok: true, xpGained: 0, alreadyAwarded: true }, 200)
      return json({ ok: false, error: insertErr.message }, 500)
    }

    await svc.rpc('increment_xp', { p_user_id: userId, p_xp: body.amount })

    const { data: profile } = await svc.from('profiles').select('xp').eq('user_id', userId).single()
    return json({ ok: true, xpGained: body.amount, newXp: profile?.xp ?? body.amount, alreadyAwarded: false }, 200)
  }

  // ── Mode 1: end-of-game ───────────────────────────────────────────────────
  if (!body.gameId) return json({ error: 'gameId or (event + actionId + amount) required' }, 400)

  const { data: playerRow } = await svc
    .from('game_players')
    .select('engine_player_id')
    .eq('game_id', body.gameId)
    .eq('user_id', userId)
    .single()

  if (!playerRow) return json({ error: 'player not in game' }, 403)
  const enginePlayerId = playerRow.engine_player_id as string

  const { data: marked } = await svc
    .from('games')
    .update({ xp_awarded: true })
    .eq('id', body.gameId)
    .eq('is_finished', true)
    .eq('xp_awarded', false)
    .select('is_daily, winner_id')
    .single()

  if (!marked) return json({ ok: true, xpGained: 0, alreadyAwarded: true }, 200)

  const didWin   = marked.winner_id === enginePlayerId
  const isDaily  = marked.is_daily as boolean
  const xpGained = isDaily
    ? (XP_DAILY_BASE + (didWin ? XP_DAILY_WIN : 0))
    : (XP_FOR_PLAYING + (didWin ? XP_WIN_BONUS : 0))

  await svc.rpc('increment_xp', { p_user_id: userId, p_xp: xpGained })

  const { data: profile } = await svc.from('profiles').select('xp').eq('user_id', userId).single()
  return json({ ok: true, xpGained, newXp: profile?.xp ?? xpGained, alreadyAwarded: false }, 200)
})
