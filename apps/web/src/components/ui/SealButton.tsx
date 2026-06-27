import type { CSSProperties, ReactNode } from 'react'

interface Props {
  variant?: 'gold' | 'red'
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  disabled?: boolean
  children?: ReactNode
  className?: string
  type?: 'button' | 'submit'
}

const GRADIENT: Record<'gold' | 'red', string> = {
  gold: 'radial-gradient(circle at 35% 35%, #e8c97a 0%, #a87828 50%, #8f6b20 100%)',
  red:  'radial-gradient(circle at 35% 35%, #c94a4a 0%, #8b1a1a 50%, #7a1a1a 100%)',
}

const SHADOW: Record<'gold' | 'red', string> = {
  gold: '0 4px 16px rgba(201,168,76,0.40), inset 0 1px 0 rgba(232,201,122,0.30)',
  red:  '0 4px 16px rgba(139,26,26,0.40), inset 0 1px 0 rgba(201,74,74,0.30)',
}

const BORDER_COLOR: Record<'gold' | 'red', string> = {
  gold: 'rgba(201,168,76,0.65)',
  red:  'rgba(201,74,74,0.65)',
}

const OUTLINE_COLOR: Record<'gold' | 'red', string> = {
  gold: 'rgba(201,168,76,0.18)',
  red:  'rgba(201,74,74,0.18)',
}

const SIZE_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-10 h-10 text-xs',
  md: 'w-14 h-14 text-sm',
  lg: 'w-24 h-24 text-xl',
}

export function SealButton({
  variant = 'gold',
  size = 'md',
  onClick,
  disabled = false,
  children,
  className = '',
  type = 'button',
}: Props) {
  const style: CSSProperties = {
    background:  GRADIENT[variant],
    boxShadow:   SHADOW[variant],
    border:      `1.5px solid ${BORDER_COLOR[variant]}`,
    outline:     `1px solid ${OUTLINE_COLOR[variant]}`,
    outlineOffset: '-3px',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={[
        'rounded-full flex items-center justify-center font-display font-semibold',
        'text-aetas-text leading-none select-none',
        'transition-all duration-150',
        'hover:brightness-110 hover:scale-[1.03]',
        'active:scale-[0.97] active:brightness-95',
        disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
        SIZE_CLASS[size],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export default SealButton
