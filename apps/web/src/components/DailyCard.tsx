import { useEffect, useState } from 'react'
import type { GameState } from '@aetas/game-engine'
import { rankPlayers } from '@aetas/game-engine'
import { supabase } from '../supabase.ts'
import { createDailyGame } from '../api.ts'

interface DailyGame {
  gameId: string
  isFinished: boolean
  turnNumber: number
  maxTurns: number
  winnerId: string | null
  enginePlayerId: string
}

interface Props {
  userId: string
  onEnterGame: (gameId: string) => void
}

export default function DailyCard({ userId, onEnterGame }: Props) {
  const today = todayUTC()
  const [daily, setDaily] = useState<DailyGame | null | 'none'>('none')
  const [finalScore, setFinalScore] = useState<ReturnType<typeof rankPlayers>[0] | null>(null)
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [countdown, setCountdown] = useState('')

  // Countdown to next UTC midnight
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
      const ms = next.getTime() - now.getTime()
      const h = Math.floor(ms / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      const s = Math.floor((ms % 60_000) / 1000)
      setCountdown(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Check if user already has today's daily game
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('game_players')
        .select('game_id, engine_player_id, games!inner(is_daily, daily_date, is_finished, winner_id, turn_number, max_turns)')
        .eq('user_id', userId)
        .eq('is_ai', false)
        .eq('games.is_daily', true)
        .eq('games.daily_date', today)
        .limit(1)
        .single()

      if (!data) { setDaily(null); return }

      const g = data.games as {
        is_finished: boolean; winner_id: string | null;
        turn_number: number; max_turns: number
      }
      const row: DailyGame = {
        gameId: data.game_id,
        enginePlayerId: data.engine_player_id as string,
        isFinished: g.is_finished,
        winnerId: g.winner_id,
        turnNumber: g.turn_number,
        maxTurns: g.max_turns,
      }
      setDaily(row)

      // If finished, fetch game_state for final score
      if (g.is_finished) {
        const { data: gs } = await supabase
          .from('games')
          .select('game_state')
          .eq('id', data.game_id)
          .single()
        if (gs) {
          const state = gs.game_state as GameState
          const ranked = rankPlayers(state)
          const mine = ranked.find(s => s.playerId === data.engine_player_id)
          setFinalScore(mine ?? null)
        }
      }
    })()
  }, [userId, today])

  const handleStart = async () => {
    setStarting(true)
    const res = await createDailyGame()
    setStarting(false)
    if (res.ok && res.data) {
      onEnterGame(res.data.gameId)
    }
  }

  const handleShare = () => {
    if (!daily || daily === 'none' || !finalScore) return
    const text = buildShareText(today, daily, finalScore)
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Loading
  if (daily === 'none') {
    return (
      <div className="bg-aetas-surface border border-aetas-border rounded-2xl p-4 mb-4 animate-pulse">
        <div className="h-4 bg-aetas-raised rounded w-1/3 mb-2" />
        <div className="h-3 bg-aetas-raised rounded w-1/2" />
      </div>
    )
  }

  const isWon = daily && daily !== 'none' && daily.isFinished && daily.winnerId === daily.enginePlayerId
  const isLost = daily && daily !== 'none' && daily.isFinished && daily.winnerId !== daily.enginePlayerId

  return (
    <div className={`border rounded-2xl p-4 mb-4 ${
      !daily ? 'bg-aetas-surface border-aetas-border-strong'
      : daily.isFinished
        ? isWon ? 'bg-amber-950/40 border-amber-800/60' : 'bg-aetas-surface border-aetas-border-strong'
        : 'bg-aetas-gold/5 border-aetas-gold/30'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{daily && daily !== 'none' && daily.isFinished ? (isWon ? '🏆' : '🎮') : '🗓️'}</span>
            <h2 className="text-aetas-text font-semibold text-sm">Desafio Diário</h2>
            <span className="text-aetas-dim text-xs font-mono">{formatDateLabel(today)}</span>
          </div>
          <p className="text-aetas-dim text-xs mt-0.5">
            Mesmo mapa para todos · Reinicia em <span className="text-aetas-muted font-mono">{countdown}</span>
          </p>
        </div>

        {/* Status badge */}
        {daily && daily !== 'none' && (
          <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 font-medium ${
            daily.isFinished
              ? isWon ? 'bg-amber-900/60 text-amber-300' : 'bg-aetas-raised text-aetas-muted'
              : 'bg-aetas-gold/20 text-aetas-gold'
          }`}>
            {daily.isFinished ? (isWon ? 'Vitória' : isLost ? 'Derrota' : 'Empate') : `Turno ${daily.turnNumber}/${daily.maxTurns}`}
          </span>
        )}
      </div>

      {/* Score (when finished) */}
      {daily && daily !== 'none' && daily.isFinished && finalScore && (
        <div className="mt-3 flex items-center gap-4 bg-aetas-raised/60 rounded-xl px-3 py-2">
          <ScorePill icon="🏙️" label="Terr." value={finalScore.territory} />
          <ScorePill icon="👥" label="Pop." value={finalScore.population} />
          <ScorePill icon="🔬" label="Dev." value={finalScore.development} />
          <div className="ml-auto text-right">
            <p className="text-aetas-gold font-bold text-base">{finalScore.total}</p>
            <p className="text-aetas-dim text-xs">pts</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-3">
        {!daily ? (
          <button
            onClick={() => void handleStart()}
            disabled={starting}
            className="flex-1 py-2.5 rounded-xl bg-aetas-gold text-aetas-bg text-sm font-bold hover:bg-aetas-gold-light disabled:opacity-60 transition-colors"
          >
            {starting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-aetas-bg/60 border-t-aetas-bg rounded-full animate-spin" />
                Criando…
              </span>
            ) : 'Jogar Desafio →'}
          </button>
        ) : (
          <>
            {!daily.isFinished && (
              <button
                onClick={() => onEnterGame((daily as DailyGame).gameId)}
                className="flex-1 py-2.5 rounded-xl bg-aetas-gold text-aetas-bg text-sm font-bold hover:bg-aetas-gold-light transition-colors"
              >
                Continuar →
              </button>
            )}
            {daily.isFinished && (
              <button
                onClick={handleShare}
                className="flex-1 py-2.5 rounded-xl bg-aetas-raised text-aetas-muted text-sm font-semibold hover:bg-aetas-panel transition-colors"
              >
                {copied ? '✓ Copiado!' : '📋 Compartilhar'}
              </button>
            )}
            {daily.isFinished && (
              <button
                onClick={() => onEnterGame((daily as DailyGame).gameId)}
                className="px-4 py-2.5 rounded-xl bg-aetas-raised text-aetas-muted text-sm hover:bg-aetas-panel transition-colors"
              >
                Ver →
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ScorePill({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm">{icon}</span>
      <div>
        <p className="text-aetas-text text-xs font-semibold">{value}</p>
        <p className="text-aetas-dim text-xs">{label}</p>
      </div>
    </div>
  )
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${d} ${months[(m ?? 1) - 1]} ${y}`
}

function buildShareText(
  today: string,
  daily: DailyGame,
  score: ReturnType<typeof rankPlayers>[0],
): string {
  const label = formatDateLabel(today)
  const isWon = daily.winnerId === daily.enginePlayerId
  const result = isWon ? '🏆 Vitória' : daily.winnerId ? '❌ Derrota' : '🤝 Empate'

  const lines = [
    `Aetas Daily — ${label}`,
    `${result} | ${score.total} pts`,
    `🏙️ ${score.territory}  👥 ${score.population}  🔬 ${score.development}`,
    `(Turno ${daily.turnNumber}/${daily.maxTurns})`,
  ]

  return lines.join('\n')
}
