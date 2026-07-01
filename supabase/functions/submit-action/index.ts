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

    // Chain: advance every consecutive AI-controlled turn in this request, so a human
    // doesn't wait for the cron between AI turns (e.g. a large game with 3 AIs in a row).
    // sweepTimeouts processes one turn per timed-out game, and each AI turn sets the next
    // player's deadline to now_used + TURN_TIMEOUT_MS (24h). So each iteration must use a
    // STRICTLY LARGER `now` than the previous — a 30-day stride clears that 24h bump.
    let recheck = result.state
    const DAY_MS = 24 * 60 * 60 * 1000
    for (let i = 0; i < 10; i++) {
      if (recheck.isFinished) break
      const nextPlayer = recheck.players.find(p => p.id === recheck.currentPlayerId)
      if (!nextPlayer?.isAIControlled) break

      const farFuture = Date.now() + (i + 1) * 30 * DAY_MS
      await sweepTimeouts(new SupabaseGameRepo(sc), { now: farFuture })

      const { data: fresh } = await sc.from('games').select('game_state').eq('id', body.gameId).single()
      const next = fresh?.game_state as typeof result.state | undefined
      if (!next) break
      recheck = next
    }

    // Broadcast game_over so all clients can show the results screen immediately —
    // whether the human's action or a chained AI turn ended the game.
    if (recheck.isFinished) {
      await sc.channel(`game:${body.gameId}`).send({
        type: 'broadcast',
        event: 'game_over',
        payload: { winnerId: recheck.winner },
      })
    }

    return json({ ok: true, state: recheck }, 200)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ ok: false, kind: 'internal', reason: msg }, 500)
  }
})
