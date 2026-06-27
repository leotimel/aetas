import { useTranslation } from 'react-i18next'
import type { Resources } from '@aetas/game-engine'

/** Mirrors UNIT_MAINTENANCE_GOLD in the engine (gold per unit per turn). */
const MAINTENANCE_PER_UNIT = 1

interface Props {
  resources: Resources
  income:    Resources
  unitCount: number
}

export default function ResourceBar({ resources, income, unitCount }: Props) {
  const { t } = useTranslation()

  const ITEMS = [
    { key: 'gold'       as const, icon: '🏅', label: t('resource.gold') },
    { key: 'food'       as const, icon: '🌾', label: t('resource.food') },
    { key: 'production' as const, icon: '⚙',  label: t('resource.production') },
  ]

  const maintenance = unitCount * MAINTENANCE_PER_UNIT

  return (
    <div className="flex items-center justify-center gap-6 px-3 py-2 bg-aetas-raised border-b border-aetas-border text-xs flex-shrink-0">
      {ITEMS.map(({ key, icon, label }) => {
        const inc = income[key]
        return (
          <div key={key} className="flex items-center gap-1.5" title={label}>
            <span className="text-base leading-none">{icon}</span>
            <span className="text-aetas-text font-semibold">{resources[key]}</span>
            <span className={inc >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {inc >= 0 ? `+${inc}` : `${inc}`}
            </span>
          </div>
        )
      })}

      {unitCount > 0 && (
        <div className="flex items-center gap-1.5" title={t('resource.maintenance')}>
          <span className="text-base leading-none">🗡</span>
          <span className={resources.gold < maintenance ? 'text-red-400' : 'text-aetas-dim'}>
            {unitCount} · -{maintenance}g
          </span>
        </div>
      )}
    </div>
  )
}
