import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

function formatDateLabel(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en-US', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(iso + 'T12:00:00Z'))
}

function buildShareText(
  today: string,
  daily: DailyGame,
  score: ReturnType<typeof rankPlayers>[0],
  t: (key: string, opts?: Record<string, unknown>) => string,
  lang: string,
): string {
  const label = formatDateLabel(today, lang)
  const isWon = daily.winnerId === daily.enginePlayerId
  const result = isWon ? t('daily.resultWon') : daily.winnerId ? t('daily.resultLost') : t('daily.resultDraw')
  const turnStatus = t('game.turnStatus', { n: daily.turnNumber, max: daily.maxTurns })
  const lines = [
    `Aetas Daily — ${label}`,
    `${result} | ${score.total} pts`,
    `🏙️ ${score.territory}  👥 ${score.population}  🔬 ${score.development}`,
    `(${turnStatus})`,
  ]
  return lines.join('\n')
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function DailyCard({ userId, onEnterGame }: Props) {
  const { t, i18n } = useTranslation()
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

      const g = data.games as unknown as {
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
    const text = buildShareText(today, daily, finalScore, t as (key: string, opts?: Record<string, unknown>) => string, i18n.language)
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Loading
  if (daily === 'none') {
    return (
      <div className="bg-aetas-surface rounded-sm p-4 mb-4 animate-pulse"
        style={{ border: '1px solid var(--color-aetas-border)', borderTop: '3px solid var(--color-aetas-parchment)' }}>
        <div className="h-4 bg-aetas-raised rounded-sm w-1/3 mb-2" />
        <div className="h-3 bg-aetas-raised rounded-sm w-1/2" />
      </div>
    )
  }

  const isWon = !!daily && daily.isFinished && daily.winnerId === daily.enginePlayerId
  const isLost = !!daily && daily.isFinished && daily.winnerId !== daily.enginePlayerId

  const statusLabel = !daily ? null
    : daily.isFinished
      ? isWon ? t('daily.victory') : isLost ? t('daily.defeat') : t('daily.draw')
      : t('game.turnStatus', { n: daily.turnNumber, max: daily.maxTurns })

  return (
    <div
      className={`relative min-h-28 rounded-sm p-4 mb-4 ${
        isWon ? 'bg-amber-950/40' : 'bg-gradient-to-br from-aetas-surface to-aetas-raised'
      }`}
      style={{
        border: '1px solid var(--color-aetas-border)',
        outline: '1px solid rgba(201,168,76,0.12)',
        outlineOffset: '-3px',
        borderTop: '3px solid var(--color-aetas-parchment)',
      }}
    >
      {/* Victory badge */}
      {isWon && (
        <div className="absolute -top-px right-4 z-10" style={{ transform: 'rotate(-2deg)' }}>
          <span className="font-display text-[9px] font-semibold text-white uppercase tracking-wider px-2 py-0.5 bg-aetas-red rounded-none">
            Victory
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {daily && daily.isFinished ? (
              isWon ? (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--color-aetas-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 2h8v6a4 4 0 0 1-8 0V2z" /><path d="M5 4H3a2 2 0 0 0 0 4h2" /><path d="M13 4h2a2 2 0 0 0 0 4h-2" /><line x1="9" y1="12" x2="9" y2="15" /><line x1="6" y1="15" x2="12" y2="15" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--color-aetas-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="12" height="12" rx="1" /><line x1="9" y1="6" x2="9" y2="9" /><circle cx="9" cy="12" r="0.5" fill="var(--color-aetas-muted)" />
                </svg>
              )
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--color-aetas-gold)" strokeWidth="1.5" strokeLinecap="round">
                <rect x="2" y="3" width="14" height="13" rx="1" /><line x1="6" y1="1" x2="6" y2="5" /><line x1="12" y1="1" x2="12" y2="5" /><line x1="2" y1="8" x2="16" y2="8" />
              </svg>
            )}
            <h2 className="text-aetas-text font-semibold text-sm">{t('daily.title')}</h2>
            <span className="text-aetas-dim text-xs font-mono">{formatDateLabel(today, i18n.language)}</span>
            {!!daily && typeof daily !== 'string' && (
              <span className="text-emerald-400 text-xs font-medium">{t('daily.played')}</span>
            )}
          </div>
          <p className="text-aetas-dim text-xs mt-0.5">
            {t('daily.desc', { countdown })}
          </p>
        </div>

        {/* Status badge */}
        {daily && (
          <span className={`text-xs px-2 py-1 rounded-sm flex-shrink-0 font-medium ${
            daily.isFinished
              ? isWon ? 'bg-amber-900/60 text-amber-300' : 'bg-aetas-raised text-aetas-muted'
              : 'bg-aetas-gold/20 text-aetas-gold'
          }`}>
            {statusLabel}
          </span>
        )}
      </div>

      {/* Score (when finished) */}
      {daily && daily.isFinished && finalScore && (
        <div className="mt-3 flex items-center gap-4 bg-aetas-raised/60 rounded-sm px-3 py-2">
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
            className="flex-1 py-2.5 rounded-sm bg-aetas-gold text-aetas-bg text-sm font-bold hover:bg-aetas-gold-light disabled:opacity-60 transition-colors"
          >
            {starting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-aetas-bg/60 border-t-aetas-bg rounded-full animate-spin" />
                {t('daily.creating')}
              </span>
            ) : t('daily.play')}
          </button>
        ) : (
          <>
            {!daily.isFinished && (
              <button
                onClick={() => onEnterGame((daily as DailyGame).gameId)}
                className="flex-1 py-2.5 rounded-sm bg-aetas-gold text-aetas-bg text-sm font-bold hover:bg-aetas-gold-light transition-colors"
              >
                {t('daily.continue')}
              </button>
            )}
            {daily.isFinished && (
              <button
                onClick={handleShare}
                className="flex-1 py-2.5 rounded-sm bg-aetas-raised text-aetas-muted text-sm font-semibold hover:bg-aetas-panel transition-colors"
              >
                {copied ? t('daily.shareCopied') : t('daily.share')}
              </button>
            )}
            {daily.isFinished && (
              <button
                onClick={() => onEnterGame((daily as DailyGame).gameId)}
                className="px-4 py-2.5 rounded-sm bg-aetas-raised text-aetas-muted text-sm hover:bg-aetas-panel transition-colors"
              >
                {t('daily.view')}
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
