export interface XpToastItem { id: string; event: string; xpGained: number }

const EVENT_LABELS: Record<string, string> = {
  turn_played:          'Turno jogado',
  era_advanced:         'Era avançada!',
  building_constructed: 'Edifício construído',
  civ_eliminated:       'Civilização eliminada!',
  city_founded:         'Cidade fundada!',
  combat_won:           'Combate vencido!',
}

interface Props { toasts: XpToastItem[] }

export default function XpToast({ toasts }: Props) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-28 md:bottom-20 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="flex items-center gap-2 bg-emerald-950/90 border border-emerald-600/40 rounded-xl px-3 py-2 shadow-lg backdrop-blur-sm anim-xp-toast"
        >
          <span className="text-emerald-300 font-bold text-sm">+{t.xpGained} XP</span>
          <span className="text-emerald-100/70 text-sm">— {EVENT_LABELS[t.event] ?? t.event}</span>
        </div>
      ))}
    </div>
  )
}
