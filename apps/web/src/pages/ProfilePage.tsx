import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../supabase.ts'
import {
  CIVILIZATIONS, CIVILIZATION_CATALOG, SPECIAL_UNIT_CATALOG,
  xpToLevel, xpProgress, xpForNextLevel, unlockedCivs, LEVEL_XP_THRESHOLDS,
} from '@aetas/game-engine'
import { CivCrest } from '../components/ui/CivCrest'
import { CornerOrnaments } from '../components/ui/CornerOrnaments'

interface Profile {
  xp: number
  selected_civ: string
}

interface Props {
  userId: string
  onClose: () => void
}

// Trail geometry (Campaign Progress) — horizontal step per level marker and
// the vertical alternation that gives the "winding path" feel.
const TRAIL_STEP   = 56
const TRAIL_PAD    = 30
const TRAIL_OFFSET = 22
const TRAIL_BASE_Y = 50

export default function ProfilePage({ userId, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tutorialReset, setTutorialReset] = useState(false)

  const handleReactivateTutorial = () => {
    localStorage.removeItem('aetas-tutorial-done')
    setTutorialReset(true)
  }

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('xp, selected_civ')
        .eq('user_id', userId)
        .single()
      if (data) {
        setProfile(data as Profile)
      } else {
        await supabase.from('profiles').upsert({ user_id: userId, xp: 0, selected_civ: 'romans' })
        setProfile({ xp: 0, selected_civ: 'romans' })
      }
    })()
    // display_name lives on user_profiles (OAuth-populated), a different
    // table from profiles (xp/selected_civ) — same pattern as GameListPage.
    void supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) setDisplayName((data as { display_name: string }).display_name)
      })
  }, [userId])

  const selectCiv = async (civId: string) => {
    if (!profile) return
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ selected_civ: civId })
      .eq('user_id', userId)
    setProfile(p => p ? { ...p, selected_civ: civId } : p)
    setSaving(false)
  }

  const toggleLang = () => {
    const next = i18n.language === 'en' ? 'pt' : 'en'
    void i18n.changeLanguage(next)
    localStorage.setItem('aetas-lang', next)
  }

  const signOut = () => void supabase.auth.signOut()

  if (!profile) {
    return (
      <div className="fixed inset-0 z-50 bg-aetas-bg flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-aetas-border border-t-aetas-muted animate-spin" />
      </div>
    )
  }

  const level = xpToLevel(profile.xp)
  const [progressXp, rangeXp] = xpProgress(profile.xp)
  const nextLevelXp = xpForNextLevel(level)
  const isMaxLevel = nextLevelXp === Infinity
  const pct = isMaxLevel ? 100 : Math.round((progressXp / rangeXp) * 100)
  const unlockedCount = unlockedCivs(profile.xp).length

  return (
    <div className="fixed inset-0 z-50 bg-aetas-bg flex flex-col">
      {/* Header */}
      <header
        className="flex-shrink-0 flex items-center gap-3 px-4 py-3"
        style={{ background: 'radial-gradient(120% 100% at 50% 0%, #241a0b, #120d06)', borderBottom: '1px solid rgba(201,169,78,0.22)' }}
      >
        <button
          onClick={onClose}
          className="text-aetas-label text-sm hover:text-aetas-text transition-colors flex-shrink-0"
        >
          ← {t('ui.back')}
        </button>
        <h1 className="flex-1 text-center font-display font-extrabold text-[15px] text-aetas-gold-bright tracking-wide">
          <span className="text-aetas-gold/60">◆</span> {t('profile.title')} <span className="text-aetas-gold/60">◆</span>
        </h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saving && <span className="text-aetas-dim text-xs animate-pulse hidden sm:inline">{t('profile.saving')}</span>}
          <button
            onClick={toggleLang}
            className="h-9 px-2.5 flex items-center text-[10px] text-aetas-dim border border-aetas-border rounded hover:border-aetas-border-strong hover:text-aetas-text transition-colors"
          >
            EN | PT
          </button>
          <button
            onClick={signOut}
            className="h-9 px-2.5 flex items-center text-xs rounded border transition-colors"
            style={{ borderColor: 'rgba(176,43,40,0.35)', color: '#b96a5a' }}
          >{t('ui.logout')}</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">

        {/* Rank card */}
        <div
          className="relative rounded-2xl p-5 mb-6"
          style={{ border: '1px solid rgba(201,169,78,0.32)', background: 'linear-gradient(160deg,#271c0c,#160f06)' }}
        >
          <CornerOrnaments />
          <div className="flex items-center gap-4 mb-4">
            <RankBadge level={level} />
            <div className="min-w-0">
              <p className="font-body font-semibold text-aetas-text truncate">{displayName ?? t('list.playerFallback')}</p>
              <p className="text-aetas-label text-[11px] uppercase tracking-[0.16em] mt-1">{t('profile.consulRank')}</p>
              <p className="font-display font-extrabold text-aetas-gold-bright" style={{ fontSize: 22 }}>{t('profile.level', { n: level })}</p>
              <p className="text-aetas-dim text-xs mt-0.5">
                {t('profile.xpTotal', { xp: profile.xp })} · {isMaxLevel ? t('profile.maxLevel') : t('profile.nextLevel', { n: level + 1 })}
              </p>
            </div>
          </div>

          {/* XP progress bar */}
          <div className="h-[7px] bg-aetas-raised rounded-full overflow-hidden">
            <div
              className="h-full bg-aetas-gold rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* XP table — sources of XP, not achievements */}
          <div className="mt-4 grid grid-cols-3 gap-1.5 text-center">
            <XpPill label={t('profile.xpGame')} value="+10" />
            <XpPill label={t('profile.xpVictory')} value="+35" />
            <XpPill label={t('profile.xpDaily')} value="+15" />
            <XpPill label={t('profile.xpDailyWin')} value="+50" />
          </div>
        </div>

        {/* Achievements — placeholder (real system: UI-F3) */}
        <p className="text-aetas-label text-[11px] uppercase tracking-[0.2em] mb-2">{t('profile.achievements')}</p>
        <div className="rounded-2xl p-4 mb-6" style={{ border: '1px solid rgba(201,169,78,0.18)', background: '#141009' }}>
          <div className="grid grid-cols-5 gap-2 mb-3">
            {['🏆', '⚔️', '👑', '🛡️', '⭐'].map((icon, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg flex items-center justify-center text-lg"
                style={{ border: '1px dashed rgba(201,169,78,0.28)', background: 'rgba(201,169,78,0.04)', color: '#4a4032' }}
              >
                {icon}
              </div>
            ))}
          </div>
          <p className="text-aetas-dim text-xs text-center">{t('profile.achievementsComingSoon')}</p>
        </div>

        {/* Campaign Progress — winding level trail (replaces the old flat ladder) */}
        <p className="text-aetas-label text-[11px] uppercase tracking-[0.2em] mb-2">{t('profile.campaignProgress')}</p>
        <div className="rounded-2xl p-3 mb-6 overflow-x-auto no-scrollbar" style={{ border: '1px solid rgba(201,169,78,0.18)', background: '#141009' }}>
          <LevelTrail currentLevel={level} currentXp={profile.xp} />
        </div>

        {/* Tutorial settings */}
        <div className="rounded-2xl p-4 mb-6" style={{ border: '1px solid var(--color-aetas-border)', background: 'var(--color-aetas-surface)' }}>
          <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-3">{t('tutorial.settingsTitle')}</p>
          {tutorialReset ? (
            <p className="text-emerald-400 text-sm">{t('tutorial.reactivated')}</p>
          ) : (
            <button
              onClick={handleReactivateTutorial}
              className="text-sm text-aetas-gold border border-aetas-gold/40 bg-aetas-raised hover:border-aetas-gold rounded-lg px-3 py-1.5 transition-colors"
            >
              {t('tutorial.reactivate')}
            </button>
          )}
        </div>

        {/* Civilizations — single-column full-width cards */}
        <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-3">
          {t('profile.civilizationsCount', { unlocked: unlockedCount, total: CIVILIZATIONS.length })}
        </p>
        <div className="flex flex-col gap-3 pb-6">
          {CIVILIZATIONS.map(civ => {
            const unlocked = level >= civ.unlockLevel
            const selected = profile.selected_civ === civ.id

            return (
              <button
                key={civ.id}
                onClick={() => { if (unlocked) void selectCiv(civ.id) }}
                disabled={!unlocked || saving}
                className={`relative flex items-start gap-3 p-3.5 rounded-xl text-left border transition-all overflow-hidden ${
                  selected
                    ? 'border-aetas-gold ring-1 ring-aetas-gold/60'
                    : unlocked
                      ? 'border-aetas-border hover:border-aetas-border-strong'
                      : 'border-aetas-border opacity-60 cursor-not-allowed'
                }`}
                style={{
                  background: unlocked
                    ? `radial-gradient(70% 100% at 12% 0%, ${civ.color}47, transparent 55%), var(--color-aetas-surface)`
                    : 'var(--color-aetas-surface)',
                }}
              >
                <div className="flex-shrink-0" style={{ filter: unlocked ? 'none' : 'grayscale(1)' }}>
                  <CivCrest civId={civ.id} size={48} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`font-body font-bold text-sm ${unlocked ? 'text-aetas-text' : 'text-aetas-dim'}`}>
                    {civ.name}
                  </p>
                  {unlocked ? (() => {
                    const catalog = CIVILIZATION_CATALOG.get(civ.id)
                    const specialUnit = catalog ? SPECIAL_UNIT_CATALOG.get(catalog.specialUnitType) : undefined
                    return (
                      <>
                        {catalog?.abilities.map(a => (
                          <p key={a.id} className="text-aetas-dim text-xs mt-0.5 leading-tight">{a.description}</p>
                        ))}
                        {specialUnit && (
                          <p className="text-aetas-gold-bright text-xs mt-1 leading-tight">
                            ★ {specialUnit.name}
                          </p>
                        )}
                      </>
                    )
                  })() : (
                    <p className="text-aetas-dim text-xs mt-1">{t('profile.unlock', { n: civ.unlockLevel })}</p>
                  )}
                </div>
                {/* State badge */}
                <span
                  className="flex-shrink-0 px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider"
                  style={unlocked
                    ? { color: '#7bbf6a', background: 'rgba(123,191,106,0.12)', border: '1px solid rgba(123,191,106,0.35)' }
                    : { color: 'var(--color-aetas-dim)', background: 'rgba(201,169,78,0.05)', border: '1px solid var(--color-aetas-border)' }}
                >
                  {unlocked ? t('profile.unlocked') : `🔒 ${civ.unlockLevel}`}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Account-level rank emblem — shield + level number (same path/gradient technique as CivCrest, but always gold, not civ-tinted). */
function RankBadge({ level, size = 64 }: { level: number; size?: number }) {
  const height = Math.round(size * 58 / 52)
  return (
    <svg width={size} height={height} viewBox="0 0 52 58" className="flex-shrink-0">
      <defs>
        <linearGradient id="rankBadgeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0d488" />
          <stop offset="1" stopColor="#8a6a26" />
        </linearGradient>
      </defs>
      <path
        d="M26 2 L48 10 V30 C48 44 38 52 26 56 C14 52 4 44 4 30 V10 Z"
        fill="#1a1206"
        stroke="url(#rankBadgeGrad)"
        strokeWidth="2.5"
      />
      <text x="26" y="34" textAnchor="middle" fontFamily="Cinzel, Georgia, serif" fontWeight="800" fontSize={size * 0.42} fill="var(--color-aetas-gold-bright)">
        {level}
      </text>
    </svg>
  )
}

/** Horizontal winding trail through every level, connected by a smooth SVG path. */
function LevelTrail({ currentLevel, currentXp }: { currentLevel: number; currentXp: number }) {
  const { t } = useTranslation()
  const count = LEVEL_XP_THRESHOLDS.length
  const width = TRAIL_PAD * 2 + TRAIL_STEP * (count - 1)
  const height = TRAIL_BASE_Y + TRAIL_OFFSET + 30

  const points = LEVEL_XP_THRESHOLDS.map((xpReq, i) => ({
    x: TRAIL_PAD + i * TRAIL_STEP,
    y: TRAIL_BASE_Y + (i % 2 === 0 ? -TRAIL_OFFSET : TRAIL_OFFSET),
    level: i + 1,
    xpReq,
  }))

  // Smooth wavy connector: a cubic bezier per segment with horizontal handles.
  let path = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const cur = points[i]!
    const midX = (prev.x + cur.x) / 2
    path += ` C ${midX} ${prev.y}, ${midX} ${cur.y}, ${cur.x} ${cur.y}`
  }

  const reachedFrac = count > 1 ? (currentLevel - 1) / (count - 1) : 1

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="trailGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset={reachedFrac} stopColor="var(--color-aetas-gold)" />
          <stop offset={reachedFrac} stopColor="#3a2f1a" />
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke="url(#trailGrad)" strokeWidth="2" />
      {points.map(p => {
        const reached = p.level <= currentLevel
        const isCurrent = p.level === currentLevel
        const r = isCurrent ? 15 : 13
        return (
          <g key={p.level}>
            <circle
              cx={p.x} cy={p.y} r={r}
              fill={isCurrent ? '#c99a3e' : '#2a1f0d'}
              style={isCurrent ? { filter: 'drop-shadow(0 0 6px rgba(216,180,90,0.55))' } : undefined}
              stroke={isCurrent ? 'var(--color-aetas-gold-light)' : reached ? 'var(--color-aetas-gold)' : '#6f6448'}
              strokeWidth={isCurrent ? 2.5 : 2}
            />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontFamily="Cinzel, Georgia, serif" fontWeight="700" fontSize={11}
              fill={isCurrent ? '#1a1206' : reached ? 'var(--color-aetas-gold-bright)' : 'var(--color-aetas-dim)'}>
              {p.level}
            </text>
            <text x={p.x} y={p.y > TRAIL_BASE_Y ? p.y + r + 12 : p.y - r - 6} textAnchor="middle" fontSize={9} fill="var(--color-aetas-dim)">
              {isCurrent ? `${p.xpReq} · ${t('ui.you')}` : p.xpReq}
            </text>
          </g>
        )
      })}
      <text x={width - 4} y={12} textAnchor="end" fontSize={8} fill="var(--color-aetas-dim)">{currentXp} XP</text>
    </svg>
  )
}

function XpPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg py-1.5 px-2" style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(201,169,78,0.15)' }}>
      <p className="text-aetas-gold-bright font-bold text-sm">{value}</p>
      <p className="text-aetas-dim text-xs">{label}</p>
    </div>
  )
}
