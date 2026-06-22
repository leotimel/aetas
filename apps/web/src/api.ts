import { supabase } from './supabase.ts'
import type { GameAction, GameState } from '@aetas/game-engine'

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

export const submitAction = (gameId: string, action: GameAction) =>
  post<{ ok: boolean }>('/submit-action', { gameId, action })

export const resolveDispute = (gameId: string, disputeId: string) =>
  post<{ ok: boolean; state?: GameState }>('/resolve-dispute', { gameId, disputeId })

export const createTestGame = () =>
  post<{ gameId: string }>('/create-game', {})

export const createDailyGame = () =>
  post<{ gameId: string; isNew: boolean }>('/create-daily-game', {})

export const awardXp = (gameId: string) =>
  post<{ xpGained: number; newXp: number; alreadyAwarded: boolean }>('/award-xp', { gameId })
