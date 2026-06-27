import { useTranslation } from 'react-i18next'
import type { Resources } from '@aetas/game-engine'

interface Props {
  resources: Resources
  income:    Resources
}

export default function ResourceBar({ resources, income }: Props) {
  const { t } = useTranslation()

  const ITEMS = [
    { key: 'gold'       as const, icon: '🏅', label: t('resource.gold') },
    { key: 'food'       as const, icon: '🌾', label: t('resource.food') },
    { key: 'production' as const, icon: '⚙',  label: t('resource.production') },
  ]

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
    </div>
  )
}
