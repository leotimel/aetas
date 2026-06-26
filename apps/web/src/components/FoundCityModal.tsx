import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CitySpecialization } from '@aetas/game-engine'

const SPEC_ICON: Record<string, string> = {
  [CitySpecialization.Military]:   '⚔️',
  [CitySpecialization.Commercial]: '💰',
  [CitySpecialization.Scientific]: '🔬',
}

const SPECS = [CitySpecialization.Military, CitySpecialization.Commercial, CitySpecialization.Scientific]

type SpecKey = 'city.spec.military' | 'city.spec.commercial' | 'city.spec.scientific'
type SpecDescKey = 'city.spec.militaryDesc' | 'city.spec.commercialDesc' | 'city.spec.scientificDesc'

const SPEC_LABEL_KEY: Record<string, SpecKey> = {
  [CitySpecialization.Military]:   'city.spec.military',
  [CitySpecialization.Commercial]: 'city.spec.commercial',
  [CitySpecialization.Scientific]: 'city.spec.scientific',
}

const SPEC_DESC_KEY: Record<string, SpecDescKey> = {
  [CitySpecialization.Military]:   'city.spec.militaryDesc',
  [CitySpecialization.Commercial]: 'city.spec.commercialDesc',
  [CitySpecialization.Scientific]: 'city.spec.scientificDesc',
}

interface Props {
  onConfirm: (specialization: CitySpecialization) => void
  onCancel: () => void
  isLoading?: boolean
}

export default function FoundCityModal({ onConfirm, onCancel, isLoading }: Props) {
  const { t } = useTranslation()
  const [spec, setSpec] = useState<CitySpecialization | null>(null)

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      <div className="fixed inset-x-0 bottom-0 z-40 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-80">
        <div className="bg-aetas-surface border border-aetas-border-strong rounded-t-2xl md:rounded-2xl shadow-2xl shadow-black/60 p-5">
          <h2 className="font-display text-aetas-text text-base font-bold mb-1">{t('city.foundTitle')}</h2>
          <p className="text-aetas-dim text-xs mb-4">{t('city.foundDesc')}</p>

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
                    {t(SPEC_LABEL_KEY[s])}
                  </p>
                  <p className="text-aetas-dim text-xs">{t(SPEC_DESC_KEY[s])}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-aetas-border text-aetas-muted text-sm hover:bg-aetas-raised transition-colors"
            >
              {t('ui.cancel')}
            </button>
            <button
              onClick={() => spec && onConfirm(spec)}
              disabled={!spec || isLoading}
              className="flex-1 py-2.5 rounded-xl bg-aetas-gold text-aetas-bg text-sm font-bold
                         disabled:opacity-40 disabled:cursor-not-allowed
                         hover:bg-aetas-gold-light active:bg-aetas-gold-dark transition-colors"
            >
              {isLoading ? t('city.founding') : t('ui.confirm')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
