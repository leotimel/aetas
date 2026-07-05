import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../supabase.ts'
import {
  CIVILIZATIONS, CIVILIZATION_CATALOG, SPECIAL_UNIT_CATALOG,
  xpToLevel, xpProgress, xpForNextLevel, LEVEL_XP_THRESHOLDS,
} from '@aetas/game-engine'

interface Profile {
  xp: number
  selected_civ: string
}

interface Props {
  userId: string
  onClose: () => void
}

export default function ProfilePage({ userId, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const [profile, setProfile] = useState<Profile | null>(null)
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

  return (
    <div className="fixed inset-0 z-50 bg-aetas-bg flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-aetas-surface border-b border-aetas-border">
        <button
          onClick={onClose}
          className="text-aetas-muted hover:text-aetas-text transition-colors"
        >
          {t('ui.back')}
        </button>
        <h1 className="font-display text-aetas-text font-semibold">{t('profile.title')}</h1>
        <div className="ml-auto flex items-center gap-2">
          {saving && <span className="text-aetas-dim text-xs animate-pulse">{t('profile.saving')}</span>}
          <button
            onClick={toggleLang}
            className="h-10 px-3 flex items-center text-[10px] text-aetas-dim border border-aetas-border rounded hover:border-aetas-border-strong hover:text-aetas-text transition-colors"
          >
            EN | PT
          </button>
          <button
            onClick={signOut}
            className="text-sm text-aetas-dim hover:text-red-400 transition-colors"
          >{t('ui.logout')}</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">
        {/* Level + XP */}
        <div className="bg-aetas-surface border border-aetas-border rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-xl bg-aetas-gold/10 border border-aetas-gold/30 flex items-center justify-center">
              <span className="text-aetas-gold font-bold text-xl">{level}</span>
            </div>
            <div>
              <p className="text-aetas-text font-bold">{t('profile.level', { n: level })}</p>
              <p className="text-aetas-muted text-sm">{t('profile.xpTotal', { xp: profile.xp })}</p>
            </div>
          </div>

          {/* XP progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-aetas-dim">
              <span>{isMaxLevel ? t('profile.maxLevel') : `${progressXp} / ${rangeXp} XP`}</span>
              {!isMaxLevel && <span>{t('profile.nextLevel', { n: level + 1 })}</span>}
            </div>
            <div className="h-2 bg-aetas-raised rounded-full overflow-hidden">
              <div
                className="h-full bg-aetas-gold rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* XP table */}
          <div className="mt-4 grid grid-cols-3 gap-1.5 text-center">
            <XpPill label={t('profile.xpGame')} value="+10" />
            <XpPill label={t('profile.xpVictory')} value="+35" />
            <XpPill label={t('profile.xpDaily')} value="+15" />
            <XpPill label={t('profile.xpDailyWin')} value="+50" />
          </div>
        </div>

        {/* Level ladder */}
        <div className="bg-aetas-surface border border-aetas-border rounded-2xl p-4 mb-6">
          <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-3">{t('profile.levels')}</p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: LEVEL_XP_THRESHOLDS.length }, (_, i) => {
              const lvl = i + 1
              const xpReq = LEVEL_XP_THRESHOLDS[i] ?? 0
              const reached = profile.xp >= xpReq
              return (
                <div
                  key={lvl}
                  className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg text-xs ${
                    lvl === level
                      ? 'bg-aetas-gold/10 border border-aetas-gold/40 text-aetas-gold'
                      : reached
                        ? 'bg-aetas-raised text-aetas-muted'
                        : 'bg-aetas-surface text-aetas-dim border border-aetas-border'
                  }`}
                >
                  <span className="font-bold">{lvl}</span>
                  <span className="text-aetas-dim text-xs">{xpReq}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tutorial settings */}
        <div className="bg-aetas-surface border border-aetas-border rounded-2xl p-4 mb-6">
          <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-3">{t('tutorial.settingsTitle')}</p>
          {tutorialReset ? (
            <p className="text-emerald-400 text-sm">{t('tutorial.reactivated')}</p>
          ) : (
            <button
              onClick={handleReactivateTutorial}
              className="text-sm text-aetas-muted hover:text-aetas-text border border-aetas-border hover:border-aetas-border-strong rounded-lg px-3 py-1.5 transition-colors"
            >
              {t('tutorial.reactivate')}
            </button>
          )}
        </div>

        {/* Civilization grid */}
        <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-3">{t('profile.civilizations')}</p>
        <div className="grid grid-cols-2 gap-3 pb-6">
          {CIVILIZATIONS.map(civ => {
            const unlocked = level >= civ.unlockLevel
            const selected = profile.selected_civ === civ.id

            return (
              <button
                key={civ.id}
                onClick={() => { if (unlocked) void selectCiv(civ.id) }}
                disabled={!unlocked || saving}
                className={`relative flex items-start gap-3 p-3.5 rounded-xl text-left border transition-all ${
                  selected
                    ? 'border-aetas-gold bg-aetas-gold/10 ring-1 ring-aetas-gold/60'
                    : unlocked
                      ? 'border-aetas-border bg-aetas-surface hover:border-aetas-border-strong hover:bg-aetas-raised'
                      : 'border-aetas-border bg-aetas-surface/50 opacity-50 cursor-not-allowed'
                }`}
              >
                {/* Flag + color swatch */}
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: civ.color + '30', border: `2px solid ${civ.color}66` }}
                >
                  {civ.flag}
                </span>
                <div className="min-w-0">
                  <p className={`font-semibold text-sm ${unlocked ? 'text-aetas-text' : 'text-aetas-dim'}`}>
                    {civ.name}
                  </p>
                  {(() => {
                    const catalog = CIVILIZATION_CATALOG.get(civ.id)
                    const specialUnit = catalog ? SPECIAL_UNIT_CATALOG.get(catalog.specialUnitType) : undefined
                    return (
                      <>
                        {catalog?.abilities.map(a => (
                          <p key={a.id} className="text-aetas-muted text-xs mt-0.5 leading-tight">{a.description}</p>
                        ))}
                        {specialUnit && (
                          <p className="text-aetas-gold text-xs mt-1 leading-tight">
                            ★ {specialUnit.name}
                          </p>
                        )}
                      </>
                    )
                  })()}
                  {!unlocked && (
                    <p className="text-aetas-dim text-xs mt-1">{t('profile.unlock', { n: civ.unlockLevel })}</p>
                  )}
                </div>
                {/* Selected checkmark */}
                {selected && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-aetas-gold flex items-center justify-center">
                    <span className="text-aetas-bg text-xs font-bold">✓</span>
                  </span>
                )}
                {/* Color stripe */}
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl"
                  style={{ backgroundColor: unlocked ? civ.color : 'transparent' }}
                />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function XpPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-aetas-raised/60 rounded-lg py-1.5 px-2">
      <p className="text-aetas-gold font-bold text-sm">{value}</p>
      <p className="text-aetas-dim text-xs">{label}</p>
    </div>
  )
}
