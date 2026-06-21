import { useEffect, useState } from 'react'
import { supabase } from '../supabase.ts'
import {
  CIVILIZATIONS, xpToLevel, xpProgress, xpForNextLevel, LEVEL_XP_THRESHOLDS,
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
  const [profile, setProfile] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)

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
        // No profile yet — upsert with defaults
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

  if (!profile) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-slate-700 border-t-slate-400 animate-spin" />
      </div>
    )
  }

  const level = xpToLevel(profile.xp)
  const [progressXp, rangeXp] = xpProgress(profile.xp)
  const nextLevelXp = xpForNextLevel(level)
  const isMaxLevel = nextLevelXp === Infinity
  const pct = isMaxLevel ? 100 : Math.round((progressXp / rangeXp) * 100)

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 transition-colors"
        >
          ← Voltar
        </button>
        <h1 className="text-slate-100 font-bold">Perfil</h1>
        {saving && <span className="ml-auto text-slate-500 text-xs animate-pulse">Salvando…</span>}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full">
        {/* Level + XP */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-xl bg-blue-900/60 border border-blue-800/50 flex items-center justify-center">
              <span className="text-blue-300 font-bold text-xl">{level}</span>
            </div>
            <div>
              <p className="text-slate-100 font-bold">Nível {level}</p>
              <p className="text-slate-400 text-sm">{profile.xp} XP total</p>
            </div>
          </div>

          {/* XP progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-500">
              <span>{isMaxLevel ? 'Nível máximo' : `${progressXp} / ${rangeXp} XP`}</span>
              {!isMaxLevel && <span>Próximo: nível {level + 1}</span>}
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* XP table */}
          <div className="mt-4 grid grid-cols-3 gap-1.5 text-center">
            <XpPill label="Partida jogada" value="+10" />
            <XpPill label="Vitória" value="+35" />
            <XpPill label="Daily (jogada)" value="+15" />
            <XpPill label="Daily (vitória)" value="+50" />
          </div>
        </div>

        {/* Level ladder */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Níveis</p>
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
                      ? 'bg-blue-900/60 border border-blue-700 text-blue-300'
                      : reached
                        ? 'bg-slate-800 text-slate-400'
                        : 'bg-slate-900 text-slate-700'
                  }`}
                >
                  <span className="font-bold">{lvl}</span>
                  <span className="text-slate-600 text-xs">{xpReq}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Civilization grid */}
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Civilizações</p>
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
                    ? 'border-blue-600 bg-blue-950/50 ring-1 ring-blue-600'
                    : unlocked
                      ? 'border-slate-700 bg-slate-900 hover:border-slate-600 hover:bg-slate-800'
                      : 'border-slate-800 bg-slate-900/50 opacity-50 cursor-not-allowed'
                }`}
              >
                {/* Color dot */}
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: civ.color + '30', border: `2px solid ${civ.color}66` }}
                >
                  {civ.flag}
                </span>
                <div className="min-w-0">
                  <p className={`font-semibold text-sm ${unlocked ? 'text-slate-100' : 'text-slate-600'}`}>
                    {civ.name}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5 leading-tight">{civ.description}</p>
                  {!unlocked && (
                    <p className="text-slate-700 text-xs mt-1">Nível {civ.unlockLevel}</p>
                  )}
                </div>
                {/* Selected checkmark */}
                {selected && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
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
    <div className="bg-slate-800/60 rounded-lg py-1.5 px-2">
      <p className="text-green-400 font-bold text-sm">{value}</p>
      <p className="text-slate-600 text-xs">{label}</p>
    </div>
  )
}
