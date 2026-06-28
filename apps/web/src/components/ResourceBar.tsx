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
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* Coin: filled circle with ring */}
      <circle cx="10" cy="10" r="7" fill="var(--color-aetas-gold)" opacity="0.25" stroke="var(--color-aetas-gold)" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="4" fill="none" stroke="var(--color-aetas-gold)" strokeWidth="1" opacity="0.7" />
    </svg>
  )
}

function FoodIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--color-aetas-gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85">
      {/* Wheat stalk: vertical stem + 3 grain pairs */}
      <line x1="10" y1="18" x2="10" y2="4" />
      <ellipse cx="7" cy="13" rx="2.5" ry="1.5" transform="rotate(-30 7 13)" />
      <ellipse cx="13" cy="13" rx="2.5" ry="1.5" transform="rotate(30 13 13)" />
      <ellipse cx="7" cy="9" rx="2.5" ry="1.5" transform="rotate(-30 7 9)" />
      <ellipse cx="13" cy="9" rx="2.5" ry="1.5" transform="rotate(30 13 9)" />
    </svg>
  )
}

function ProdIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--color-aetas-gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85">
      {/* Hammer */}
      <rect x="4" y="4" width="8" height="5" rx="1" fill="var(--color-aetas-gold)" fillOpacity="0.2" />
      <line x1="10" y1="9" x2="16" y2="17" strokeWidth="3" />
      <line x1="10" y1="9" x2="16" y2="17" stroke="var(--color-aetas-gold)" strokeWidth="2.5" />
    </svg>
  )
}

function MaintenanceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* Sword pointing down */}
      <line x1="10" y1="3" x2="10" y2="15" stroke="rgba(220,80,80,0.9)" strokeWidth="1.8" />
      <line x1="7" y1="9" x2="13" y2="9" stroke="rgba(220,80,80,0.9)" strokeWidth="1.8" />
      <path d="M8 15 L10 18 L12 15" stroke="rgba(220,80,80,0.9)" strokeWidth="1.5" fill="none" />
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
