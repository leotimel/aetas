import { useState } from 'react'
import { CitySpecialization } from '@aetas/game-engine'

const SPEC_ICON: Record<string, string> = {
  [CitySpecialization.Military]:   '⚔️',
  [CitySpecialization.Commercial]: '💰',
  [CitySpecialization.Scientific]: '🔬',
}

const SPEC_LABEL: Record<string, string> = {
  [CitySpecialization.Military]:   'Militar',
  [CitySpecialization.Commercial]: 'Comercial',
  [CitySpecialization.Scientific]: 'Científica',
}

const SPEC_DESC: Record<string, string> = {
  [CitySpecialization.Military]:   '+Produção, +Ataque de unidades',
  [CitySpecialization.Commercial]: '+Ouro, +Comércio',
  [CitySpecialization.Scientific]: '+Crescimento de população, +Era',
}

const SPECS = [CitySpecialization.Military, CitySpecialization.Commercial, CitySpecialization.Scientific]

interface Props {
  onConfirm: (specialization: CitySpecialization) => void
  onCancel: () => void
  isLoading?: boolean
}

export default function FoundCityModal({ onConfirm, onCancel, isLoading }: Props) {
  const [spec, setSpec] = useState<CitySpecialization | null>(null)

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      <div className="fixed inset-x-0 bottom-0 z-40 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-80">
        <div className="bg-aetas-surface border border-aetas-border-strong rounded-t-2xl md:rounded-2xl shadow-2xl shadow-black/60 p-5">
          <h2 className="font-display text-aetas-text text-base font-bold mb-1">Fundar Cidade</h2>
          <p className="text-aetas-dim text-xs mb-4">O Colono será consumido. Escolha a especialização:</p>

          <div className="flex flex-col gap-2 mb-5">
            {SPECS.map(s => (
              <button
                key={s}
                onClick={() => setSpec(s)}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                  spec === s
                    ? 'border-aetas-gold bg-aetas-gold/10'
                    : 'border-aetas-border bg-aetas-raised hover:bg-aetas-panel'
                }`}
              >
                <span className="text-xl leading-none">{SPEC_ICON[s]}</span>
                <div>
                  <p className={`text-sm font-medium ${spec === s ? 'text-aetas-gold' : 'text-aetas-text'}`}>
                    {SPEC_LABEL[s]}
                  </p>
                  <p className="text-aetas-dim text-xs">{SPEC_DESC[s]}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-aetas-border text-aetas-muted text-sm hover:bg-aetas-raised transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => spec && onConfirm(spec)}
              disabled={!spec || isLoading}
              className="flex-1 py-2.5 rounded-xl bg-aetas-gold text-aetas-bg text-sm font-bold
                         disabled:opacity-40 disabled:cursor-not-allowed
                         hover:bg-aetas-gold-light active:bg-aetas-gold-dark transition-colors"
            >
              {isLoading ? 'Fundando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
