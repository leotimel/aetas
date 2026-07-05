import { useTranslation } from 'react-i18next'
import type { WorldEventType } from '@aetas/game-engine'

export interface EventToastItem {
  id:    string
  type:  WorldEventType
  city?: string
  turns?: number
}

type EventKey = 'event.barbarians' | 'event.plague' | 'event.goldenAge'

const EVENT_KEYS: Record<WorldEventType, EventKey> = {
  barbarians: 'event.barbarians',
  plague:     'event.plague',
  goldenAge:  'event.goldenAge',
}

interface Props { toasts: EventToastItem[] }

export default function EventToast({ toasts }: Props) {
  const { t } = useTranslation()

  if (toasts.length === 0) return null
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(item => (
        <div
          key={item.id}
          className="bg-aetas-panel/95 border border-aetas-gold/40 rounded-xl px-4 py-2 shadow-lg backdrop-blur-sm anim-xp-toast text-center"
        >
          <span className="text-aetas-gold text-sm font-medium">
            {t(EVENT_KEYS[item.type], { city: item.city ?? '', turns: item.turns ?? 0 })}
          </span>
        </div>
      ))}
    </div>
  )
}
