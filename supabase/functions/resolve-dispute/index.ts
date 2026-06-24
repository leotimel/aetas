// POST /resolve-dispute — the attacker or defender resolves a pending combat
// dispute (possibly out of their own turn — a dispute response is not turn-gated).
//
// Thin shell: auth → SupabaseGameRepo → orchestration.resolveDispute → HTTP.

import { resolveDispute } from '../_shared/backend-core.js'
import { SupabaseGameRepo } from '../_shared/supabase-repository.ts'
import { serviceClient, getUserId } from '../_shared/clients.ts'
import { corsHeaders, json, statusForKind } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const userId = await getUserId(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  let body: { gameId?: string; disputeId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  if (!body.gameId || !body.disputeId) return json({ error: 'gameId and disputeId are required' }, 400)

  const sc = serviceClient()

  // Map auth userId → engine_player_id (for multiplayer games with seat UUIDs).
  const { data: playerRow } = await sc
    .from('game_players')
    .select('engine_player_id')
    .eq('game_id', body.gameId)
    .eq('user_id', userId)
    .eq('is_ai', false)
    .maybeSingle()

  const enginePlayerId = playerRow?.engine_player_id ?? userId

  const repo = new SupabaseGameRepo(sc)
  const result = await resolveDispute(repo, {
    gameId: body.gameId,
    userId: enginePlayerId,
    disputeId: body.disputeId,
    now: Date.now(),
  })

  if (result.ok) return json({ ok: true, state: result.state }, 200)
  return json({ ok: false, kind: result.kind, reason: result.reason }, statusForKind(result.kind))
})
