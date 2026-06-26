import { useTranslation } from 'react-i18next'

export interface XpToastItem { id: string; event: string; xpGained: number }

type XpKey = 'xp.turnPlayed' | 'xp.eraAdvanced' | 'xp.buildingConstructed' | 'xp.civEliminated' | 'xp.cityFounded' | 'xp.combatWon'

const EVENT_KEYS: Record<string, XpKey> = {
  turn_played:          'xp.turnPlayed',
  era_advanced:         'xp.eraAdvanced',
  building_constructed: 'xp.buildingConstructed',
  civ_eliminated:       'xp.civEliminated',
  city_founded:         'xp.cityFounded',
  combat_won:           'xp.combatWon',
}

interface Props { toasts: XpToastItem[] }

export default function XpToast({ toasts }: Props) {
  const { t } = useTranslation()

  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-28 md:bottom-20 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map(item => (
        <div
          key={item.id}
          className="flex items-center gap-2 bg-emerald-950/90 border border-emerald-600/40 rounded-xl px-3 py-2 shadow-lg backdrop-blur-sm anim-xp-toast"
        >
          <span className="text-emerald-300 font-bold text-sm">+{item.xpGained} XP</span>
          <span className="text-emerald-100/70 text-sm">
            — {EVENT_KEYS[item.event] ? t(EVENT_KEYS[item.event]) : item.event}
          </span>
        </div>
      ))}
    </div>
  )
}
