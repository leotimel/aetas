import { corsHeaders, json } from '../_shared/cors.ts'
import { getUserId, serviceClient } from '../_shared/clients.ts'

interface Player {
  id: string
  isAIControlled: boolean
  isEliminated?: boolean
}

interface GameState {
  players: Player[]
  turnOrder?: string[]
  currentPlayerId?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const userId = await getUserId(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const { gameId } = await req.json() as { gameId: string }
  const sc = serviceClient()

  // 1. Valida participação
  const { data: playerRow } = await sc
    .from('game_players')
    .select('engine_player_id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .eq('is_ai', false)
    .maybeSingle()
  if (!playerRow) return json({ error: 'forbidden' }, 403)

  // 2. Busca jogo
  const { data: game } = await sc
    .from('games')
    .select('is_finished, game_state, current_player_id')
    .eq('id', gameId)
    .single()
  if (!game) return json({ error: 'not_found' }, 404)
  if (game.is_finished) return json({ error: 'already_finished' }, 400)

  const enginePlayerId = playerRow.engine_player_id as string
  const gs = game.game_state as GameState

  // 3. Determina solo (≤1 humano)
  const humans = gs.players.filter(p => !p.isAIControlled)
  if (humans.length <= 1) {
    await sc.from('games').update({
      is_finished: true,
      winner_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', gameId)
    return json({ abandoned: true, multiplayer: false })
  }

  // 4. Multiplayer: marcar eliminado
  const updatedPlayers = gs.players.map(p =>
    p.id === enginePlayerId ? { ...p, isEliminated: true } : p
  )
  const alive = updatedPlayers.filter(p => !p.isEliminated)
  const isFinished = alive.length <= 1
  const winnerId = alive.length === 1 ? alive[0]!.id : null

  // 5. Avança turno se era a vez do caller
  let nextCurrentPlayer = game.current_player_id as string
  if (game.current_player_id === enginePlayerId && !isFinished) {
    const order: string[] = gs.turnOrder ?? gs.players.map(p => p.id)
    const idx = order.indexOf(enginePlayerId)
    const aliveIds = new Set(alive.map(p => p.id))
    for (let i = 1; i <= order.length; i++) {
      const candidate = order[(idx + i) % order.length]!
      if (aliveIds.has(candidate)) { nextCurrentPlayer = candidate; break }
    }
  }

  // 6. Salva estado atualizado
  const newGs: GameState = {
    ...gs,
    players: updatedPlayers,
    ...(gs.currentPlayerId !== undefined ? { currentPlayerId: nextCurrentPlayer } : {}),
  }
  await sc.from('games').update({
    game_state: newGs,
    is_finished: isFinished,
    winner_id: isFinished ? winnerId : null,
    current_player_id: nextCurrentPlayer,
    updated_at: new Date().toISOString(),
  }).eq('id', gameId)

  return json({ abandoned: true, multiplayer: true, gameOver: isFinished })
})
