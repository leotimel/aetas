// POST /timeout-sweep — scheduled job (pg_cron / Supabase schedule).
//
// Resolves timed-out combat disputes and plays the substitute AI for absent
// players whose turn deadline has passed. Authenticated by a shared cron secret,
// NOT a user JWT. Idempotent: re-running is safe (CAS guards make repeats no-ops).

import { sweepTimeouts } from '@aetas/backend-core'
import { SupabaseGameRepo } from '../_shared/supabase-repository.ts'
import { serviceClient } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

const CRON_SECRET = Deno.env.get('CRON_SECRET')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // Cron auth: a shared secret header, not a user session.
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ error: 'forbidden' }, 403)
  }

  const repo = new SupabaseGameRepo(serviceClient())
  const summary = await sweepTimeouts(repo, { now: Date.now() })
  return json({ ok: true, summary }, 200)
})
