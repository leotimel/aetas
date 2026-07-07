import type { ReactNode } from 'react'

interface Props {
  open:     boolean
  title:    string
  onClose:  () => void
  children: ReactNode
}

/**
 * Generic bottom-sheet: dim backdrop + slide-up panel on mobile, centered on
 * desktop. Modeled on the FoundCityModal pattern. Renders nothing when closed.
 */
export function BottomSheet({ open, title, onClose, children }: Props) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-96">
        <div className="bg-aetas-surface border border-aetas-border-strong rounded-t-2xl md:rounded-2xl shadow-2xl shadow-black/60 max-h-[85dvh] overflow-y-auto">
          <div className="sticky top-0 bg-aetas-surface flex items-center justify-between px-5 pt-4 pb-3 border-b border-aetas-border">
            <h2 className="font-display text-aetas-gold text-base font-semibold tracking-wide">{title}</h2>
            <button
              onClick={onClose}
              className="text-aetas-muted hover:text-aetas-text transition-colors text-lg leading-none"
            >✕</button>
          </div>
          <div className="px-5 py-4">
            {children}
          </div>
        </div>
      </div>
    </>
  )
}

export default BottomSheet
