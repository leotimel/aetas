export default function TerrainPatterns() {
  return (
    <>
      {/* ── Shared radial vignette: bright centre → dark edge ── */}
      <radialGradient id="hex-vignette" cx="50%" cy="42%" r="62%" gradientUnits="objectBoundingBox">
        <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.20" />
        <stop offset="55%"  stopColor="#ffffff" stopOpacity="0.00" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.30" />
      </radialGradient>

      {/* ── Micro-icon symbols ── */}
      <symbol id="icon-forest" viewBox="0 0 14 16" overflow="visible">
        <polygon points="7,1 1,9 13,9"   fill="#2a6a38" />
        <polygon points="7,5 0,16 14,16" fill="#1e4d2b" />
        <rect x="5.5" y="15" width="3" height="3" fill="#4a3020" />
      </symbol>

      <symbol id="icon-mountain" viewBox="0 0 16 12" overflow="visible">
        <polygon points="8,0 0,12 16,12" fill="#4e6070" />
        <polygon points="8,0 5,4 11,4"  fill="#d8e8f0" />
      </symbol>

      {/* Plains — warm green */}
      <pattern id="terrain-plains" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="#7a9e4e" />
        <line x1="3"    y1="11" x2="3"    y2="14" stroke="#5a7a33" strokeWidth="1" />
        <line x1="4.5"  y1="10" x2="4.5"  y2="13" stroke="#5a7a33" strokeWidth="1" />
        <line x1="6"    y1="11" x2="6"    y2="14" stroke="#5a7a33" strokeWidth="1" />
        <line x1="11"   y1="3"  x2="11"   y2="6"  stroke="#5a7a33" strokeWidth="1" />
        <line x1="12.5" y1="2"  x2="12.5" y2="5"  stroke="#5a7a33" strokeWidth="1" />
        <line x1="14"   y1="3"  x2="14"   y2="6"  stroke="#5a7a33" strokeWidth="1" />
      </pattern>

      {/* Forest — dark blue-green */}
      <pattern id="terrain-forest" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="#1e4d2b" />
        <polygon points="4,13 1.5,16 6.5,16" fill="#142e1a" fillOpacity="0.85" />
        <polygon points="4,10 2.5,13 5.5,13" fill="#2a6a38" fillOpacity="0.60" />
        <polygon points="12,5 9.5,9 14.5,9"  fill="#142e1a" fillOpacity="0.85" />
        <polygon points="12,2 10.5,5 13.5,5" fill="#2a6a38" fillOpacity="0.60" />
      </pattern>

      {/* Mountain — bluish gray with bright snow caps */}
      <pattern id="terrain-mountain" x="0" y="0" width="20" height="16" patternUnits="userSpaceOnUse">
        <rect width="20" height="16" fill="#6b7d8f" />
        <polyline points="0,15 5,6 10,15"  fill="none" stroke="#506070" strokeWidth="1.5" />
        <polyline points="10,15 15,4 20,15" fill="none" stroke="#506070" strokeWidth="1.5" />
        {/* snow caps */}
        <polyline points="4,8 5,6 6,8"    fill="none" stroke="#d0dce8" strokeWidth="1.2" />
        <polyline points="14,6 15,4 16,6"  fill="none" stroke="#d0dce8" strokeWidth="1.2" />
      </pattern>

      {/* Hills — sandy brown */}
      <pattern id="terrain-hills" x="0" y="0" width="20" height="14" patternUnits="userSpaceOnUse">
        <rect width="20" height="14" fill="#8b6f47" />
        <path d="M0,11 Q5,5 10,11 Q15,17 20,11"  fill="none" stroke="#6a5235" strokeWidth="1.5" />
        <path d="M0,7  Q5,1 10,7  Q15,13 20,7"   fill="none" stroke="#6a5235" strokeWidth="1"   strokeOpacity="0.45" />
      </pattern>

      {/* Water — keep blue with wave animation */}
      <pattern id="terrain-water" x="0" y="0" width="20" height="12" patternUnits="userSpaceOnUse">
        <rect width="20" height="12" fill="#1a5270" />
        <path d="M0,4 Q5,2 10,4 Q15,6 20,4"  fill="none" stroke="#0e3a52" strokeWidth="1.5" />
        <path d="M0,8 Q5,6 10,8 Q15,10 20,8" fill="none" stroke="#0e3a52" strokeWidth="1.5" />
        <path d="M0,4 Q5,2 10,4 Q15,6 20,4"  fill="none" stroke="#2a7090" strokeWidth="0.5" strokeOpacity="0.55" />
        <animateTransform
          attributeName="patternTransform"
          type="translate"
          from="0 0"
          to="20 0"
          dur="5s"
          repeatCount="indefinite"
        />
      </pattern>
    </>
  )
}
