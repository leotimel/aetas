import { useTranslation } from 'react-i18next'
import type { City, GameState, BuildingEffect } from '@aetas/game-engine'
import { Era, CitySpecialization, BuildingType, unitsForCiv, BUILDING_CATALOG, getBuildingsBySpecialization, CIVILIZATIONS } from '@aetas/game-engine'
import { ERA_ICONS, ERA_ORDER_UI } from './EraModal.tsx'
import i18n from '../i18n.ts'

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

const ERA_NAME_KEY: Record<Era, 'era.ancient' | 'era.classical' | 'era.medieval'> = {
  [Era.Ancient]:   'era.ancient',
  [Era.Classical]: 'era.classical',
  [Era.Medieval]:  'era.medieval',
}

function effectLabel(effect: BuildingEffect): string {
  switch (effect.type) {
    case 'productionMultiplier': return i18n.t('building.productionMultiplier', { pct: Math.round((effect.value - 1) * 100) })
    case 'goldMultiplier':       return i18n.t('building.goldMultiplier',       { pct: Math.round((effect.value - 1) * 100) })
    case 'foodMultiplier':       return i18n.t('building.foodMultiplier',       { pct: Math.round((effect.value - 1) * 100) })
    case 'cityDefenseBonus':     return i18n.t('building.cityDefenseBonus',     { value: effect.value })
    case 'eraProgressBonus':     return i18n.t('building.eraProgressBonus',     { value: effect.value })
    case 'scoreBonus':           return i18n.t('building.scoreBonus',           { value: effect.value })
  }
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
  const { t } = useTranslation()

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

      {/* Sheet — slides up from bottom; max-height + scroll on mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-96">
        <div className="bg-aetas-surface border border-aetas-border-strong rounded-t-2xl md:rounded-2xl shadow-2xl shadow-black/60
                        flex flex-col max-h-[85dvh] md:max-h-[90vh]">
          {/* Sticky header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0 border-b border-aetas-border/50">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: ownerColor }} />
              <div>
                <h2 className="text-aetas-text font-bold text-base">{city.name}</h2>
                <p className="text-aetas-dim text-xs">
                  {ownerCivName ?? ownerPlayer?.id.slice(0, 8) ?? '?'}
                  {city.ownerId === myEnginePlayerId && ` ${t('ui.you')}`}
                  {ownerPlayer?.isAIControlled && ' 🤖'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-aetas-raised text-aetas-muted hover:text-aetas-text transition-colors flex-shrink-0"
            >
              ✕
            </button>
          </div>
          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-5 pb-5 pt-4">

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatBox label={t('city.level')} value={city.level} />
            <StatBox label={t('city.population')} value={city.population} />
            <StatBox label={t('city.food')} value={city.foodStored} />
          </div>

          {/* My resources (only shown for my cities) */}
          {isMyCity && myResources && (
            <div className="bg-aetas-raised rounded-xl p-3 mb-4">
              <p className="text-xs text-aetas-dim mb-2">{t('city.playerResources')}</p>
              <div className="flex gap-4">
                <ResourcePill icon="💰" label={t('city.gold')} value={myResources.gold} />
                <ResourcePill icon="🌾" label={t('city.food')} value={myResources.food} />
                <ResourcePill icon="⚙️" label={t('city.production')} value={myResources.production} />
              </div>
            </div>
          )}

          {/* Specialization */}
          <div>
            <p className="text-xs text-aetas-dim mb-2">
              {t('city.specCurrent')} <span className="text-aetas-muted">{SPEC_ICON[city.specialization]} {t(SPEC_LABEL_KEY[city.specialization])}</span>
            </p>
            <p className="text-xs text-aetas-dim mb-3">{t(SPEC_DESC_KEY[city.specialization])}</p>
          </div>

          {/* Buildings */}
          <div className="mt-4 border-t border-aetas-border pt-4">
            <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-2">{t('city.buildings')}</p>

            {/* In-progress construction */}
            {constructing && (() => {
              const def = BUILDING_CATALOG.get(constructing.buildingType)!
              const pct = Math.round(((constructing.totalTurns - constructing.turnsRemaining) / constructing.totalTurns) * 100)
              return (
                <div className="bg-aetas-raised/60 rounded-lg p-2.5 mb-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-aetas-text text-sm">🔨 {def.name}</span>
                    <span className="text-amber-400 text-xs">{t('city.constructionRemaining', { turns: constructing.turnsRemaining })}</span>
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
                      {t('city.buildBtn')}
                    </button>
                  </div>
                )
              })
            }

            {isMyCity && builtSet.size === buildingsForSpec.length && !constructing && (
              <p className="text-xs text-aetas-dim">{t('city.allBuilt')}</p>
            )}
          </div>

          {/* Unit production (own cities only) */}
          {isMyCity && onTrainUnit && (
            <div className="mt-4 border-t border-aetas-border pt-4">
              <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-2">
                {t('city.buildings')} <span className="normal-case text-aetas-dim font-sans">⚙ {myResources?.production ?? 0}</span>
              </p>
              {hexOccupied && (
                <p className="text-xs text-amber-600 mb-2">{t('city.moveFirst')}</p>
              )}
              {available.length === 0
                ? <p className="text-xs text-aetas-dim">{t('city.noUnits')}</p>
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
                          {t('city.trainBtn')}
                        </button>
                      </div>
                    )
                  })
              }

              {/* Locked units from next era */}
              {lockedUnits.length > 0 && nextEra && (
                <div className="mt-3 pt-2 border-t border-aetas-border">
                  <p className="text-[9px] text-aetas-dim uppercase tracking-wider mb-1.5">
                    {ERA_ICONS[nextEra]} {t(ERA_NAME_KEY[nextEra])} {t('era.locked')}
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
                      <span className="text-[9px] text-aetas-dim whitespace-nowrap">{t('city.availableIn', { era: t(ERA_NAME_KEY[nextEra]) })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>{/* end scrollable body */}
        </div>
      </div>
    </>
  )
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
