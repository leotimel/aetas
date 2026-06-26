import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../supabase.ts'
import {
  CIVILIZATIONS,
  CIVILIZATION_CATALOG,
  SPECIAL_UNIT_CATALOG,
  MAP_SIZES,
  generateMap,
  xpToLevel,
  type MapSize,
} from '@aetas/game-engine'
import MapPreviewMini from '../components/MapPreviewMini.tsx'
import { createTestGame, type CreateGameParams } from '../api.ts'

type GameMode    = 'solo' | 'mixed' | 'multiplayer'
type Difficulty  = 'easy' | 'normal' | 'hard'
type Duration    = 10 | 20 | 40

interface Props {
  userId:         string
  onBack:         () => void
  onGameCreated:  (gameId: string) => void
  onLobby:        (gameId: string) => void
}

const PLAYER_COUNTS = [2, 3, 4, 6, 8] as const

export default function NewGamePage({ userId, onBack, onGameCreated, onLobby }: Props) {
  const { t } = useTranslation()

  // Profile
  const [userXp,     setUserXp]     = useState(0)
  const [selectedCiv, setSelectedCiv] = useState('romans')

  // Game config
  const [gameMode,    setGameMode]    = useState<GameMode>('solo')
  const [playerCount, setPlayerCount] = useState(2)
  const [humanSlots,  setHumanSlots]  = useState(1)
  const [mapSize,     setMapSize]     = useState<MapSize>('medium')
  const [duration,    setDuration]    = useState<Duration>(10)
  const [difficulty,  setDifficulty]  = useState<Difficulty>('normal')
  const [seed,        setSeed]        = useState(() => crypto.randomUUID())
  const [creating,    setCreating]    = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('xp, selected_civ')
        .eq('user_id', userId)
        .single()
      if (data) {
        setUserXp((data as { xp: number; selected_civ: string }).xp)
        setSelectedCiv((data as { xp: number; selected_civ: string }).selected_civ)
      }
    })()
  }, [userId])

  const handleModeChange = (mode: GameMode) => {
    setGameMode(mode)
    if (mode === 'solo') setHumanSlots(1)
    else if (mode === 'multiplayer') setHumanSlots(playerCount)
    else setHumanSlots(Math.max(1, Math.min(2, playerCount - 1)))
  }

  const handlePlayerCountChange = (n: number) => {
    setPlayerCount(n)
    if (gameMode === 'multiplayer') setHumanSlots(n)
    else if (gameMode === 'solo') setHumanSlots(1)
    else setHumanSlots(h => Math.min(h, n - 1))
  }

  const level = xpToLevel(userXp)
  const aiCount = playerCount - humanSlots

  const gameMap = useMemo(
    () => generateMap(MAP_SIZES[mapSize], seed, playerCount),
    [mapSize, seed, playerCount],
  )

  const handleCreate = async () => {
    setCreating(true)
    setCreateError(null)
    const params: CreateGameParams = {
      seed,
      mapSize,
      gameMode,
      playerCount,
      humanSlots,
      maxTurns: duration,
      aiDifficulty: difficulty,
      myCiv: selectedCiv,
    }
    const res = await createTestGame(params)
    setCreating(false)
    if (!res.ok || !res.data) {
      setCreateError(res.error ?? t('error.unknown'))
      return
    }
    if (res.data.status === 'lobby') {
      onLobby(res.data.gameId)
    } else {
      onGameCreated(res.data.gameId)
    }
  }

  const MODE_LABELS: Record<GameMode, string> = {
    solo: t('newgame.solo'),
    mixed: t('newgame.mixed'),
    multiplayer: t('newgame.multiplayer'),
  }
  const SIZE_LABELS: Record<MapSize, string> = {
    small: t('newgame.small'),
    medium: t('newgame.medium'),
    large: t('newgame.large'),
  }
  const SIZE_HINT: Record<MapSize, string> = {
    small: t('newgame.smallHint'),
    medium: t('newgame.mediumHint'),
    large: t('newgame.largeHint'),
  }
  const DIFF_LABELS: Record<Difficulty, string> = {
    easy: t('newgame.easy'),
    normal: t('newgame.normal'),
    hard: t('newgame.hard'),
  }
  const DIFF_HINT: Record<Difficulty, string> = {
    easy: t('newgame.easyDesc'),
    normal: t('newgame.normalDesc'),
    hard: t('newgame.hardDesc'),
  }
  const DUR_LABELS: Record<Duration, string> = {
    10: t('newgame.short'),
    20: t('newgame.shortMedium'),
    40: t('newgame.long'),
  }
  const DUR_HINT: Record<Duration, string> = {
    10: t('newgame.turns10'),
    20: t('newgame.turns20'),
    40: t('newgame.turns40'),
  }

  return (
    <div className="min-h-screen bg-aetas-bg text-aetas-text flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-aetas-surface border-b border-aetas-border sticky top-0 z-10">
        <button
          onClick={onBack}
          className="text-aetas-muted hover:text-aetas-text transition-colors text-sm"
        >
          {t('ui.back')}
        </button>
        <h1 className="font-display text-aetas-text font-semibold">{t('newgame.title')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full space-y-6 pb-32">

        {/* ── Game Mode ─────────────────────────────────────────── */}
        <Section label={t('newgame.mode')}>
          <div className="flex gap-2">
            {(['solo', 'mixed', 'multiplayer'] as GameMode[]).map(m => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`flex-1 py-2.5 px-2 rounded-xl border text-sm font-medium transition-all ${
                  gameMode === m
                    ? 'border-aetas-gold bg-aetas-gold/10 text-aetas-gold'
                    : 'border-aetas-border text-aetas-muted hover:border-aetas-border-strong hover:text-aetas-text'
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
          {gameMode === 'multiplayer' && (
            <p className="text-xs text-aetas-dim mt-2">
              {t('newgame.multiDesc')}
            </p>
          )}
        </Section>

        {/* ── Players ───────────────────────────────────────────── */}
        <Section label={t('newgame.players', { count: playerCount })}>
          <div className="flex gap-2">
            {PLAYER_COUNTS.map(n => (
              <button
                key={n}
                onClick={() => handlePlayerCountChange(n)}
                className={`flex-1 py-2 rounded-xl border text-sm font-bold transition-all ${
                  playerCount === n
                    ? 'border-aetas-gold bg-aetas-gold/10 text-aetas-gold'
                    : 'border-aetas-border text-aetas-muted hover:border-aetas-border-strong'
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Mixed: human slots sub-picker */}
          {gameMode === 'mixed' && playerCount > 1 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs text-aetas-dim">{t('newgame.humanSlots')}</p>
              <div className="flex gap-2">
                {Array.from({ length: playerCount - 1 }, (_, i) => i + 1).map(h => (
                  <button
                    key={h}
                    onClick={() => setHumanSlots(h)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all ${
                      humanSlots === h
                        ? 'border-aetas-gold bg-aetas-gold/10 text-aetas-gold'
                        : 'border-aetas-border text-aetas-muted hover:border-aetas-border-strong'
                    }`}
                  >
                    {h}H / {playerCount - h}IA
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="mt-3 flex gap-3 text-xs text-aetas-dim">
            <span className="text-aetas-muted font-medium">
              {t('newgame.humanSummary', { count: humanSlots })}
            </span>
            {aiCount > 0 && (
              <span>{t('newgame.aiSummary', { count: aiCount })}</span>
            )}
          </div>
        </Section>

        {/* ── Map Size ──────────────────────────────────────────── */}
        <Section label={t('newgame.mapSize')}>
          <div className="flex gap-2">
            {(Object.keys(MAP_SIZES) as MapSize[]).map(s => (
              <button
                key={s}
                onClick={() => setMapSize(s)}
                className={`flex-1 flex flex-col items-center py-2.5 px-1 rounded-xl border text-xs font-medium transition-all ${
                  mapSize === s
                    ? 'border-aetas-gold bg-aetas-gold/10 text-aetas-gold'
                    : 'border-aetas-border text-aetas-muted hover:border-aetas-border-strong hover:text-aetas-text'
                }`}
              >
                <span className="font-bold text-sm">{SIZE_LABELS[s]}</span>
                <span className="text-[10px] opacity-70 mt-0.5">{SIZE_HINT[s]}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Duration ──────────────────────────────────────────── */}
        <Section label={t('newgame.duration')}>
          <div className="flex gap-2">
            {([10, 20, 40] as Duration[]).map(d => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={`flex-1 flex flex-col items-center py-2.5 rounded-xl border text-xs font-medium transition-all ${
                  duration === d
                    ? 'border-aetas-gold bg-aetas-gold/10 text-aetas-gold'
                    : 'border-aetas-border text-aetas-muted hover:border-aetas-border-strong hover:text-aetas-text'
                }`}
              >
                <span className="font-bold text-sm">{DUR_LABELS[d]}</span>
                <span className="text-[10px] opacity-70 mt-0.5">{DUR_HINT[d]}</span>
              </button>
            ))}
          </div>
        </Section>

        {/* ── AI Difficulty (hidden if human-only) ───────────────── */}
        {aiCount > 0 && (
          <Section label={t('newgame.aiDifficulty')}>
            <div className="flex gap-2">
              {(['easy', 'normal', 'hard'] as Difficulty[]).map(d => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 flex flex-col items-center py-2.5 rounded-xl border text-xs font-medium transition-all ${
                    difficulty === d
                      ? 'border-aetas-gold bg-aetas-gold/10 text-aetas-gold'
                      : 'border-aetas-border text-aetas-muted hover:border-aetas-border-strong hover:text-aetas-text'
                  }`}
                >
                  <span className="font-bold text-sm">{DIFF_LABELS[d]}</span>
                  <span className="text-[10px] opacity-70 mt-0.5 text-center leading-tight">{DIFF_HINT[d]}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* ── Your Civilization ─────────────────────────────────── */}
        <Section label={t('newgame.yourCiv')}>
          <div className="grid grid-cols-2 gap-2.5">
            {CIVILIZATIONS.map(civ => {
              const unlocked = level >= civ.unlockLevel
              const chosen   = selectedCiv === civ.id
              const catalog  = CIVILIZATION_CATALOG.get(civ.id)
              const special  = catalog ? SPECIAL_UNIT_CATALOG.get(catalog.specialUnitType) : undefined

              return (
                <button
                  key={civ.id}
                  onClick={() => { if (unlocked) setSelectedCiv(civ.id) }}
                  disabled={!unlocked}
                  className={`relative flex items-start gap-2.5 p-3 rounded-xl text-left border transition-all text-xs ${
                    chosen
                      ? 'border-aetas-gold bg-aetas-gold/10 ring-1 ring-aetas-gold/50'
                      : unlocked
                        ? 'border-aetas-border bg-aetas-surface hover:border-aetas-border-strong hover:bg-aetas-raised'
                        : 'border-aetas-border bg-aetas-surface/50 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                    style={{ backgroundColor: civ.color + '30', border: `2px solid ${civ.color}66` }}
                  >
                    {civ.flag}
                  </span>
                  <div className="min-w-0">
                    <p className={`font-semibold ${unlocked ? 'text-aetas-text' : 'text-aetas-dim'}`}>
                      {civ.name}
                    </p>
                    {catalog?.abilities.map(a => (
                      <p key={a.id} className="text-aetas-muted text-[10px] mt-0.5 leading-tight">{a.description}</p>
                    ))}
                    {special && (
                      <p className="text-aetas-gold text-[10px] mt-0.5">★ {special.name}</p>
                    )}
                    {!unlocked && (
                      <p className="text-aetas-dim text-[10px] mt-0.5">{t('profile.unlock', { n: civ.unlockLevel })}</p>
                    )}
                  </div>
                  {chosen && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-aetas-gold flex items-center justify-center">
                      <span className="text-aetas-bg text-[9px] font-bold">✓</span>
                    </span>
                  )}
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl"
                    style={{ backgroundColor: unlocked ? civ.color : 'transparent' }}
                  />
                </button>
              )
            })}
          </div>
        </Section>

        {/* ── Map Preview ───────────────────────────────────────── */}
        <Section label={t('newgame.mapPreview')}>
          <div className="flex flex-col items-center gap-3">
            <MapPreviewMini tiles={gameMap.tiles} radius={gameMap.radius} width={300} height={230} />
            <p className="text-[10px] text-aetas-dim font-mono truncate w-full text-center" title={seed}>
              seed: {seed.slice(0, 20)}…
            </p>
            <button
              onClick={() => setSeed(crypto.randomUUID())}
              className="w-full py-2.5 rounded-xl border border-aetas-border text-aetas-muted text-sm font-medium hover:border-aetas-border-strong hover:text-aetas-text transition-all"
            >
              {t('newgame.newMap')}
            </button>
          </div>
        </Section>

      </div>

      {/* ── Fixed footer ──────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-aetas-bg border-t border-aetas-border px-4 py-4">
        <div className="max-w-lg mx-auto">
          {createError && (
            <p className="text-red-400 text-xs text-center mb-2 font-mono">{createError}</p>
          )}
          <button
            onClick={() => void handleCreate()}
            disabled={creating}
            className="w-full py-3.5 rounded-2xl bg-aetas-gold text-aetas-bg font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {creating && (
              <span className="w-4 h-4 rounded-full border-2 border-aetas-bg/50 border-t-aetas-bg animate-spin" />
            )}
            {gameMode === 'multiplayer' || (gameMode === 'mixed' && humanSlots > 1)
              ? t('newgame.createShare')
              : t('newgame.createGame')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="border-l-2 border-aetas-gold pl-3 mb-3 text-xs uppercase tracking-wider text-aetas-dim font-semibold">
        {label}
      </p>
      {children}
    </div>
  )
}
