import { useState } from 'react'
import type { Resources } from '@aetas/game-engine'

interface Props {
  proposerResources: Resources
  targetResources:   Resources
  targetCivName:     string
  onConfirm:         (offer: Resources, request: Resources) => void
  onCancel:          () => void
  isLoading?:        boolean
}

const RES_META: { key: keyof Resources; icon: string; label: string }[] = [
  { key: 'gold',       icon: '🪙', label: 'Ouro' },
  { key: 'food',       icon: '🌾', label: 'Comida' },
  { key: 'production', icon: '⚙️', label: 'Produção' },
]

const EMPTY: Resources = { gold: 0, food: 0, production: 0 }

function total(r: Resources): number {
  return r.gold + r.food + r.production
}

function ResourceSlider({
  icon, label, value, max, onChange,
}: { icon: string; label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-aetas-dim text-[11px] flex items-center gap-1">{icon} {label}</span>
      <input
        type="range"
        min={0}
        max={Math.max(0, max)}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        disabled={max <= 0}
        className="flex-1 accent-aetas-gold disabled:opacity-30"
      />
      <span className="w-7 text-right text-aetas-text text-xs font-medium tabular-nums">{value}</span>
    </div>
  )
}

export default function TradeModal({
  proposerResources, targetResources, targetCivName, onConfirm, onCancel, isLoading,
}: Props) {
  const [offer, setOffer] = useState<Resources>(EMPTY)
  const [request, setRequest] = useState<Resources>(EMPTY)

  const setOfferKey = (k: keyof Resources, v: number) => setOffer(o => ({ ...o, [k]: v }))
  const setRequestKey = (k: keyof Resources, v: number) => setRequest(r => ({ ...r, [k]: v }))

  const isTrivial = total(offer) === 0 && total(request) === 0

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      <div className="fixed inset-x-0 bottom-0 z-40 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[22rem]">
        <div className="bg-aetas-surface border border-aetas-border-strong rounded-t-2xl md:rounded-2xl shadow-2xl shadow-black/60 p-5">
          <h2 className="font-display text-aetas-text text-base font-bold mb-1">📦 Propor Troca</h2>
          <p className="text-aetas-dim text-xs mb-4">Negociando com os <strong>{targetCivName}</strong></p>

          {/* Offer */}
          <div className="bg-aetas-raised rounded-xl p-3 mb-3 border border-aetas-border">
            <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-2">Você oferece</p>
            <div className="flex flex-col gap-2">
              {RES_META.map(m => (
                <ResourceSlider
                  key={m.key}
                  icon={m.icon} label={m.label}
                  value={offer[m.key]}
                  max={proposerResources[m.key]}
                  onChange={v => setOfferKey(m.key, v)}
                />
              ))}
            </div>
          </div>

          {/* Request */}
          <div className="bg-aetas-raised rounded-xl p-3 mb-4 border border-aetas-border">
            <p className="text-[10px] text-amber-400 uppercase tracking-wider mb-2">Você pede</p>
            <div className="flex flex-col gap-2">
              {RES_META.map(m => (
                <ResourceSlider
                  key={m.key}
                  icon={m.icon} label={m.label}
                  value={request[m.key]}
                  max={targetResources[m.key]}
                  onChange={v => setRequestKey(m.key, v)}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-aetas-border text-aetas-muted text-sm hover:bg-aetas-raised transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(offer, request)}
              disabled={isTrivial || isLoading}
              className="flex-1 py-2.5 rounded-xl bg-aetas-gold text-aetas-bg text-sm font-bold
                         disabled:opacity-40 disabled:cursor-not-allowed
                         hover:bg-aetas-gold-light active:bg-aetas-gold-dark transition-colors"
            >
              {isLoading ? 'Propondo…' : 'Propor Troca'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
