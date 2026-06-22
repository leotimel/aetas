import { useState, useEffect, useCallback, useRef } from 'react'
import type { GameState, HexCoord } from '@aetas/game-engine'
import { BuildingType, UnitType, CIVILIZATIONS, UNIT_CATALOG, SPECIAL_UNIT_CATALOG, BUILDING_CATALOG } from '@aetas/game-engine'
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

function civName(players: GameState['players'] | null | undefined, playerId: string): string {
  if (!players) return playerId.slice(0, 6)
  const player = players.find(p => p.id === playerId)
  return CIVILIZATIONS.find(c => c.id === player?.civilizationId)?.name ?? playerId.slice(0, 6)
}

function unitLabel(unitType: string): string {
  const def = UNIT_CATALOG.get(unitType as UnitType) ?? SPECIAL_UNIT_CATALOG.get(unitType)
  return def?.name ?? unitType
}

function buildingLabel(buildingType: BuildingType): string {
  return BUILDING_CATALOG.get(buildingType)?.name ?? buildingType
}

function errorLabel(err?: string | null): string {
  if (!err) return 'ação inválida'
  const known: Record<string, string> = {
    'unit has already attacked this turn': 'unidade já atacou neste turno',
    'unit has already moved this turn': 'unidade já se moveu neste turno',
    'city hex occupied': 'hex da cidade ocupado',
    'insufficient production': 'produção insuficiente',
    'target is not adjacent': 'alvo não é adjacente',
    'cannot move to water': 'não é possível mover para água',
    'target hex is occupied': 'hex alvo está ocupado',
    'target out of movement range': 'alvo fora do alcance de movimento',
    'unit is not yours': 'unidade não é sua',
    'unit is already there': 'unidade já está neste hex',
    'not your city': 'não é sua cidade',
    'city not found': 'cidade não encontrada',
    'unit not found': 'unidade não encontrada',
    'dispute already resolved': 'disputa já resolvida',
    'unit not available in this era': 'unidade não disponível nesta era',
    'building already constructed': 'edifício já construído',
    'construction already in progress': 'construção em andamento',
  }
  return known[err] ?? err
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

  const gameStateRef = useRef<GameState | null>(null)
  useEffect(() => { gameStateRef.current = gameState }, [gameState])

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
        const players = gameStateRef.current?.players
        const isMe = p.currentPlayerId === enginePlayerId
        const name = civName(players, p.currentPlayerId)
        addLog(isMe ? `Turno ${p.turnNumber} — sua vez!` : `Turno ${p.turnNumber} — vez de ${name}`)
        void fetchGame()
      })
      .on('broadcast', { event: 'dispute_resolved' }, () => {
        addLog('Resultado de combate disponível')
        void fetchGame()
      })
      .on('broadcast', { event: 'game_over' }, (msg) => {
        const p = msg.payload as { winnerId: string | null }
        const players = gameStateRef.current?.players
        addLog(p.winnerId ? `★ ${civName(players, p.winnerId)} venceu a partida!` : '★ Fim de partida — empate!')
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
    addLog(res.ok ? 'Turno encerrado' : `✗ ${errorLabel(res.error)}`)
    if (res.ok) { setSelectedUnitId(null); void fetchGame() }
  }

  const handleInitiateCombat = async (attackerUnitId: string, defenderUnitId: string) => {
    const res = await submitAction(gameId, { type: 'initiateCombat', attackerUnitId, defenderUnitId })
    addLog(res.ok ? 'Combate iniciado' : `✗ ${errorLabel(res.error)}`)
    if (res.ok) { setSelectedUnitId(null); void fetchGame() }
  }

  const handleResolveDispute = async (disputeId: string) => {
    const res = await resolveDispute(gameId, disputeId)
    addLog(res.ok ? 'Combate resolvido' : `✗ ${errorLabel(res.error)}`)
    if (res.ok) void fetchGame()
  }

  const handleConstructBuilding = async (cityId: string, buildingType: BuildingType) => {
    const res = await submitAction(gameId, { type: 'constructBuilding', cityId, buildingType })
    addLog(res.ok ? `${buildingLabel(buildingType)} em construção` : `✗ ${errorLabel(res.error)}`)
    if (res.ok) void fetchGame()
  }

  const handleMoveUnit = async (unitId: string, targetCoord: HexCoord) => {
    const res = await submitAction(gameId, { type: 'moveUnit', unitId, targetCoord })
    addLog(res.ok ? 'Unidade movida' : `✗ ${errorLabel(res.error)}`)
    if (res.ok) { setSelectedUnitId(null); void fetchGame() }
  }

  const handleTrainUnit = async (cityId: string, unitType: string) => {
    const unitId = crypto.randomUUID()
    const res = await submitAction(gameId, { type: 'trainUnit', cityId, unitType, unitId })
    addLog(res.ok ? `${unitLabel(unitType)} em treinamento` : `✗ ${errorLabel(res.error)}`)
    if (res.ok) void fetchGame()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-aetas-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-aetas-border border-t-aetas-muted animate-spin" />
          <p className="text-aetas-dim text-sm">Carregando partida…</p>
        </div>
      </div>
    )
  }

  if (error || !gameState) {
    return (
      <div className="min-h-screen bg-aetas-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-3">{error || 'Erro ao carregar partida.'}</p>
          <button onClick={onBack} className="text-aetas-muted hover:text-aetas-text text-sm underline">
            Voltar
          </button>
        </div>
      </div>
    )
  }

  const isFinished = gameState.isFinished

  return (
    <div className="flex flex-col h-screen bg-aetas-bg text-aetas-text overflow-hidden">
      {/* ── Top bar ── */}
      <header className="flex items-center gap-2 px-3 py-2 bg-aetas-surface border-b border-aetas-border flex-shrink-0 flex-wrap">
        <button
          onClick={onBack}
          className="text-aetas-muted hover:text-aetas-text transition-colors text-sm"
        >
          ← Lista
        </button>

        <span className="text-aetas-dim font-mono text-xs">{gameId.slice(0, 8)}…</span>

        <span className="text-aetas-dim text-xs">Turno {gameState.turnNumber}/{gameState.maxTurns}</span>

        <span className={`text-xs font-semibold ml-1 ${isMyTurn ? 'text-aetas-gold' : 'text-aetas-dim'}`}>
          {isFinished
            ? `★ ${gameState.winner ? `${civName(gameState.players, gameState.winner)} venceu` : 'Empate'}`
            : isMyTurn
              ? '● SUA VEZ'
              : `○ vez de ${civName(gameState.players, gameState.currentPlayerId)}`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {import.meta.env.DEV && (
            <label className="flex items-center gap-1.5 text-aetas-dim text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={godMode}
                onChange={e => setGodMode(e.target.checked)}
                className="accent-aetas-gold"
              />
              God
            </label>
          )}
          <button
            onClick={() => void fetchGame()}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-aetas-raised text-aetas-muted hover:text-aetas-text transition-colors text-sm"
            title="Atualizar"
          >
            ↺
          </button>
        </div>
      </header>

      {/* ── Player bar ── */}
      <div className="flex-shrink-0 border-b border-aetas-border">
        <PlayerBar gameState={gameState} myEnginePlayerId={enginePlayerId} />
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0">
        {/* Hex map — fills remaining space */}
        <div className="relative flex-1 min-h-0 bg-aetas-bg">
          <HexMap
            gameState={gameState}
            myEnginePlayerId={enginePlayerId}
            selectedUnitId={selectedUnitId}
            godMode={godMode}
            onSelectUnit={setSelectedUnitId}
            onInitiateCombat={(atk, def) => { void handleInitiateCombat(atk, def) }}
            onCityClick={setSelectedCityId}
            onMoveUnit={(id, coord) => { void handleMoveUnit(id, coord) }}
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
          onInitiateCombat={(atk, def) => { void handleInitiateCombat(atk, def) }}
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
            onConstructBuilding={(c, b) => { void handleConstructBuilding(c, b) }}
            onTrainUnit={(c, u) => { void handleTrainUnit(c, u) }}
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
          className="fixed bottom-24 md:bottom-4 right-4 z-20 px-4 py-2 rounded-xl bg-aetas-surface border border-aetas-border-strong text-aetas-muted text-sm font-medium hover:bg-aetas-raised transition-colors shadow-lg"
        >
          🏆 Ver resultado
        </button>
      )}
    </div>
  )
}
