import { CIVILIZATIONS } from '@aetas/game-engine'

interface Props {
  civId: string
  size?: number
}

const FALLBACK_COLOR = '#c9a84c' // aetas-gold
const FALLBACK_FLAG  = '🏛️'

/**
 * Winged-shield crest (AETAS-design-spec.md §6), tinted by the civ's own
 * color and centered on its flag emoji — reuses the same differentiator
 * already used everywhere else in the UI instead of hand-drawing 10 crests.
 * Gradient id is namespaced by civId so multiple crests can render together
 * (e.g. a leader picker) without id collisions.
 */
export function CivCrest({ civId, size = 44 }: Props) {
  const civ = CIVILIZATIONS.find(c => c.id === civId)
  const color = civ?.color ?? FALLBACK_COLOR
  const flag = civ?.flag ?? FALLBACK_FLAG
  const gradientId = `crest-${civId}`
  const height = Math.round(size * 58 / 52)

  return (
    <svg width={size} height={height} viewBox="0 0 52 58">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="1" />
          <stop offset="1" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <path
        d="M26 2 L48 10 V30 C48 44 38 52 26 56 C14 52 4 44 4 30 V10 Z"
        fill="#1a1206"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.5"
      />
      <text x="26" y="29" textAnchor="middle" fontSize={size * 0.4}>{flag}</text>
    </svg>
  )
}

export default CivCrest
