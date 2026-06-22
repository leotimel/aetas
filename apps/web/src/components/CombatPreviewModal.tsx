import type { Unit, GameState } from '@aetas/game-engine'
import { resolveCombat, terrainAt, getCivCombatMultiplier, UNIT_CATALOG, SPECIAL_UNIT_CATALOG, UnitType } from '@aetas/game-engine'

interface Props {
  attacker: Unit
  defender: Unit
  attackerCivName: string
  defenderCivName: string
  gameState: GameState
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
}

function unitName(unitType: string): string {
  return (UNIT_CATALOG.get(unitType as UnitType) ?? SPECIAL_UNIT_CATALOG.get(unitType))?.name ?? unitType
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-aetas-bg rounded p-1 text-center">
      <p className="text-aetas-dim text-[9px]">{label}</p>
      <p className="text-aetas-text font-medium text-xs">{value}</p>
    </div>
  )
}

export default function CombatPreviewModal({
  attacker, defender, attackerCivName, defenderCivName,
  gameState, onConfirm, onCancel, isLoading,
}: Props) {
  const atkCivId = gameState.players.find(p => p.id === attacker.ownerId)?.civilizationId ?? ''
  const defCivId = gameState.players.find(p => p.id === defender.ownerId)?.civilizationId ?? ''

  const preview = resolveCombat(attacker, defender, {
    defenderTerrain:       terrainAt(gameState, defender.position),
    attackerTerrain:       terrainAt(gameState, attacker.position),
    defenderActiveDefense: false,
    attackerCivMultiplier: getCivCombatMultiplier(atkCivId),
    defenderCivMultiplier: getCivCombatMultiplier(defCivId),
  })

  const defDestroyed = preview.defenderDestroyed
  const atkDestroyed = preview.attackerDestroyed

  const outcomeLabel = defDestroyed
    ? 'Vitória prevista — inimigo eliminado'
    : atkDestroyed
      ? 'Derrota prevista — você será destruído'
      : 'Combate — ambos sobrevivem'

  const outcomeColor = defDestroyed
    ? 'border-emerald-800 bg-emerald-950/60 text-emerald-300'
    : atkDestroyed
      ? 'border-red-800 bg-red-950/60 text-red-300'
      : 'border-amber-800 bg-amber-950/60 text-amber-300'

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      <div className="fixed inset-x-0 bottom-0 z-40 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[22rem]">
        <div className="bg-aetas-surface border border-aetas-border-strong rounded-t-2xl md:rounded-2xl shadow-2xl shadow-black/60 p-5">
          <h2 className="font-display text-aetas-text text-base font-bold mb-3">Prévia de Combate</h2>

          {/* Combatants side by side */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {/* Attacker */}
            <div className="bg-aetas-raised rounded-xl p-2.5 border border-aetas-border">
              <p className="text-[9px] text-aetas-dim uppercase tracking-wider mb-1">Atacante</p>
              <p className="text-aetas-text text-xs font-semibold mb-0.5 capitalize">{unitName(attacker.unitType)}</p>
              <p className="text-aetas-dim text-[10px] mb-2">{attackerCivName}</p>
              <div className="grid grid-cols-2 gap-1">
                <StatCell label="Atk" value={attacker.stats.attack} />
                <StatCell label="Def" value={attacker.stats.defense} />
                <StatCell label="HP"  value={`${attacker.stats.hp}/${attacker.stats.maxHp}`} />
                <StatCell label="Mov" value={attacker.stats.movement} />
              </div>
            </div>

            {/* Defender */}
            <div className="bg-aetas-raised rounded-xl p-2.5 border border-red-900/40">
              <p className="text-[9px] text-red-400 uppercase tracking-wider mb-1">Defensor</p>
              <p className="text-aetas-text text-xs font-semibold mb-0.5 capitalize">{unitName(defender.unitType)}</p>
              <p className="text-aetas-dim text-[10px] mb-2">{defenderCivName}</p>
              <div className="grid grid-cols-2 gap-1">
                <StatCell label="Atk" value={defender.stats.attack} />
                <StatCell label="Def" value={defender.stats.defense} />
                <StatCell label="HP"  value={`${defender.stats.hp}/${defender.stats.maxHp}`} />
                <StatCell label="Mov" value={defender.stats.movement} />
              </div>
            </div>
          </div>

          {/* Predicted outcome */}
          <div className={`rounded-xl border p-3 mb-4 ${outcomeColor}`}>
            <p className="text-xs font-semibold mb-1">{outcomeLabel}</p>
            <div className="flex gap-3 text-[10px] opacity-80">
              <span>Dano causado: <strong>+{preview.damageToDefender}</strong></span>
              {preview.damageToAttacker > 0 && (
                <span>Dano recebido: <strong>−{preview.damageToAttacker}</strong></span>
              )}
            </div>
            <p className="text-[9px] opacity-60 mt-1.5">* Defensor pode ganhar +2 Def ao responder</p>
          </div>

          {/* Actions */}
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
              {isLoading ? 'Atacando…' : 'Confirmar Ataque ⚔'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
