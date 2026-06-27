import { useTranslation } from 'react-i18next'
import type { Resources } from '@aetas/game-engine'

/** Mirrors UNIT_MAINTENANCE_GOLD in the engine (gold per unit per turn). */
const MAINTENANCE_PER_UNIT = 1

interface Props {
  resources: Resources
  income:    Resources
  unitCount: number
}

function GoldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--color-aetas-gold)" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="10" cy="10" r="7" />
      <text x="10" y="14" textAnchor="middle" fontSize="7" fontFamily="Cinzel,Georgia,serif" fill="var(--color-aetas-gold)" stroke="none">G</text>
    </svg>
  )
}

function FoodIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--color-aetas-gold)" strokeWidth="1.5" strokeLinecap="round" opacity="0.8">
      <rect x="4" y="9" width="12" height="8" rx="1" />
      <line x1="4" y1="12" x2="16" y2="12" opacity="0.6" />
      <line x1="7" y1="9" x2="5" y2="4" /><line x1="10" y1="9" x2="10" y2="3" /><line x1="13" y1="9" x2="15" y2="4" />
    </svg>
  )
}

function ProdIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--color-aetas-gold)" strokeWidth="1.5" strokeLinecap="round" opacity="0.8">
      <rect x="5" y="6" width="10" height="5" rx="0.5" />
      <polygon points="6,11 14,11 13,16 7,16" fill="none" />
      <line x1="10" y1="3" x2="10" y2="6" />
    </svg>
  )
}

function MaintenanceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="rgba(201,68,68,0.85)" strokeWidth="1.5" strokeLinecap="round">
      <path d="M10 2 L16 5 L16 11 C16 15 10 18 10 18 C10 18 4 15 4 11 L4 5 Z" />
      <line x1="7" y1="9" x2="13" y2="13" /><line x1="13" y1="9" x2="7" y2="13" />
    </svg>
  )
}

const ICONS = {
  gold:       <GoldIcon />,
  food:       <FoodIcon />,
  production: <ProdIcon />,
}

export default function ResourceBar({ resources, income, unitCount }: Props) {
  const { t } = useTranslation()

  const ITEMS = [
    { key: 'gold'       as const, label: t('resource.gold') },
    { key: 'food'       as const, label: t('resource.food') },
    { key: 'production' as const, label: t('resource.production') },
  ]

  const maintenance = unitCount * MAINTENANCE_PER_UNIT

  return (
    <div className="flex items-center justify-center gap-6 px-3 py-2 bg-aetas-panel border-b border-aetas-gold/20 text-xs flex-shrink-0">
      {ITEMS.map(({ key, label }) => {
        const inc = income[key]
        return (
          <div key={key} className="flex items-center gap-1.5" title={label}>
            {ICONS[key]}
            <span className="text-aetas-text font-semibold">{resources[key]}</span>
            <span className={inc >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {inc >= 0 ? `+${inc}` : `${inc}`}
            </span>
          </div>
        )
      })}

      {unitCount > 0 && (
        <div className="flex items-center gap-1.5" title={t('resource.maintenance')}>
          <MaintenanceIcon />
          <span className={resources.gold < maintenance ? 'text-red-400' : 'text-aetas-dim'}>
            {unitCount} · -{maintenance}g
          </span>
        </div>
      )}
    </div>
  )
}
