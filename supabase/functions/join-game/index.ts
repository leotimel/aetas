// POST /join-game — authenticated user joins an open human slot in a lobby game.
//
// Body: { gameId: string }
//
// Finds the lowest-ordered open human slot (user_id=null, is_ai=false),
// assigns the current user to it, and checks if the lobby is now full.
// If all human slots are filled, sets games.status = 'active'.
// Returns { ok, isFull, gameId } so the client can navigate appropriately.

import { serviceClient, getUserId } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const userId = await getUserId(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  let body: { gameId?: string } = {}
  try { body = await req.json() } catch { /* */ }
  if (!body.gameId) return json({ error: 'gameId is required' }, 400)

  const { gameId } = body
  const svc = serviceClient()

  // Verify game is in lobby status
  const { data: game } = await svc
    .from('games')
    .select('status, human_slots')
    .eq('id', gameId)
    .single()

  if (!game) return json({ error: 'game not found' }, 404)
  if (game.status !== 'lobby') return json({ error: 'game is not in lobby' }, 400)

  // Prevent duplicate joins
  const { data: existing } = await svc
    .from('game_players')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return json({ ok: true, isFull: false, gameId, alreadyJoined: true }, 200)

  // Find an open human slot ordered by slot_order
  const { data: openSlots } = await svc
    .from('game_players')
    .select('id, slot_order, engine_player_id')
    .eq('game_id', gameId)
    .eq('is_ai', false)
    .is('user_id', null)
    .order('slot_order')
    .limit(1)

  const slot = openSlots?.[0]
  if (!slot) return json({ error: 'no open slots in this game' }, 409)

  // Claim the slot
  const { error: updateErr } = await svc
    .from('game_players')
    .update({ user_id: userId })
    .eq('id', slot.id)

  if (updateErr) return json({ error: updateErr.message }, 500)

  // Count remaining open human slots
  const { count } = await svc
    .from('game_players')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('is_ai', false)
    .is('user_id', null)

  const isFull = (count ?? 1) === 0

  if (isFull) {
    await svc.from('games').update({ status: 'active' }).eq('id', gameId)
  }

  return json({ ok: true, isFull, gameId }, 200)
})
