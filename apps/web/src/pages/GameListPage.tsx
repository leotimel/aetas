import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../supabase.ts'
import DailyCard from '../components/DailyCard.tsx'
import MapPreviewMini from '../components/MapPreviewMini.tsx'
import { AetasLogo } from '../components/ui/AetasLogo'
import { RomanDivider } from '../components/ui/RomanDivider'
import { SealButton } from '../components/ui/SealButton'
import i18n from '../i18n.ts'
import {
  CIVILIZATIONS,
  MAP_SIZES,
  generateMap,
  xpToLevel,
  xpProgress,
  type MapSize,
} from '@aetas/game-engine'

interface GamePlayer {
  id: string
  displayName: string
  civilizationId: string
  isAIControlled: boolean
}

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
    game_state: { players: GamePlayer[] } | null
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
  const [showFinished, setShowFinished] = useState(false)

  useEffect(() => {
    void supabase
      .from('profiles')
      .select('xp')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          const d = data as { xp: number }
          setXp(d.xp)
        }
      })
  }, [userId])

  const fetchGames = async () => {
    const { data } = await supabase
      .from('game_players')
      .select('game_id, engine_player_id, games(turn_number, current_player_id, is_finished, winner_id, max_turns, updated_at, seed, map_size, game_state)')
      .eq('user_id', userId)
      .eq('is_ai', false)
    setRows((data as GameRow[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => { void fetchGames() }, [userId])

  const myTurnGames   = rows.filter(r => !r.games.is_finished && r.games.current_player_id === r.engine_player_id)
  const activeGames   = rows.filter(r => !r.games.is_finished && r.games.current_player_id !== r.engine_player_id)
  const finishedGames = rows.filter(r => r.games.is_finished)

  const handleAbandoned = (gameId: string) => setRows(prev => prev.filter(r => r.game_id !== gameId))

  const signOut = () => void supabase.auth.signOut()

  const toggleLang = () => {
    const next = i18nHook.language === 'en' ? 'pt' : 'en'
    void i18nHook.changeLanguage(next)
    localStorage.setItem('aetas-lang', next)
  }

  return (
    <div className="min-h-screen bg-aetas-bg text-aetas-text relative">
      {/* Roman scene background image */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <img
          src="/assets/menu-bg.webp"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-bottom"
          style={{ opacity: 0.18 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-aetas-bg via-aetas-bg/70 to-aetas-bg/30" />
      </div>

      {/* Header */}
      <header className="border-b border-aetas-gold/20 px-4 pt-3 pb-2 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            title={t('profile.title')}
          >
            <AetasLogo size={36} />
            <span className="font-display text-2xl font-semibold text-aetas-gold tracking-widest">AETAS</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="h-10 px-3 flex items-center text-[10px] text-aetas-dim border border-aetas-border rounded hover:border-aetas-border-strong hover:text-aetas-text transition-colors"
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
      <div className="max-w-2xl mx-auto w-full h-px bg-gradient-to-r from-transparent via-aetas-gold/30 to-transparent" />

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
                      players={row.games.game_state?.players ?? []}
                      onEnter={() => onEnterGame(row.game_id)}
                      onAbandoned={handleAbandoned}
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
                      players={row.games.game_state?.players ?? []}
                      onEnter={() => onEnterGame(row.game_id)}
                      onAbandoned={handleAbandoned}
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
                        players={row.games.game_state?.players ?? []}
                        onEnter={() => onEnterGame(row.game_id)}
                        onAbandoned={handleAbandoned}
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
      <div className="fixed bottom-6 right-6 z-30">
        <SealButton variant="gold" size="lg" onClick={onNewGame}>
          <span className="font-display text-center leading-tight text-xs">+<br />New<br />Game</span>
        </SealButton>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Section({ label, count, dim, children }: {
  label: string
  count: number
  dim?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={dim ? 'opacity-70' : ''}>
      <div className="mb-3">
        <RomanDivider className="mb-2" />
        <div className="flex items-center gap-2 px-1">
          <span className="font-display text-xs uppercase tracking-widest text-aetas-gold/80">
            {label}
          </span>
          {count > 0 && (
            <SealButton variant="gold" size="sm" className="pointer-events-none cursor-default text-[10px]">
              {count}
            </SealButton>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

function buildOpponentLabel(players: GamePlayer[], selfId: string): string {
  const opponents = players.filter(p => p.id !== selfId)
  if (opponents.length === 0) return ''

  // Detect duplicate civilizationIds to add a numeric suffix
  const civCounts: Record<string, number> = {}
  const civSeen:   Record<string, number> = {}
  for (const p of opponents) {
    civCounts[p.civilizationId] = (civCounts[p.civilizationId] ?? 0) + 1
  }

  const names = opponents.map(p => {
    const civ   = CIVILIZATIONS.find(c => c.id === p.civilizationId)
    const civName = civ?.name ?? p.civilizationId

    // Fallback when displayName is still a UUID (old games without D2)
    const isUuid = /^[0-9a-f-]{36}$/.test(p.displayName)
    const base = isUuid ? civName : p.displayName

    if ((civCounts[p.civilizationId] ?? 0) > 1) {
      civSeen[p.civilizationId] = (civSeen[p.civilizationId] ?? 0) + 1
      return `${base} ${civSeen[p.civilizationId]}`
    }
    return p.isAIControlled ? `${base} (AI)` : base
  })

  const label = `vs ${names.join(' · ')}`
  return label.length > 36 ? label.slice(0, 35) + '…' : label
}

function GameCard({ row, isMyTurn, players, onEnter, onAbandoned }: {
  row: GameRow
  isMyTurn: boolean
  players: GamePlayer[]
  onEnter: () => void
  onAbandoned: (gameId: string) => void
}) {
  const { t } = useTranslation()
  const { games: g } = row
  const updatedAgo  = relativeTime(g.updated_at)
  const isUrgent    = isMyTurn && g.turn_number > g.max_turns * 0.8
  const turnPct     = Math.min(100, Math.round((g.turn_number / g.max_turns) * 100))
  const iWon        = g.is_finished && g.winner_id === row.engine_player_id
  const opponentLabel = buildOpponentLabel(players, row.engine_player_id)
  const myPlayer    = players.find(p => p.id === row.engine_player_id)
  const myCivColor  = CIVILIZATIONS.find(c => c.id === myPlayer?.civilizationId)?.color ?? '#c9a84c'
  const isMultiplayer = players.filter(p => !p.isAIControlled).length >= 2

  const [showConfirm, setShowConfirm] = useState(false)
  const [abandoning,  setAbandoning]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const handleAbandon = async () => {
    setAbandoning(true); setError(null)
    const { error: fnError } = await supabase.functions.invoke('abandon-game', { body: { gameId: row.game_id } })
    if (fnError) { setError(fnError.message ?? 'Erro ao abandonar'); setAbandoning(false) }
    else { setShowConfirm(false); onAbandoned(row.game_id) }
  }

  const gameMap = useMemo(() => {
    if (!g.seed) return null
    return generateMap(MAP_SIZES[(g.map_size as MapSize) ?? 'medium'], g.seed, 2)
  }, [g.seed, g.map_size])

  return (
    <>
    <div
      className="relative bg-aetas-surface rounded-sm p-3 transition-colors"
      style={{
        border: '1px solid var(--color-aetas-border)',
        outline: isMyTurn ? '1px solid rgba(201,168,76,0.25)' : '1px solid rgba(201,168,76,0.10)',
        outlineOffset: '-3px',
      }}
    >
      {/* Left border accent */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${isUrgent ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: myCivColor }}
      />
      {isMyTurn && (
        <span className="absolute -top-2 left-3 px-1.5 py-0.5 rounded-sm bg-aetas-gold text-aetas-bg text-[10px] font-bold leading-none">
          {t('list.play')}
        </span>
      )}

      <div className="flex gap-3 items-start pl-1">
        {/* Map thumbnail — hexagonal clip-path */}
        <div
          className="flex-shrink-0 overflow-hidden"
          style={{
            clipPath: 'polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)',
            width: 52,
            height: 60,
          }}
        >
          {gameMap ? (
            <MapPreviewMini tiles={gameMap.tiles} radius={gameMap.radius} width={52} height={60} />
          ) : (
            <div
              style={{
                width: 52,
                height: 60,
                background: 'repeating-linear-gradient(45deg, var(--color-aetas-raised) 0px, var(--color-aetas-panel) 4px, var(--color-aetas-raised) 8px)',
              }}
            />
          )}
        </div>

        {/* Info column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-aetas-muted text-xs font-medium truncate">
              {opponentLabel || row.game_id.slice(0, 8) + '…'}
            </span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-aetas-muted text-xs">{updatedAgo}</span>
              {!g.is_finished && (
                <button
                  onClick={e => { e.stopPropagation(); setShowConfirm(true) }}
                  className="text-aetas-border-strong hover:text-aetas-muted text-sm px-1 leading-none"
                  title={t('list.abandon')}
                >⋯</button>
              )}
            </div>
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
          <div className="mt-1.5 h-1 bg-aetas-raised rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${turnPct}%`, backgroundColor: isMyTurn ? myCivColor : 'rgba(100,110,120,0.4)' }}
            />
          </div>

          {!g.is_finished && (
            isMyTurn ? (
              <button
                onClick={onEnter}
                className="mt-2 px-3 py-1.5 rounded-sm bg-aetas-gold text-aetas-bg text-xs font-semibold hover:brightness-110 transition-colors"
              >
                Play →
              </button>
            ) : (
              <button
                onClick={onEnter}
                className="mt-2 px-3 py-1 rounded-sm text-xs font-semibold bg-aetas-raised text-aetas-muted hover:bg-aetas-panel transition-colors"
              >
                {t('list.view')}
              </button>
            )
          )}
        </div>
      </div>
    </div>

    {showConfirm && (
      <div
        className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        onClick={() => { if (!abandoning) setShowConfirm(false) }}
      >
        <div
          className="bg-aetas-surface border border-aetas-border rounded-xl p-5 max-w-sm w-full"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-aetas-text text-sm mb-1 font-semibold">{t('list.abandon')}</p>
          <p className="text-aetas-muted text-xs mb-4">
            {isMultiplayer ? t('list.abandonConfirmMulti') : t('list.abandonConfirmSolo')}
          </p>
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setShowConfirm(false); setError(null) }}
              disabled={abandoning}
              className="flex-1 py-2 rounded-lg border border-aetas-border text-aetas-muted text-sm hover:bg-aetas-raised transition-colors disabled:opacity-50"
            >
              {t('list.abandonCancel')}
            </button>
            <button
              onClick={handleAbandon}
              disabled={abandoning}
              className="flex-1 py-2 rounded-lg bg-red-900/50 border border-red-800/50 text-red-300 text-sm hover:bg-red-900/70 transition-colors disabled:opacity-50"
            >
              {abandoning ? '…' : t('list.abandonConfirmBtn')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
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

