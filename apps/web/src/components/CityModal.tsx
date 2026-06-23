import type { City, GameState, BuildingEffect } from '@aetas/game-engine'
import { Era, CitySpecialization, BuildingType, unitsForCiv, BUILDING_CATALOG, getBuildingsBySpecialization, CIVILIZATIONS } from '@aetas/game-engine'
import { ERA_ICONS, ERA_NAMES_PT, ERA_ORDER_UI } from './EraModal.tsx'

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
]

function civColor(civilizationId: string | undefined, fallback: string): string {
  if (!civilizationId) return fallback
  return CIVILIZATIONS.find(c => c.id === civilizationId)?.color ?? fallback
}

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

interface Props {
  city: City
  gameState: GameState
  myEnginePlayerId: string
  onClose: () => void
  onTrainUnit?: (cityId: string, unitType: string) => void
  onConstructBuilding?: (cityId: string, buildingType: BuildingType) => void
}

export default function CityModal({ city, gameState, myEnginePlayerId, onClose, onTrainUnit, onConstructBuilding }: Props) {
  const isMyCity = city.ownerId === myEnginePlayerId
  const ownerIndex = gameState.players.findIndex(p => p.id === city.ownerId)
  const ownerPlayer = gameState.players.find(p => p.id === city.ownerId)
  const ownerColor = civColor(ownerPlayer?.civilizationId, PLAYER_COLORS[ownerIndex % PLAYER_COLORS.length] ?? '#888')
  const ownerCivName = CIVILIZATIONS.find(c => c.id === ownerPlayer?.civilizationId)?.name
  const myResources = gameState.players.find(p => p.id === myEnginePlayerId)?.resources

  const myPlayer = gameState.players.find(p => p.id === myEnginePlayerId)
  const available = isMyCity && myPlayer
    ? unitsForCiv(myPlayer.civilizationId, gameState.era)
    : []

  // Units locked in the next era
  const eraIdx = ERA_ORDER_UI.indexOf(gameState.era)
  const nextEra = ERA_ORDER_UI[eraIdx + 1] as Era | undefined
  const currentTypes = new Set(available.map(u => u.type))
  const lockedUnits = isMyCity && myPlayer && nextEra
    ? unitsForCiv(myPlayer.civilizationId, nextEra).filter(u => !currentTypes.has(u.type))
    : []

  const hexOccupied = isMyCity && gameState.units.some(
    u => u.ownerId === myEnginePlayerId &&
         u.position.q === city.position.q && u.position.r === city.position.r,
  )

  const buildingsForSpec = getBuildingsBySpecialization(city.specialization)
  const builtSet = new Set(city.buildings ?? [])
  const constructing = city.construction

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet — slides up from bottom */}
      <div className="fixed inset-x-0 bottom-0 z-40 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-96">
        <div className="bg-aetas-surface border border-aetas-border-strong rounded-t-2xl md:rounded-2xl shadow-2xl shadow-black/60 p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: ownerColor }} />
              <div>
                <h2 className="text-aetas-text font-bold text-base">{city.name}</h2>
                <p className="text-aetas-dim text-xs">
                  {ownerCivName ?? ownerPlayer?.id.slice(0, 8) ?? '?'}
                  {city.ownerId === myEnginePlayerId && ' (você)'}
                  {ownerPlayer?.isAIControlled && ' 🤖'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-aetas-raised text-aetas-muted hover:text-aetas-text transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatBox label="Nível" value={city.level} />
            <StatBox label="População" value={city.population} />
            <StatBox label="Comida" value={city.foodStored} />
          </div>

          {/* My resources (only shown for my cities) */}
          {isMyCity && myResources && (
            <div className="bg-aetas-raised rounded-xl p-3 mb-4">
              <p className="text-xs text-aetas-dim mb-2">Recursos do jogador</p>
              <div className="flex gap-4">
                <ResourcePill icon="💰" label="Ouro" value={myResources.gold} />
                <ResourcePill icon="🌾" label="Comida" value={myResources.food} />
                <ResourcePill icon="⚙️" label="Produção" value={myResources.production} />
              </div>
            </div>
          )}

          {/* Specialization */}
          <div>
            <p className="text-xs text-aetas-dim mb-2">
              Especialização atual: <span className="text-aetas-muted">{SPEC_ICON[city.specialization]} {SPEC_LABEL[city.specialization]}</span>
            </p>
            <p className="text-xs text-aetas-dim mb-3">{SPEC_DESC[city.specialization]}</p>

          </div>

          {/* Buildings */}
          <div className="mt-4 border-t border-aetas-border pt-4">
            <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-2">Construções</p>

            {/* In-progress construction */}
            {constructing && (() => {
              const def = BUILDING_CATALOG.get(constructing.buildingType)!
              const pct = Math.round(((constructing.totalTurns - constructing.turnsRemaining) / constructing.totalTurns) * 100)
              return (
                <div className="bg-aetas-raised/60 rounded-lg p-2.5 mb-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-aetas-text text-sm">🔨 {def.name}</span>
                    <span className="text-amber-400 text-xs">{constructing.turnsRemaining} turno{constructing.turnsRemaining !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="h-1 bg-aetas-panel rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })()}

            {/* Completed buildings */}
            {builtSet.size > 0 && (
              <div className="mb-2 flex flex-col gap-0.5">
                {[...builtSet].map(btype => {
                  const def = BUILDING_CATALOG.get(btype)!
                  return (
                    <div key={btype} className="flex items-center gap-2 py-0.5 text-xs">
                      <span className="text-emerald-500">✓</span>
                      <span className="text-aetas-muted">{def.name}</span>
                      <span className="text-aetas-dim ml-auto">{effectLabel(def.effect)}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Available to build */}
            {isMyCity && onConstructBuilding && buildingsForSpec
              .filter(def => !builtSet.has(def.type) && constructing?.buildingType !== def.type)
              .map(def => {
                const canAfford = (myResources?.production ?? 0) >= def.productionCost
                return (
                  <div key={def.type} className="flex items-center gap-2 py-1.5 border-b border-aetas-border/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <span className="text-aetas-text text-sm font-medium">{def.name}</span>
                      <span className="text-aetas-dim text-xs ml-2">{effectLabel(def.effect)}</span>
                      <span className="text-aetas-border-strong text-xs ml-1">· {def.constructionTurns}t</span>
                    </div>
                    <span className="text-aetas-muted text-xs whitespace-nowrap">⚙ {def.productionCost}</span>
                    <button
                      onClick={() => onConstructBuilding(city.id, def.type)}
                      disabled={!canAfford || constructing != null}
                      className="px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-aetas-gold/70 hover:bg-aetas-gold text-aetas-bg"
                    >
                      Construir
                    </button>
                  </div>
                )
              })
            }

            {isMyCity && builtSet.size === buildingsForSpec.length && !constructing && (
              <p className="text-xs text-aetas-dim">Todos os edifícios desta especialização já construídos.</p>
            )}
          </div>

          {/* Unit production (own cities only) */}
          {isMyCity && onTrainUnit && (
            <div className="mt-4 border-t border-aetas-border pt-4">
              <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-2">
                Produção <span className="normal-case text-aetas-dim font-sans">⚙ {myResources?.production ?? 0}</span>
              </p>
              {hexOccupied && (
                <p className="text-xs text-amber-600 mb-2">Mova a unidade nessa cidade antes de treinar outra.</p>
              )}
              {available.length === 0
                ? <p className="text-xs text-aetas-dim">Nenhuma unidade disponível nesta era.</p>
                : available.map(def => {
                    const canAfford = (myResources?.production ?? 0) >= def.productionCost
                    return (
                      <div
                        key={def.type}
                        className="flex items-center gap-2 py-1.5 border-b border-aetas-border/50 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-aetas-text text-sm font-medium">{def.name}</span>
                          <span className="text-aetas-dim text-xs ml-2">
                            ⚔{def.stats.attack} 🛡{def.stats.defense} ❤{def.stats.maxHp} 💨{def.stats.movement}
                          </span>
                        </div>
                        <span className="text-aetas-muted text-xs whitespace-nowrap">⚙ {def.productionCost}</span>
                        <button
                          onClick={() => onTrainUnit(city.id, def.type)}
                          disabled={!canAfford || hexOccupied}
                          className="px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-amber-700/70 hover:bg-amber-600 text-white"
                        >
                          Treinar
                        </button>
                      </div>
                    )
                  })
              }

              {/* Locked units from next era */}
              {lockedUnits.length > 0 && nextEra && (
                <div className="mt-3 pt-2 border-t border-aetas-border">
                  <p className="text-[9px] text-aetas-dim uppercase tracking-wider mb-1.5">
                    {ERA_ICONS[nextEra]} {ERA_NAMES_PT[nextEra]} — bloqueado
                  </p>
                  {lockedUnits.map(def => (
                    <div
                      key={def.type}
                      className="flex items-center gap-2 py-1.5 border-b border-aetas-border/30 last:border-0 opacity-50"
                    >
                      <span className="text-xs">🔒</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-aetas-dim text-sm font-medium">{def.name}</span>
                        <span className="text-aetas-dim text-xs ml-2">
                          ⚔{def.stats.attack} 🛡{def.stats.defense} ❤{def.stats.maxHp}
                        </span>
                      </div>
                      <span className="text-[9px] text-aetas-dim whitespace-nowrap">Disponível na {ERA_NAMES_PT[nextEra]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function effectLabel(effect: BuildingEffect): string {
  switch (effect.type) {
    case 'productionMultiplier': return `+${Math.round((effect.value - 1) * 100)}% produção`
    case 'goldMultiplier':       return `+${Math.round((effect.value - 1) * 100)}% ouro`
    case 'foodMultiplier':       return `+${Math.round((effect.value - 1) * 100)}% comida`
    case 'cityDefenseBonus':     return `+${effect.value} defesa`
    case 'eraProgressBonus':     return `+${effect.value} pesquisa/turno`
    case 'scoreBonus':           return `+${effect.value} pts`
  }
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-aetas-raised rounded-lg p-2.5 text-center">
      <p className="text-aetas-text font-bold text-lg">{value}</p>
      <p className="text-aetas-dim text-xs mt-0.5">{label}</p>
    </div>
  )
}

function ResourcePill({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span>{icon}</span>
      <div>
        <p className="text-aetas-text text-sm font-medium">{value}</p>
        <p className="text-aetas-dim text-xs">{label}</p>
      </div>
    </div>
  )
}
