import { useState, useEffect, useCallback } from 'react'
import type { GameState } from '@aetas/game-engine'
import { supabase } from '../supabase.ts'
import { submitAction, resolveDispute, awardXp } from '../api.ts'
import HexMap from '../components/HexMap.tsx'
import ActionSheet from '../components/ActionSheet.tsx'
import PlayerBar from '../components/PlayerBar.tsx'
import CityModal from '../components/CityModal.tsx'
import GameOverScreen from '../components/GameOverScreen.tsx'

interface Props {
  gameId: string
  userId: string
  onBack: () => void
}

export default function GameView({ gameId, userId, onBack }: Props) {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [enginePlayerId, setEnginePlayerId] = useState<string>(userId)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null)
  const [showGameOver, setShowGameOver] = useState(false)
  const [xpGain, setXpGain] = useState<{ gained: number; newXp: number } | null>(null)
  const [godMode, setGodMode] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const addLog = (msg: string) => {
    const ts = new Date().toISOString().slice(11, 19)
    setLog(l => [`${ts} ${msg}`, ...l].slice(0, 40))
  }

  const fetchGame = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('games')
      .select('game_state, turn_number, current_player_id, is_finished, winner_id')
      .eq('id', gameId)
      .single()
    if (err) { setError(err.message); return }
    setGameState(data.game_state as GameState)
    setLoading(false)
  }, [gameId])

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

  useEffect(() => {
    if (gameState?.isFinished) {
      setShowGameOver(true)
      void awardXp(gameId).then(res => {
        if (res.ok && res.data && !res.data.alreadyAwarded) {
          setXpGain({ gained: res.data.xpGained, newXp: res.data.newXp })
        }
      })
    }
  }, [gameState?.isFinished, gameId])

  const isMyTurn = !!gameState && gameState.currentPlayerId === enginePlayerId && !gameState.isFinished

  const handleEndTurn = async () => {
    const res = await submitAction(gameId, { type: 'endTurn' })
    addLog(res.ok ? '✓ Turno encerrado' : `✗ endTurn: ${res.error ?? ''} (${res.kind ?? ''})`)
    if (res.ok) { setSelectedUnitId(null); void fetchGame() }
  }

  const handleInitiateCombat = async (attackerUnitId: string, defenderUnitId: string) => {
    const res = await submitAction(gameId, { type: 'initiateCombat', attackerUnitId, defenderUnitId })
    addLog(res.ok ? `✓ Combate ${attackerUnitId.slice(0, 6)}→${defenderUnitId.slice(0, 6)}` : `✗ combate: ${res.error ?? ''}`)
    if (res.ok) { setSelectedUnitId(null); void fetchGame() }
  }

  const handleResolveDispute = async (disputeId: string) => {
    const res = await resolveDispute(gameId, disputeId)
    addLog(res.ok ? '✓ Disputa resolvida' : `✗ disputa: ${res.error ?? ''}`)
    if (res.ok) void fetchGame()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-slate-300 animate-spin" />
          <p className="text-slate-500 text-sm">Carregando partida…</p>
        </div>
      </div>
    )
  }

  if (error || !gameState) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-3">{error || 'Erro ao carregar partida.'}</p>
          <button onClick={onBack} className="text-slate-400 hover:text-slate-200 text-sm underline">
            Voltar
          </button>
        </div>
      </div>
    )
  }

  const isFinished = gameState.isFinished

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* ── Top bar ── */}
      <header className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 flex-shrink-0 flex-wrap">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-slate-200 transition-colors text-sm"
        >
          ← Lista
        </button>

        <span className="text-slate-600 font-mono text-xs">{gameId.slice(0, 8)}…</span>

        <span className="text-slate-500 text-xs">Turno {gameState.turnNumber}/{gameState.maxTurns}</span>

        <span className={`text-xs font-semibold ml-1 ${isMyTurn ? 'text-green-400' : 'text-slate-500'}`}>
          {isFinished
            ? `★ ${gameState.winner ? `Vencedor: ${gameState.winner.slice(0, 8)}` : 'Empate'}`
            : isMyTurn
              ? '● SUA VEZ'
              : `○ vez de ${gameState.currentPlayerId.slice(0, 8)}`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-slate-500 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={godMode}
              onChange={e => setGodMode(e.target.checked)}
              className="accent-slate-500"
            />
            God
          </label>
          <button
            onClick={() => void fetchGame()}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors text-sm"
            title="Atualizar"
          >
            ↺
          </button>
        </div>
      </header>

      {/* ── Player bar ── */}
      <div className="flex-shrink-0 border-b border-slate-800">
        <PlayerBar gameState={gameState} myEnginePlayerId={enginePlayerId} />
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0">
        {/* Hex map — fills remaining space */}
        <div className="relative flex-1 min-h-0 bg-slate-950">
          <HexMap
            gameState={gameState}
            myEnginePlayerId={enginePlayerId}
            selectedUnitId={selectedUnitId}
            godMode={godMode}
            onSelectUnit={setSelectedUnitId}
            onInitiateCombat={(atk, def) => { void handleInitiateCombat(atk, def) }}
            onCityClick={setSelectedCityId}
          />
        </div>

        {/* ActionSheet: desktop sidebar OR mobile bottom sheet */}
        <ActionSheet
          gameState={gameState}
          myEnginePlayerId={enginePlayerId}
          isMyTurn={isMyTurn}
          selectedUnitId={selectedUnitId}
          log={log}
          onEndTurn={() => { void handleEndTurn() }}
          onResolveDispute={(id) => { void handleResolveDispute(id) }}
        />
      </div>

      {/* ── City modal ── */}
      {selectedCityId && (() => {
        const city = gameState.cities.find(c => c.id === selectedCityId)
        return city ? (
          <CityModal
            city={city}
            gameState={gameState}
            myEnginePlayerId={enginePlayerId}
            onClose={() => setSelectedCityId(null)}
          />
        ) : null
      })()}

      {/* ── Game over screen ── */}
      {showGameOver && (
        <GameOverScreen
          gameState={gameState}
          myEnginePlayerId={enginePlayerId}
          xpGain={xpGain}
          onBack={onBack}
        />
      )}

      {/* ── Game over hint (when not showing full screen) ── */}
      {isFinished && !showGameOver && (
        <button
          onClick={() => setShowGameOver(true)}
          className="fixed bottom-24 md:bottom-4 right-4 z-20 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-700 transition-colors shadow-lg"
        >
          🏆 Ver resultado
        </button>
      )}
    </div>
  )
}
