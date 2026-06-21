// POST /submit-action — a player submits a turn action (endTurn / initiateCombat).
//
// Thin shell: auth → build SupabaseGameRepo → orchestration.submitAction → HTTP.
// All game rules + CAS concurrency live in @aetas/backend-core (tested in Vitest).

import { submitAction, type SubmitableAction } from '@aetas/backend-core'
import { SupabaseGameRepo } from '../_shared/supabase-repository.ts'
import { serviceClient, getUserId } from '../_shared/clients.ts'
import { corsHeaders, json, statusForKind } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const userId = await getUserId(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  let body: { gameId?: string; action?: SubmitableAction }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  if (!body.gameId || !body.action) return json({ error: 'gameId and action are required' }, 400)

  const repo = new SupabaseGameRepo(serviceClient())
  const result = await submitAction(repo, {
    gameId: body.gameId,
    userId,
    action: body.action,
    now: Date.now(),
  })

  if (result.ok) return json({ ok: true, state: result.state }, 200)
  return json({ ok: false, kind: result.kind, reason: result.reason }, statusForKind(result.kind))
})
