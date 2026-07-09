// POST /check-achievement
//
// Body: { achievementId?: string; gameId?: string }
//   - no achievementId → evaluate ALL not-yet-unlocked achievements (batch,
//     used by the Profile screen on load).
//   - achievementId    → evaluate only that one.
//
// Every condition is validated SERVER-SIDE from authoritative data (games,
// game_players, profiles, xp_events, and game_state JSONB). The client is
// never trusted — it can only ask "re-check", never "grant". Idempotent via
// the (user_id, achievement_id) primary key.

import { ACHIEVEMENTS, xpToLevel, unlockedCivs, CIVILIZATIONS } from '../_shared/backend-core.js'
import { serviceClient, getUserId } from '../_shared/clients.ts'
import { corsHeaders, json } from '../_shared/cors.ts'

interface GameStateJson {
  winner?: string | null
  players?: { id: string; isEliminated?: boolean }[]
  cities?: { ownerId: string; level: number }[]
  wonders?: { ownerId: string }[]
}
interface GameRow {
  engine_player_id: string
  games: { winner_id: string | null; is_finished: boolean; game_state: GameStateJson } | null
}
interface AchievementDef {
  id: string
  condition:
    | { kind: 'winCount'; threshold: number }
    | { kind: 'level'; threshold: number }
    | { kind: 'allCivs' }
    | { kind: 'dailyStreak'; threshold: number }
    | { kind: 'eventCount'; event: string; threshold: number }
    | { kind: 'gameState'; check: 'domination' | 'wonder' | 'metropolis' }
}

function passesGameState(rows: GameRow[], check: 'domination' | 'wonder' | 'metropolis'): boolean {
  for (const r of rows) {
    const gs = r.games?.game_state
    const me = r.engine_player_id
    if (!gs) continue
    if (check === 'domination') {
      if (r.games!.is_finished && r.games!.winner_id === me &&
          (gs.players ?? []).every(p => p.id === me || p.isEliminated)) return true
    } else if (check === 'wonder') {
      if ((gs.wonders ?? []).some(w => w.ownerId === me)) return true
    } else if (check === 'metropolis') {
      if ((gs.cities ?? []).some(c => c.ownerId === me && c.level >= 3)) return true
    }
  }
  return false
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const userId = await getUserId(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  let body: { achievementId?: string; gameId?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid JSON' }, 400) }
  const single = body.achievementId

  const svc = serviceClient()

  // Already-unlocked set (skip these).
  const { data: existing } = await svc
    .from('user_achievements').select('achievement_id').eq('user_id', userId)
  const unlockedSet = new Set<string>((existing ?? []).map((r: { achievement_id: string }) => r.achievement_id))

  // Account state.
  const { data: prof } = await svc
    .from('profiles').select('xp, daily_streak').eq('user_id', userId).single()
  const xp = (prof?.xp as number) ?? 0
  const streak = (prof?.daily_streak as number) ?? 0
  const level = xpToLevel(xp)
  const allCivsUnlocked = unlockedCivs(xp).length === CIVILIZATIONS.length

  // Per-event counts (combat_won, city_captured, city_founded, pact_signed, …).
  const { data: evs } = await svc
    .from('xp_events').select('event_type').eq('user_id', userId)
  const evCounts: Record<string, number> = {}
  for (const e of (evs ?? []) as { event_type: string }[]) {
    evCounts[e.event_type] = (evCounts[e.event_type] ?? 0) + 1
  }

  // The user's games (columns for win counting + game_state for state checks).
  const { data: gpData } = await svc
    .from('game_players')
    .select('engine_player_id, games(winner_id, is_finished, game_state)')
    .eq('user_id', userId)
  const gameRows = ((gpData ?? []) as unknown as GameRow[])
  const wins = gameRows.filter(r => r.games?.is_finished && r.games.winner_id === r.engine_player_id).length

  const toInsert: string[] = []
  for (const def of ACHIEVEMENTS as AchievementDef[]) {
    if (unlockedSet.has(def.id)) continue
    if (single && def.id !== single) continue
    const c = def.condition
    let earned = false
    switch (c.kind) {
      case 'winCount':    earned = wins >= c.threshold; break
      case 'level':       earned = level >= c.threshold; break
      case 'allCivs':     earned = allCivsUnlocked; break
      case 'dailyStreak': earned = streak >= c.threshold; break
      case 'eventCount':  earned = (evCounts[c.event] ?? 0) >= c.threshold; break
      case 'gameState':   earned = passesGameState(gameRows, c.check); break
    }
    if (earned) toInsert.push(def.id)
  }

  if (toInsert.length > 0) {
    await svc.from('user_achievements').upsert(
      toInsert.map(id => ({ user_id: userId, achievement_id: id })),
      { onConflict: 'user_id,achievement_id', ignoreDuplicates: true },
    )
  }

  const unlocked = [...unlockedSet, ...toInsert]
  return json({ ok: true, unlocked, newly: toInsert }, 200)
})
