import { supabase } from './supabase.ts'
import type { GameAction } from '@aetas/game-engine'

const FUNCTIONS_BASE = (import.meta.env.VITE_SUPABASE_URL as string) + '/functions/v1'

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

export interface ApiResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  kind?: string
}

async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const headers = await authHeaders()
    const res = await fetch(`${FUNCTIONS_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const data = await res.json() as unknown
    if (res.ok) return { ok: true, data: data as T }
    const err = data as { reason?: string; error?: string; kind?: string }
    return { ok: false, error: err.reason ?? err.error ?? 'unknown error', kind: err.kind }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export function submitAction(gameId: string, action: GameAction): Promise<ApiResult<{ ok: boolean }>> {
  return post('/submit-action', { gameId, action })
}

export function resolveDispute(gameId: string, disputeId: string): Promise<ApiResult<{ ok: boolean }>> {
  return post('/resolve-dispute', { gameId, disputeId })
}

export function createTestGame(): Promise<ApiResult<{ gameId: string }>> {
  return post('/create-game', {})
}
