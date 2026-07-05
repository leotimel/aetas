export const RESOURCE_ICONS: Record<string, JSX.Element> = {
  gold: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-aetas-gold)" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="10" cy="10" r="7" />
      <text x="10" y="14" textAnchor="middle" fontSize="8" fontFamily="Cinzel,Georgia,serif" fill="var(--color-aetas-gold)" stroke="none">G</text>
    </svg>
  ),
  food: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-aetas-gold)" strokeWidth="1.5" strokeLinecap="round">
      <rect x="4" y="9" width="12" height="8" rx="1" opacity="0.7" />
      <line x1="4" y1="12" x2="16" y2="12" opacity="0.5" />
      <line x1="7" y1="9" x2="5" y2="4" /><line x1="10" y1="9" x2="10" y2="3" /><line x1="13" y1="9" x2="15" y2="4" />
    </svg>
  ),
  production: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-aetas-gold)" strokeWidth="1.5" strokeLinecap="round">
      <rect x="5" y="6" width="10" height="5" rx="0.5" opacity="0.7" />
      <polygon points="6,11 14,11 13,16 7,16" fill="none" opacity="0.7" />
      <line x1="10" y1="3" x2="10" y2="6" />
    </svg>
  ),
}

interface Props {
  icon:   'gold' | 'food' | 'production'
  value:  number
  delta?: number
}

/** Icon + value (+ optional per-turn delta), per AETAS-design-spec.md §2. */
export function ResourceChip({ icon, value, delta }: Props) {
  return (
    <div className="flex items-center gap-1.5 bg-aetas-raised rounded-sm px-2 py-1">
      {RESOURCE_ICONS[icon]}
      <span className="text-aetas-gold-bright text-sm font-bold">{value}</span>
      {delta !== undefined && (
        <span className="text-aetas-positive text-xs font-medium">
          {delta >= 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
  )
}

export default ResourceChip
