import { Era, unitsForCiv } from '@aetas/game-engine'

// ─── Era constants (exported for reuse in other components) ───────────────────

export const ERA_NAMES_PT: Record<Era, string> = {
  [Era.Ancient]:   'Idade Antiga',
  [Era.Classical]: 'Idade Clássica',
  [Era.Medieval]:  'Idade Medieval',
}

export const ERA_ICONS: Record<Era, string> = {
  [Era.Ancient]:   '🏛️',
  [Era.Classical]: '📜',
  [Era.Medieval]:  '⚔️',
}

export const ERA_ORDER_UI: readonly Era[] = [Era.Ancient, Era.Classical, Era.Medieval]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  era:      Era
  prevEra:  Era
  myCivId:  string
  onClose:  () => void
}

export default function EraModal({ era, prevEra, myCivId, onClose }: Props) {
  const prevUnits = unitsForCiv(myCivId, prevEra)
  const newUnits  = unitsForCiv(myCivId, era)
  const prevTypes = new Set(prevUnits.map(u => u.type))
  const unlocked  = newUnits.filter(u => !prevTypes.has(u.type))

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-40 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[24rem]">
        <div className="anim-era-advance bg-aetas-surface border border-aetas-border-strong rounded-t-2xl md:rounded-2xl shadow-2xl shadow-black/60 p-5">

          {/* Header */}
          <div className="text-center mb-4">
            <p className="text-aetas-gold text-sm font-medium tracking-widest uppercase mb-1">✨ Nova Era Desbloqueada!</p>
            <div className="inline-flex items-center gap-2 bg-aetas-raised border border-aetas-border-strong rounded-full px-4 py-1.5 mt-1">
              <span className="text-2xl">{ERA_ICONS[era]}</span>
              <span className="font-display text-aetas-text text-lg font-bold">{ERA_NAMES_PT[era]}</span>
            </div>
          </div>

          {/* Unlocked units */}
          {unlocked.length > 0 ? (
            <div className="mb-4">
              <p className="text-[10px] text-aetas-dim uppercase tracking-wider mb-2">Unidades desbloqueadas</p>
              <div className="space-y-1.5">
                {unlocked.map(def => (
                  <div key={def.type} className="flex items-center gap-3 bg-aetas-raised rounded-xl p-2.5 border border-aetas-border">
                    <div className="flex-1">
                      <p className="text-aetas-text text-xs font-semibold capitalize">{def.name}</p>
                      <p className="text-aetas-dim text-[10px] mt-0.5 line-clamp-1">{def.description}</p>
                    </div>
                    <div className="flex gap-1.5 text-[9px] text-aetas-muted">
                      <span className="bg-aetas-bg rounded px-1 py-0.5">⚔{def.stats.attack}</span>
                      <span className="bg-aetas-bg rounded px-1 py-0.5">🛡{def.stats.defense}</span>
                      <span className="bg-aetas-bg rounded px-1 py-0.5">❤{def.stats.maxHp}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-aetas-dim text-xs text-center mb-4">
              Novas possibilidades desbloqueadas nesta era.
            </p>
          )}

          {/* CTA */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-aetas-gold text-aetas-bg text-sm font-bold hover:bg-aetas-gold-light active:bg-aetas-gold-dark transition-colors"
          >
            Continuar →
          </button>
        </div>
      </div>
    </>
  )
}
