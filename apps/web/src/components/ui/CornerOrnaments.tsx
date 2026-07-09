interface Props {
  color?: string
}

/** Four L-shaped corner ornaments for a highlighted card (parent must be `position: relative`). */
export function CornerOrnaments({ color = 'var(--color-aetas-parchment)' }: Props) {
  return (
    <>
      {['top-0 left-0', 'top-0 right-0 rotate-90', 'bottom-0 right-0 rotate-180', 'bottom-0 left-0 -rotate-90'].map((pos, i) => (
        <svg key={i} className={`absolute ${pos} w-4 h-4 pointer-events-none`} viewBox="0 0 16 16"
          fill="none" stroke={color} strokeWidth="1.5">
          <path d="M1 15 L1 1 L15 1" />
        </svg>
      ))}
    </>
  )
}

export default CornerOrnaments
