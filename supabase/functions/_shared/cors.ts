// Shared CORS headers + helpers for the Edge Functions.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Maps an OrchestrationResult kind to an HTTP status code. */
export function statusForKind(kind: string): number {
  switch (kind) {
    case 'conflict': return 409
    case 'rejected': return 400
    case 'forbidden': return 403
    case 'not_found': return 404
    default: return 400
  }
}
