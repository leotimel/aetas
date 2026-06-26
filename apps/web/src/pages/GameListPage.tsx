import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../supabase.ts'
import DailyCard from '../components/DailyCard.tsx'
import MapPreviewMini from '../components/MapPreviewMini.tsx'
import i18n from '../i18n.ts'
import {
  CIVILIZATIONS,
  MAP_SIZES,
  generateMap,
  xpToLevel,
  xpProgress,
  type MapSize,
} from '@aetas/game-engine'

interface GameRow {
  game_id: string
  engine_player_id: string
  games: {
    turn_number: number
    current_player_id: string
    is_finished: boolean
    winner_id: string | null
    max_turns: number
    updated_at: string
    seed: string | null
    map_size: string | null
  }
}

interface Props {
  userId: string
  onEnterGame: (gameId: string) => void
  onOpenProfile: () => void
  onNewGame: () => void
}

export default function GameListPage({ userId, onEnterGame, onOpenProfile, onNewGame }: Props) {
  const { t, i18n: i18nHook } = useTranslation()
  const [rows,         setRows]         = useState<GameRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [xp,           setXp]           = useState<number>(0)
  const [selectedCiv,  setSelectedCiv]  = useState<string>('romans')
  const [showFinished, setShowFinished] = useState(false)

  useEffect(() => {
    void supabase
      .from('profiles')
      .select('xp, selected_civ')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          const d = data as { xp: number; selected_civ: string }
          setXp(d.xp)
          setSelectedCiv(d.selected_civ ?? 'romans')
        }
      })
  }, [userId])

  const fetchGames = async () => {
    const { data } = await supabase
      .from('game_players')
      .select('game_id, engine_player_id, games(turn_number, current_player_id, is_finished, winner_id, max_turns, updated_at, seed, map_size)')
      .eq('user_id', userId)
      .eq('is_ai', false)
    setRows((data as GameRow[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => { void fetchGames() }, [userId])

  const myTurnGames   = rows.filter(r => !r.games.is_finished && r.games.current_player_id === r.engine_player_id)
  const activeGames   = rows.filter(r => !r.games.is_finished && r.games.current_player_id !== r.engine_player_id)
  const finishedGames = rows.filter(r => r.games.is_finished)

  const signOut = () => void supabase.auth.signOut()

  const toggleLang = () => {
    const next = i18nHook.language === 'en' ? 'pt' : 'en'
    void i18nHook.changeLanguage(next)
    localStorage.setItem('aetas-lang', next)
  }

  return (
    <div className="min-h-screen bg-aetas-bg text-aetas-text">
      {/* Header */}
      <header className="border-b border-aetas-border px-4 pt-3 pb-2 max-w-2xl mx-auto w-full bg-gradient-to-r from-aetas-gold/5 to-transparent">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CivAvatar civId={selectedCiv} onClick={onOpenProfile} />
            <h1 className="font-display text-xl font-semibold text-aetas-gold">Aetas</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="text-[10px] text-aetas-dim border border-aetas-border rounded px-1.5 py-0.5 hover:border-aetas-border-strong hover:text-aetas-text transition-colors"
            >
              EN | PT
            </button>
            <LevelBadge xp={xp} />
            <button
              onClick={() => void fetchGames()}
              className="p-2 rounded-lg text-aetas-dim hover:text-aetas-muted hover:bg-aetas-raised transition-colors"
              title={t('ui.refresh')}
            >↺</button>
            <button
              onClick={signOut}
              className="text-sm text-aetas-dim hover:text-red-400 transition-colors"
            >{t('ui.logout')}</button>
          </div>
        </div>
        <XpMiniBar xp={xp} />
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 pb-24 space-y-6">
        <DailyCard userId={userId} onEnterGame={onEnterGame} />

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-aetas-border border-t-aetas-muted animate-spin" />
          </div>
        ) : (
          <>
            {/* ── My Turn ── */}
            <Section label={t('list.myTurn')} count={myTurnGames.length}>
              {myTurnGames.length === 0 ? (
                <p className="text-aetas-dim text-sm py-2">
                  {t('list.empty')}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {myTurnGames.map(row => (
                    <GameCard
                      key={row.game_id}
                      row={row}
                      isMyTurn={true}
                      onEnter={() => onEnterGame(row.game_id)}
                    />
                  ))}
                </div>
              )}
            </Section>

            {/* ── Waiting for opponent (hidden if empty) ── */}
            {activeGames.length > 0 && (
              <Section label={t('list.waiting')} count={activeGames.length} dim>
                <div className="flex flex-col gap-2">
                  {activeGames.map(row => (
                    <GameCard
                      key={row.game_id}
                      row={row}
                      isMyTurn={false}
                      onEnter={() => onEnterGame(row.game_id)}
                    />
                  ))}
                </div>
              </Section>
            )}

            {/* ── Finished (toggle) ── */}
            {finishedGames.length > 0 && (
              <div>
                <button
                  onClick={() => setShowFinished(v => !v)}
                  className="text-xs text-aetas-dim hover:text-aetas-muted transition-colors"
                >
                  {showFinished
                    ? t('list.hideFinished')
                    : t('list.showFinished', { count: finishedGames.length })}
                </button>
                {showFinished && (
                  <div className="mt-3 flex flex-col gap-2">
                    {finishedGames.map(row => (
                      <GameCard
                        key={row.game_id}
                        row={row}
                        isMyTurn={false}
                        onEnter={() => onEnterGame(row.game_id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* FAB */}
      <div className="fixed bottom-6 right-4 left-4 max-w-2xl mx-auto flex justify-end">
        <button
          onClick={onNewGame}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-aetas-gold text-aetas-bg font-bold text-sm shadow-lg shadow-black/40 hover:bg-aetas-gold-light active:bg-aetas-gold-dark transition-colors"
        >
          {t('list.newGame')}
        </button>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function CivAvatar({ civId, onClick }: { civId: string; onClick: () => void }) {
  const { t } = useTranslation()
  const civ = CIVILIZATIONS.find(c => c.id === civId)
  return (
    <button
      onClick={onClick}
      title={t('profile.title')}
      className="w-8 h-8 rounded-full text-sm font-bold text-white flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80"
      style={{ backgroundColor: civ?.color ?? '#92400e' }}
    >
      {civ?.name[0] ?? 'A'}
    </button>
  )
}

function Section({ label, count, dim, children }: {
  label: string
  count: number
  dim?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={dim ? 'opacity-70' : ''}>
      <div className="flex items-center gap-2 border-l-2 border-aetas-gold pl-3 mb-3">
        <p className="text-xs uppercase tracking-wider text-aetas-dim font-semibold">{label}</p>
        {count > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-aetas-gold text-aetas-bg font-semibold">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function GameCard({ row, isMyTurn, onEnter }: { row: GameRow; isMyTurn: boolean; onEnter: () => void }) {
  const { t } = useTranslation()
  const { games: g } = row
  const shortId    = row.game_id.slice(0, 8)
  const updatedAgo = relativeTime(g.updated_at)
  const isUrgent   = isMyTurn && g.turn_number > g.max_turns * 0.8
  const turnPct    = Math.min(100, Math.round((g.turn_number / g.max_turns) * 100))
  const iWon       = g.is_finished && g.winner_id === row.engine_player_id

  const gameMap = useMemo(() => {
    if (!g.seed) return null
    return generateMap(MAP_SIZES[(g.map_size as MapSize) ?? 'medium'], g.seed, 2)
  }, [g.seed, g.map_size])

  return (
    <div className={`relative bg-aetas-surface border rounded-lg p-3 transition-colors ${
      isMyTurn
        ? 'border-aetas-gold/40 hover:border-aetas-gold/70'
        : 'border-aetas-border hover:border-aetas-border-strong'
    }`}>
      {/* Left border accent */}
      {isMyTurn && (
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-emerald-500/60 ${isUrgent ? 'animate-pulse' : ''}`} />
      )}

      <div className="flex gap-3 items-start pl-1">
        {/* Map thumbnail 64×52 */}
        <div className="flex-shrink-0 rounded-lg overflow-hidden">
          {gameMap ? (
            <MapPreviewMini tiles={gameMap.tiles} radius={gameMap.radius} width={64} height={52} />
          ) : (
            <div
              className="rounded-lg"
              style={{
                width: 64,
                height: 52,
                background: 'repeating-linear-gradient(45deg, var(--color-aetas-raised) 0px, var(--color-aetas-panel) 4px, var(--color-aetas-raised) 8px)',
              }}
            />
          )}
        </div>

        {/* Info column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-aetas-muted font-mono text-xs font-medium">{shortId}…</span>
            <span className="text-aetas-dim text-xs flex-shrink-0">{updatedAgo}</span>
          </div>

          <div className="text-xs text-aetas-dim">
            {t('game.turnStatus', { n: g.turn_number, max: g.max_turns })}
            {g.is_finished && (
              iWon
                ? <span className="ml-2 text-amber-400">{t('list.youWon')}</span>
                : g.winner_id
                  ? <span className="ml-2">{t('list.defeat')}</span>
                  : null
            )}
          </div>

          {/* Turn progress bar */}
          <div className="mt-1.5 h-0.5 bg-aetas-raised rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${isMyTurn ? 'bg-aetas-gold' : 'bg-aetas-muted/40'}`}
              style={{ width: `${turnPct}%` }}
            />
          </div>

          {!g.is_finished && (
            <button
              onClick={onEnter}
              className={`mt-2 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                isMyTurn
                  ? 'bg-aetas-gold text-aetas-bg hover:brightness-110'
                  : 'bg-aetas-raised text-aetas-muted hover:bg-aetas-panel'
              }`}
            >
              {isMyTurn ? t('list.play') : t('list.view')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function LevelBadge({ xp }: { xp: number }) {
  const level = xpToLevel(xp)
  return (
    <span className="flex items-center gap-1">
      <span className="w-5 h-5 rounded-md bg-aetas-gold/20 border border-aetas-gold/40 flex items-center justify-center text-xs font-bold text-aetas-gold">{level}</span>
      <span className="text-aetas-muted text-xs hidden sm:inline">{xp} XP</span>
    </span>
  )
}

function XpMiniBar({ xp }: { xp: number }) {
  const [progress, range] = xpProgress(xp)
  const isMax = range === 0
  const pct   = isMax ? 100 : Math.round((progress / range) * 100)
  return (
    <div className="mt-2 h-1 bg-aetas-raised rounded-full overflow-hidden">
      <div
        className="h-full bg-aetas-gold/60 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso)
  const m = Math.floor(diff / 60_000)
  if (m < 1) return i18n.t('list.justNow')
  if (m < 60) return i18n.t('list.minutesAgo', { m })
  const h = Math.floor(m / 60)
  if (h < 24) return i18n.t('list.hoursAgo', { h })
  return i18n.t('list.daysAgo', { d: Math.floor(h / 24) })
}
