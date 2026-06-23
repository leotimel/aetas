interface Props {
  targetCivName: string
  hasPact:       boolean
  onConfirm:     () => void
  onCancel:      () => void
  isLoading?:    boolean
}

export default function DeclareWarModal({ targetCivName, hasPact, onConfirm, onCancel, isLoading }: Props) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      <div className="fixed inset-x-0 bottom-0 z-40 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-80">
        <div className="bg-aetas-surface border border-red-900/60 rounded-t-2xl md:rounded-2xl shadow-2xl shadow-black/60 p-5">
          <h2 className="font-display text-red-300 text-base font-bold mb-2">⚔️ Declarar Guerra</h2>
          <p className="text-aetas-text text-sm mb-2">
            Declarar guerra aos <strong>{targetCivName}</strong>?
          </p>
          <div className="bg-red-950/50 border border-red-900/50 rounded-xl p-3 mb-4">
            <p className="text-red-300/90 text-xs leading-relaxed">
              {hasPact && 'O Pacto de Não-Agressão será rompido. '}
              Suas unidades poderão atacar os {targetCivName} e vice-versa. Esta ação não pode
              ser desfeita sem uma proposta de paz aceita.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-aetas-border text-aetas-muted text-sm hover:bg-aetas-raised transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl bg-red-800 text-red-100 text-sm font-bold
                         disabled:opacity-40 disabled:cursor-not-allowed
                         hover:bg-red-700 active:bg-red-900 transition-colors"
            >
              {isLoading ? 'Declarando…' : 'Declarar Guerra'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
