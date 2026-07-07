import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../supabase.ts'
import {
  CIVILIZATIONS,
  CIVILIZATION_CATALOG,
  SPECIAL_UNIT_CATALOG,
  MAP_SIZES,
  generateMap,
  getCiv,
  xpToLevel,
  type MapSize,
} from '@aetas/game-engine'
import MapPreviewMini from '../components/MapPreviewMini.tsx'
import { CivCrest } from '../components/ui/CivCrest'
import { BottomSheet } from '../components/ui/BottomSheet'
import { SettingRow } from '../components/ui/SettingRow'
import { createTestGame, type CreateGameParams } from '../api.ts'

type GameMode    = 'solo' | 'mixed' | 'multiplayer'
type Difficulty  = 'easy' | 'normal' | 'hard'
type Duration    = 10 | 20 | 40
type Sheet       = 'opponents' | 'map' | 'turn' | null

interface Props {
  userId:         string
  onBack:         () => void
  onGameCreated:  (gameId: string) => void
  onLobby:        (gameId: string) => void
}

const PLAYER_COUNTS = [2, 3, 4, 6, 8] as const
const AMBER_GRAD = 'radial-gradient(80% 120% at 50% 0%, #3a2a12, #160f06)'

// Highlights numbers (e.g. "+25%", "+1") in gold-bright inside ability copy.
function highlightNumbers(text: string): ReactNode[] {
  return text.split(/([+-]?\d[\d.,]*\s?%?)/g).map((part, i) =>
    /\d/.test(part)
      ? <span key={i} className="text-aetas-gold-bright font-semibold">{part}</span>
      : <span key={i}>{part}</span>,
  )
}

/** Four L-shaped corner ornaments (same pattern as DailyCard). */
function CornerOrnaments() {
  return (
    <>
      {['top-0 left-0', 'top-0 right-0 rotate-90', 'bottom-0 right-0 rotate-180', 'bottom-0 left-0 -rotate-90'].map((pos, i) => (
        <svg key={i} className={`absolute ${pos} w-4 h-4 pointer-events-none`} viewBox="0 0 16 16"
          fill="none" stroke="var(--color-aetas-parchment)" strokeWidth="1.5">
          <path d="M1 15 L1 1 L15 1" />
        </svg>
      ))}
    </>
  )
}

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

  const [activeSheet, setActiveSheet] = useState<Sheet>(null)

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

  const heroCiv = getCiv(selectedCiv)
  const catalog = CIVILIZATION_CATALOG.get(selectedCiv)
  const abilities = catalog?.abilities ?? []
  const special = catalog ? SPECIAL_UNIT_CATALOG.get(catalog.specialUnitType) : undefined

  const oppSummary =
    gameMode === 'multiplayer' ? t('newgame.sumHumans', { n: playerCount })
    : gameMode === 'mixed' && humanSlots > 1 ? t('newgame.sumMixed', { h: humanSlots, ai: aiCount })
    : t('newgame.sumAI', { n: aiCount })

  const sheetLabel = 'font-body text-aetas-label text-[11px] uppercase tracking-wider mb-2 mt-4 first:mt-0'
  const optBtn = (active: boolean) =>
    `flex-1 flex flex-col items-center py-2.5 px-1 rounded-xl border text-xs font-medium transition-all ${
      active
        ? 'border-aetas-gold bg-aetas-gold/10 text-aetas-gold'
        : 'border-aetas-border text-aetas-muted hover:border-aetas-border-strong hover:text-aetas-text'
    }`

  return (
    <div className="min-h-screen bg-aetas-bg text-aetas-text flex flex-col">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="relative h-[250px] flex-shrink-0 flex flex-col items-center justify-center overflow-hidden" style={{ background: AMBER_GRAD }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'repeating-linear-gradient(45deg, rgba(201,169,78,0.04) 0 1px, transparent 1px 10px)' }} />
        <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none" style={{ background: 'linear-gradient(to bottom, transparent, var(--color-aetas-bg))' }} />
        <button
          onClick={onBack}
          className="absolute top-4 left-4 z-10 text-aetas-muted hover:text-aetas-text transition-colors text-xl leading-none"
        >←</button>
        <div className="relative z-[1] flex flex-col items-center gap-2 px-8 text-center">
          <CivCrest civId={selectedCiv} size={86} />
          <p className="font-body text-aetas-label text-[11px] uppercase tracking-[0.2em]">{t('newgame.chooseLeader')}</p>
          <h1 className="font-display font-semibold text-aetas-gold leading-none" style={{ fontSize: 32 }}>{heroCiv.name}</h1>
          <p className="font-flavor italic text-aetas-muted text-sm leading-snug">{heroCiv.description}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full space-y-4 pb-32">

        {/* ── Unique ability card ─────────────────────────────── */}
        {abilities[0] && (
          <div className="relative rounded-sm p-4 bg-aetas-panel"
            style={{ border: '1px solid var(--color-aetas-border)', borderTop: '3px solid var(--color-aetas-parchment)' }}>
            <CornerOrnaments />
            <p className="font-display text-[11px] uppercase tracking-wider text-aetas-gold/80 mb-1.5">
              ◆ {t('newgame.uniqueAbility')} · {abilities[0].name}
            </p>
            <p className="text-sm text-aetas-text leading-snug">{highlightNumbers(abilities[0].description)}</p>
            {abilities.slice(1).map(a => (
              <p key={a.id} className="text-xs text-aetas-muted mt-2 leading-snug">
                <span className="text-aetas-gold">★ {a.name} — </span>{highlightNumbers(a.description)}
              </p>
            ))}
            {special && (
              <p className="text-xs text-aetas-gold/80 mt-2">★ {special.name}</p>
            )}
          </div>
        )}

        {/* ── Leader row ──────────────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4">
          {CIVILIZATIONS.map(civ => {
            const unlocked = level >= civ.unlockLevel
            const chosen   = selectedCiv === civ.id
            return (
              <button
                key={civ.id}
                onClick={() => { if (unlocked) setSelectedCiv(civ.id) }}
                disabled={!unlocked}
                className={`snap-start shrink-0 w-20 aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 p-1 transition-all ${
                  chosen
                    ? 'border-aetas-gold bg-aetas-raised'
                    : unlocked
                      ? 'border-aetas-border hover:border-aetas-border-strong'
                      : 'border-aetas-border opacity-50 cursor-not-allowed'
                }`}
              >
                <CivCrest civId={civ.id} size={40} />
                <span className={`text-[10px] leading-tight text-center ${chosen ? 'text-aetas-gold' : 'text-aetas-muted'}`}>{civ.name}</span>
                {!unlocked && <span className="text-[8px] text-aetas-dim leading-none">🔒 {civ.unlockLevel}</span>}
              </button>
            )
          })}
        </div>

        {/* ── Settings rows ───────────────────────────────────── */}
        <div className="bg-aetas-surface rounded-sm px-3" style={{ border: '1px solid var(--color-aetas-border)' }}>
          <SettingRow label={t('newgame.opponents')} value={oppSummary} onClick={() => setActiveSheet('opponents')} />
          <SettingRow label={t('newgame.map')} value={SIZE_LABELS[mapSize]} onClick={() => setActiveSheet('map')} />
          <div className="[&>button]:border-0">
            <SettingRow label={t('newgame.turnLimit')} value={DUR_LABELS[duration]} onClick={() => setActiveSheet('turn')} />
          </div>
        </div>
      </div>

      {/* ── Fixed footer CTA ──────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-aetas-bg border-t border-aetas-border px-4 py-4">
        <div className="max-w-lg mx-auto">
          {createError && (
            <p className="text-red-400 text-xs text-center mb-2 font-mono">{createError}</p>
          )}
          <button
            onClick={() => void handleCreate()}
            disabled={creating}
            className="w-full py-3.5 rounded-2xl bg-aetas-gold text-aetas-bg font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ boxShadow: 'var(--shadow-glow)' }}
          >
            {creating && (
              <span className="w-4 h-4 rounded-full border-2 border-aetas-bg/50 border-t-aetas-bg animate-spin" />
            )}
            {t('newgame.beginReign')}
          </button>
        </div>
      </div>

      {/* ── Opponents sheet ───────────────────────────────────── */}
      <BottomSheet open={activeSheet === 'opponents'} title={t('newgame.opponents')} onClose={() => setActiveSheet(null)}>
        <p className={sheetLabel}>{t('newgame.mode')}</p>
        <div className="flex gap-2">
          {(['solo', 'mixed', 'multiplayer'] as GameMode[]).map(m => (
            <button key={m} onClick={() => handleModeChange(m)} className={optBtn(gameMode === m)}>
              <span className="font-bold text-sm">{MODE_LABELS[m]}</span>
            </button>
          ))}
        </div>
        {gameMode === 'multiplayer' && (
          <p className="text-xs text-aetas-dim mt-2">{t('newgame.multiDesc')}</p>
        )}

        <p className={sheetLabel}>{t('newgame.players', { count: playerCount })}</p>
        <div className="flex gap-2">
          {PLAYER_COUNTS.map(n => (
            <button key={n} onClick={() => handlePlayerCountChange(n)} className={optBtn(playerCount === n)}>
              <span className="font-bold text-sm">{n}</span>
            </button>
          ))}
        </div>

        {gameMode === 'mixed' && playerCount > 1 && (
          <>
            <p className={sheetLabel}>{t('newgame.humanSlots')}</p>
            <div className="flex gap-2">
              {Array.from({ length: playerCount - 1 }, (_, i) => i + 1).map(h => (
                <button key={h} onClick={() => setHumanSlots(h)} className={optBtn(humanSlots === h)}>
                  <span className="font-medium text-xs">{h}H / {playerCount - h}IA</span>
                </button>
              ))}
            </div>
          </>
        )}

        {aiCount > 0 && (
          <>
            <p className={sheetLabel}>{t('newgame.aiDifficulty')}</p>
            <div className="flex gap-2">
              {(['easy', 'normal', 'hard'] as Difficulty[]).map(d => (
                <button key={d} onClick={() => setDifficulty(d)} className={optBtn(difficulty === d)}>
                  <span className="font-bold text-sm">{DIFF_LABELS[d]}</span>
                  <span className="text-[10px] opacity-70 mt-0.5 text-center leading-tight">{DIFF_HINT[d]}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </BottomSheet>

      {/* ── Map sheet ─────────────────────────────────────────── */}
      <BottomSheet open={activeSheet === 'map'} title={t('newgame.mapSize')} onClose={() => setActiveSheet(null)}>
        <div className="flex gap-2">
          {(Object.keys(MAP_SIZES) as MapSize[]).map(s => (
            <button key={s} onClick={() => setMapSize(s)} className={optBtn(mapSize === s)}>
              <span className="font-bold text-sm">{SIZE_LABELS[s]}</span>
              <span className="text-[10px] opacity-70 mt-0.5">{SIZE_HINT[s]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-col items-center gap-3 mt-4">
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
      </BottomSheet>

      {/* ── Turn limit sheet ──────────────────────────────────── */}
      <BottomSheet open={activeSheet === 'turn'} title={t('newgame.duration')} onClose={() => setActiveSheet(null)}>
        <div className="flex gap-2">
          {([10, 20, 40] as Duration[]).map(d => (
            <button key={d} onClick={() => setDuration(d)} className={optBtn(duration === d)}>
              <span className="font-bold text-sm">{DUR_LABELS[d]}</span>
              <span className="text-[10px] opacity-70 mt-0.5">{DUR_HINT[d]}</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
