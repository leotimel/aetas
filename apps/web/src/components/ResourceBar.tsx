import type { Resources } from '@aetas/game-engine'

interface Props {
  resources: Resources
  income: Resources
}

const ITEMS = [
  { key: 'gold'       as const, icon: '🏅', label: 'Ouro' },
  { key: 'food'       as const, icon: '🌾', label: 'Comida' },
  { key: 'production' as const, icon: '⚙',  label: 'Produção' },
]

export default function ResourceBar({ resources, income }: Props) {
  return (
    <div className="flex items-center justify-center gap-5 px-3 py-1.5 bg-aetas-raised border-b border-aetas-border text-xs flex-shrink-0">
      {ITEMS.map(({ key, icon, label }) => (
        <div key={key} className="flex items-center gap-1" title={label}>
          <span>{icon}</span>
          <span className="text-aetas-text font-medium">{resources[key]}</span>
          <span className="text-emerald-400">(+{income[key]})</span>
        </div>
      ))}
    </div>
  )
}
