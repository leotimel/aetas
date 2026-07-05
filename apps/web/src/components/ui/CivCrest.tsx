import { CIVILIZATIONS } from '@aetas/game-engine'

interface Props {
  civId: string
  size?: number
  variant?: 'shield' | 'star'
}

const FALLBACK_COLOR = '#c9a84c' // aetas-gold
const FALLBACK_FLAG  = '🏛️'

// 5-point star centered at (26,26), outer r=11 / inner r=4.5 — used by the
// 'star' variant (a simpler round profile badge, per spec §6's "emblema de
// estrela" note).
const STAR_PATH = 'M26 15 L28.64 22.36 L36.46 22.60 L30.28 27.39 L32.47 34.90 '
  + 'L26 30.5 L19.53 34.90 L21.72 27.39 L15.54 22.60 L23.35 22.36 Z'

/**
 * Civ crest, tinted by the civ's own color — reuses the same differentiator
 * already used everywhere else in the UI instead of hand-drawing 10 crests.
 * Gradient id is namespaced by civId so multiple crests can render together
 * (e.g. a leader picker) without id collisions.
 *
 * - 'shield' (default): winged-shield outline centered on the civ's flag
 *   emoji (AETAS-design-spec.md §6).
 * - 'star': simpler round profile badge — circle + 5-point star, both in
 *   the same gradient (spec §6's "emblema de estrela").
 */
export function CivCrest({ civId, size = 44, variant = 'shield' }: Props) {
  const civ = CIVILIZATIONS.find(c => c.id === civId)
  const color = civ?.color ?? FALLBACK_COLOR
  const flag = civ?.flag ?? FALLBACK_FLAG
  const gradientId = `crest-${civId}-${variant}`

  if (variant === 'star') {
    return (
      <svg width={size} height={size} viewBox="0 0 52 52">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="1" />
            <stop offset="1" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
        </defs>
        <circle cx="26" cy="26" r="24" fill="#1a1206" stroke={`url(#${gradientId})`} strokeWidth="2.5" />
        <path d={STAR_PATH} fill={`url(#${gradientId})`} />
      </svg>
    )
  }

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
