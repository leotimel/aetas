import { useState } from 'react'
import { getCiv } from '@aetas/game-engine'

interface Props {
  civId: string
  size?: number
}

const GOLD_RING = 'conic-gradient(#c9a44e,#8a6a26,#f0d488,#8a6a26,#c9a44e)'

/**
 * Round leader medallion (AETAS-design-spec-2.md §D.1): gold conic-gradient
 * ring around a portrait. Real art at /leaders/{portraitId}.png doesn't exist
 * yet (dropped in manually later per the playbook note) — the SVG bust
 * silhouette underneath is the normal state today, not a rare fallback, so
 * it renders unconditionally and the `<img>` only covers it once loaded.
 */
export function LeaderPortrait({ civId, size = 60 }: Props) {
  const civ = getCiv(civId)
  const [imgLoaded, setImgLoaded] = useState(false)

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          padding: Math.max(2, size * 0.04),
          background: GOLD_RING,
        }}
      >
        <div
          style={{
            width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', position: 'relative',
            background: `radial-gradient(circle at 50% 25%, ${civ.color}, #1a1206)`,
          }}
        >
          {/* Bust silhouette placeholder — always rendered; covered by the real portrait once it loads. */}
          <svg
            viewBox="0 0 60 60"
            width="100%" height="100%"
            style={{ position: 'absolute', inset: 0, opacity: imgLoaded ? 0 : 1 }}
          >
            <circle cx="30" cy="22" r="11" fill={civ.colorLight} opacity="0.85" />
            <path
              d="M10 58 C10 42 18 34 30 34 C42 34 50 42 50 58 Z"
              fill={civ.colorLight}
              opacity="0.85"
            />
          </svg>
          <img
            src={`/leaders/${civ.portraitId}.png`}
            alt=""
            width="100%" height="100%"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: imgLoaded ? 1 : 0 }}
            onLoad={() => setImgLoaded(true)}
            onError={e => { e.currentTarget.style.display = 'none' }}
          />
        </div>
      </div>
    </div>
  )
}

export default LeaderPortrait
