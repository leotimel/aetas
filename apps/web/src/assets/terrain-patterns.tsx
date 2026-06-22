export default function TerrainPatterns() {
  return (
    <>
      {/* Plains — fundo verde-oliva com traços de grama */}
      <pattern id="terrain-plains" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="#6b8c3e" />
        <line x1="3"   y1="11" x2="3"   y2="14" stroke="#4e6b28" strokeWidth="1" />
        <line x1="4.5" y1="10" x2="4.5" y2="13" stroke="#4e6b28" strokeWidth="1" />
        <line x1="6"   y1="11" x2="6"   y2="14" stroke="#4e6b28" strokeWidth="1" />
        <line x1="11"  y1="3"  x2="11"  y2="6"  stroke="#4e6b28" strokeWidth="1" />
        <line x1="12.5" y1="2" x2="12.5" y2="5" stroke="#4e6b28" strokeWidth="1" />
        <line x1="14"  y1="3"  x2="14"  y2="6"  stroke="#4e6b28" strokeWidth="1" />
      </pattern>

      {/* Forest — fundo verde-escuro com triângulos de copa */}
      <pattern id="terrain-forest" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="#234a1f" />
        <polygon points="4,13 1.5,16 6.5,16" fill="#1a3516" fillOpacity="0.85" />
        <polygon points="4,10 2.5,13 5.5,13" fill="#2d5c26" fillOpacity="0.55" />
        <polygon points="12,5 9.5,9 14.5,9"  fill="#1a3516" fillOpacity="0.85" />
        <polygon points="12,2 10.5,5 13.5,5" fill="#2d5c26" fillOpacity="0.55" />
      </pattern>

      {/* Mountain — base cinza-pedra com linhas em V (picos) */}
      <pattern id="terrain-mountain" x="0" y="0" width="20" height="16" patternUnits="userSpaceOnUse">
        <rect width="20" height="16" fill="#5a5668" />
        <polyline points="0,15 5,6 10,15"  fill="none" stroke="#46425a" strokeWidth="1.5" />
        <polyline points="10,15 15,4 20,15" fill="none" stroke="#46425a" strokeWidth="1.5" />
        {/* cumes com leve claridade */}
        <polyline points="4,8 5,6 6,8"    fill="none" stroke="#8a8698" strokeWidth="1" />
        <polyline points="14,6 15,4 16,6"  fill="none" stroke="#8a8698" strokeWidth="1" />
      </pattern>

      {/* Hills — marrom quente com arcos suaves */}
      <pattern id="terrain-hills" x="0" y="0" width="20" height="14" patternUnits="userSpaceOnUse">
        <rect width="20" height="14" fill="#8c6e3a" />
        <path d="M0,11 Q5,5 10,11 Q15,17 20,11"  fill="none" stroke="#6e5228" strokeWidth="1.5" />
        <path d="M0,7  Q5,1 10,7  Q15,13 20,7"   fill="none" stroke="#6e5228" strokeWidth="1"   strokeOpacity="0.45" />
      </pattern>

      {/* Water — azul-teal com ondas animadas */}
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
