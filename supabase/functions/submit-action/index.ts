// POST /submit-action — a player submits a turn action (endTurn / initiateCombat).
//
// Thin shell: auth → build SupabaseGameRepo → orchestration.submitAction → HTTP.
// All game rules + CAS concurrency live in @aetas/backend-core (tested in Vitest).

import { submitAction, sweepTimeouts, type SubmitableAction } from '../_shared/backend-core.js'
import { SupabaseGameRepo } from '../_shared/supabase-repository.ts'
import { serviceClient, getUserId } from '../_shared/clients.ts'
import { corsHeaders, json, statusForKind } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const userId = await getUserId(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)

    let body: { gameId?: string; action?: SubmitableAction }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'invalid JSON body' }, 400)
    }
    if (!body.gameId || !body.action) return json({ error: 'gameId and action are required' }, 400)

    const sc = serviceClient()

    // Map auth userId → engine_player_id (for multiplayer games with seat UUIDs).
    // For solo games engine_player_id == userId, so this is always safe.
    const { data: playerRow } = await sc
      .from('game_players')
      .select('engine_player_id')
      .eq('game_id', body.gameId)
      .eq('user_id', userId)
      .eq('is_ai', false)
      .maybeSingle()

    const enginePlayerId = playerRow?.engine_player_id ?? userId

    const repo = new SupabaseGameRepo(sc)
    const result = await submitAction(repo, {
      gameId: body.gameId,
      userId: enginePlayerId,
      action: body.action,
      now: Date.now(),
    })

    if (!result.ok) return json({ ok: false, kind: result.kind, reason: result.reason }, statusForKind(result.kind))

    // Broadcast game_over so all clients can show the results screen immediately.
    if (result.state.isFinished) {
      await sc.channel(`game:${body.gameId}`).send({
        type: 'broadcast',
        event: 'game_over',
        payload: { winnerId: result.state.winner },
      })
    }

    // If the next player is AI-controlled, advance their turn immediately so human players
    // don't need a cron job during development. Uses far-future 'now' so the freshly-set
    // turn_deadline (now + TURN_TIMEOUT_MS) is already considered expired.
    const nextPlayer = result.state.players.find(p => p.id === result.state.currentPlayerId)
    if (!result.state.isFinished && nextPlayer?.isAIControlled) {
      const farFuture = Date.now() + 30 * 24 * 60 * 60 * 1000
      await sweepTimeouts(new SupabaseGameRepo(sc), { now: farFuture })
    }

    return json({ ok: true, state: result.state }, 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ ok: false, kind: 'internal', reason: msg }, 500)
  }
})
