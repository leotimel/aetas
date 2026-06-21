import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.ts'
import type { GameState } from '@aetas/game-engine'
import HexGrid from '../components/HexGrid.tsx'
import ActionPanel from '../components/ActionPanel.tsx'
import GameInfo from '../components/GameInfo.tsx'
import { submitAction, resolveDispute } from '../api.ts'

interface Props {
  gameId: string
  userId: string
  onBack: () => void
}

export default function GameView({ gameId, userId, onBack }: Props) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [enginePlayerId, setEnginePlayerId] = useState<string>(userId)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [godMode, setGodMode] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const addLog = (msg: string) => {
    const ts = new Date().toISOString().slice(11, 19)
    setLog(l => [`${ts} ${msg}`, ...l].slice(0, 30))
  }

  const fetchGame = useCallback(async () => {
    const { data, error } = await supabase
      .from('games')
      .select('game_state, turn_number, current_player_id, is_finished, winner_id')
      .eq('id', gameId)
      .single()
    if (error) { addLog(`Erro ao buscar estado: ${error.message}`); return }
    setGameState(data.game_state as GameState)
    setLoading(false)
  }, [gameId])

  // Resolve engine_player_id for this user in this game
  useEffect(() => {
    supabase
      .from('game_players')
      .select('engine_player_id')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        if (data?.engine_player_id) setEnginePlayerId(data.engine_player_id as string)
      })
  }, [gameId, userId])

  useEffect(() => { void fetchGame() }, [fetchGame])

  // Realtime subscription
  useEffect(() => {
    void supabase.realtime.setAuth()
    const channel = supabase
      .channel(`game:${gameId}`, { config: { private: true } })
      .on('broadcast', { event: 'turn_changed' }, (msg) => {
        const p = msg.payload as { currentPlayerId: string; turnNumber: number }
        addLog(`turn_changed → vez de ${p.currentPlayerId.slice(0, 8)} (turno ${p.turnNumber})`)
        void fetchGame()
      })
      .on('broadcast', { event: 'dispute_resolved' }, (msg) => {
        const p = msg.payload as { disputeId: string; status: string }
        addLog(`dispute_resolved → ${p.disputeId.slice(0, 12)} (${p.status})`)
        void fetchGame()
      })
      .on('broadcast', { event: 'game_over' }, (msg) => {
        const p = msg.payload as { winnerId: string | null }
        addLog(`game_over → ${p.winnerId ? p.winnerId.slice(0, 8) : 'empate'}`)
        void fetchGame()
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [gameId, fetchGame])

  const isMyTurn = !!gameState && gameState.currentPlayerId === enginePlayerId && !gameState.isFinished

  const handleEndTurn = async () => {
    const res = await submitAction(gameId, { type: 'endTurn' })
    addLog(res.ok ? '✓ Turno encerrado' : `✗ endTurn: ${res.error ?? ''} (${res.kind ?? ''})`)
    if (res.ok) { setSelectedUnitId(null); void fetchGame() }
  }

  const handleInitiateCombat = async (attackerUnitId: string, defenderUnitId: string) => {
    const res = await submitAction(gameId, { type: 'initiateCombat', attackerUnitId, defenderUnitId })
    const atk = attackerUnitId.slice(0, 6)
    const def = defenderUnitId.slice(0, 6)
    addLog(res.ok ? `✓ Combate ${atk}→${def}` : `✗ combate: ${res.error ?? ''}`)
    if (res.ok) { setSelectedUnitId(null); void fetchGame() }
  }

  const handleResolveDispute = async (disputeId: string) => {
    const res = await resolveDispute(gameId, disputeId)
    addLog(res.ok ? `✓ Disputa resolvida` : `✗ disputa: ${res.error ?? ''}`)
    if (res.ok) void fetchGame()
  }

  if (loading) return <div style={{ padding: 20, color: '#888' }}>Carregando partida…</div>
  if (!gameState) return <div style={{ padding: 20, color: '#f87171' }}>Erro ao carregar partida.</div>

  return (
    <div style={{ fontFamily: 'monospace', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d1117' }}>
      {/* Header */}
      <div style={{ padding: '6px 12px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onBack} style={smallBtn}>← Lista</button>
        <span style={{ color: '#555', fontSize: 11 }}>{gameId.slice(0, 8)}…</span>
        <span style={{ color: '#888', fontSize: 12 }}>Turno {gameState.turnNumber}/{gameState.maxTurns}</span>
        <span style={{ color: isMyTurn ? '#22c55e' : '#6b7280', fontSize: 12, fontWeight: isMyTurn ? 'bold' : 'normal' }}>
          {isMyTurn ? '● SUA VEZ' : `○ Vez de ${gameState.currentPlayerId.slice(0, 8)}`}
        </span>
        {gameState.isFinished && (
          <span style={{ color: '#f59e0b', fontSize: 12 }}>
            ★ {gameState.winner ? `Vencedor: ${gameState.winner.slice(0, 8)}` : 'Empate'}
          </span>
        )}
        <label style={{ color: '#888', fontSize: 12, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={godMode} onChange={e => setGodMode(e.target.checked)} />
          God mode
        </label>
        <button onClick={() => { void fetchGame() }} style={smallBtn}>↺</button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Hex grid */}
        <div style={{ flex: 1, overflow: 'auto', background: '#0d1117' }}>
          <HexGrid
            gameState={gameState}
            myEnginePlayerId={enginePlayerId}
            selectedUnitId={selectedUnitId}
            godMode={godMode}
            onSelectUnit={setSelectedUnitId}
            onInitiateCombat={(atk, def) => { void handleInitiateCombat(atk, def) }}
          />
        </div>

        {/* Right panel */}
        <div style={{ width: 290, borderLeft: '1px solid #30363d', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <GameInfo gameState={gameState} myEnginePlayerId={enginePlayerId} />
          <ActionPanel
            gameState={gameState}
            myEnginePlayerId={enginePlayerId}
            isMyTurn={isMyTurn}
            selectedUnitId={selectedUnitId}
            log={log}
            onEndTurn={() => { void handleEndTurn() }}
            onResolveDispute={(id) => { void handleResolveDispute(id) }}
          />
        </div>
      </div>
    </div>
  )
}

const smallBtn: React.CSSProperties = {
  background: '#21262d', color: '#e6edf3', border: '1px solid #30363d',
  padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
}
