import { useTranslation } from 'react-i18next'
import type { City, GameState, BuildingEffect, WonderEffect } from '@aetas/game-engine'
import { Era, CitySpecialization, BuildingType, unitsForCiv, trainingCost, BUILDING_CATALOG, getBuildingsBySpecialization, CIVILIZATIONS, cityMaxHp, WONDERS, eraAtLeast } from '@aetas/game-engine'
import { ERA_ICONS, ERA_ORDER_UI } from './EraModal.tsx'
import { SealButton } from './ui/SealButton'
import { RomanDivider } from './ui/RomanDivider'
import { RESOURCE_ICONS } from './ui/ResourceChip'
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

function wonderEffectLabel(effect: WonderEffect): string {
  switch (effect.type) {
    case 'productionMultiplier': return i18n.t('building.productionMultiplier', { pct: Math.round((effect.value - 1) * 100) })
    case 'goldMultiplier':       return i18n.t('building.goldMultiplier',       { pct: Math.round((effect.value - 1) * 100) })
    case 'foodMultiplier':       return i18n.t('building.foodMultiplier',       { pct: Math.round((effect.value - 1) * 100) })
    case 'eraProgressBonus':     return i18n.t('building.eraProgressBonus',     { value: effect.value })
    case 'scoreBonus':           return i18n.t('building.scoreBonus',           { value: effect.value })
    case 'combatMultiplier':     return i18n.t('building.combatMultiplier',     { pct: Math.round((effect.value - 1) * 100) })
  }
}

interface Props {
  city: City
  gameState: GameState
  myEnginePlayerId: string
  onClose: () => void
  onTrainUnit?: (cityId: string, unitType: string) => void
  onConstructBuilding?: (cityId: string, buildingType: BuildingType) => void
  onFortifyCity?: (cityId: string, goldAmount: number) => void
  onBuildWonder?: (cityId: string, wonderId: string) => void
}

export default function CityModal({ city, gameState, myEnginePlayerId, onClose, onTrainUnit, onConstructBuilding, onFortifyCity, onBuildWonder }: Props) {
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
  // Effective training cost depends on how many cities I already own (Settler
  // scales) and my civ (Ottoman catapult discount). Same helper the engine uses.
  const myCityCount = gameState.cities.filter(c => c.ownerId === myEnginePlayerId).length
  const myCivId = myPlayer?.civilizationId ?? ''

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
        <div className="bg-aetas-surface border border-aetas-border-strong rounded-t-sm md:rounded-sm shadow-2xl shadow-black/60
                        flex flex-col max-h-[85dvh] md:max-h-[90vh]">
          {/* Sticky header */}
          <div className="bg-aetas-panel flex-shrink-0 px-5 pt-4 pb-0" style={{ borderBottom: '1px solid rgba(201,168,76,0.3)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: ownerColor }} />
                <div>
                  <h2 className="font-display text-lg text-aetas-gold font-semibold tracking-wide leading-tight">{city.name}</h2>
                  <p className="text-aetas-muted text-xs uppercase tracking-widest">
                    {ownerCivName ?? ownerPlayer?.id.slice(0, 8) ?? '?'}
                    {city.ownerId === myEnginePlayerId && ` · ${t('ui.you')}`}
                    {ownerPlayer?.isAIControlled && ' · AI'}
                  </p>
                </div>
              </div>
              <SealButton variant="red" size="sm" onClick={onClose}>✕</SealButton>
            </div>
            <RomanDivider />
          </div>
          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 px-5 pb-5 pt-4">

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatBox label={t('city.level')} value={city.level} />
            <StatBox label={t('city.population')} value={city.population} />
            <StatBox label={t('city.food')} value={city.foodStored} />
          </div>

          {/* Level progress */}
          {isMyCity && city.level < 3 && (() => {
            const threshold = city.level === 1 ? 2 : 4
            const nextLevel = city.level + 1
            const pct = Math.min(100, Math.round((city.population / threshold) * 100))
            return (
              <div className="bg-aetas-panel rounded-sm p-3 mb-4" style={{ border: '1px solid var(--color-aetas-border)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-display text-[10px] text-aetas-gold/80">
                    {t('city.levelProgress', { pop: city.population, threshold, next: nextLevel })}
                  </span>
                </div>
                <div className="h-1.5 rounded-sm overflow-hidden" style={{ background: 'rgba(122,79,30,0.3)' }}>
                  <div className="h-full bg-aetas-gold transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })()}
          {isMyCity && city.level === 3 && (
            <div className="text-center text-xs text-aetas-gold mb-4">{t('city.maxLevel')}</div>
          )}

          {/* My resources (only shown for my cities) */}
          {isMyCity && myResources && (
            <div className="bg-aetas-panel rounded-sm p-3 mb-4" style={{ border: '1px solid var(--color-aetas-border)' }}>
              <div className="mb-2">
                <RomanDivider />
                <p className="font-display text-[10px] uppercase tracking-widest text-aetas-gold/70 text-center mt-1">
                  {t('city.playerResources')}
                </p>
              </div>
              <div className="flex gap-3">
                <ResourcePill icon="gold" label={t('city.gold')} value={myResources.gold} />
                <ResourcePill icon="food" label={t('city.food')} value={myResources.food} />
                <ResourcePill icon="production" label={t('city.production')} value={myResources.production} />
              </div>
            </div>
          )}

          {/* Fortify city (own damaged cities only) */}
          {isMyCity && onFortifyCity && (city.hp ?? cityMaxHp(city.level)) < cityMaxHp(city.level) && (
            <div className="bg-aetas-raised rounded-xl p-3 mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-aetas-text">{t('action.fortify')}</p>
                <p className="text-xs text-aetas-dim">{t('action.fortifyDesc')}</p>
              </div>
              <button
                onClick={() => onFortifyCity(city.id, 20)}
                disabled={(myResources?.gold ?? 0) < 20}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-700/70 hover:bg-blue-600 text-white whitespace-nowrap"
              >
                🏰 20💰 → +4 HP
              </button>
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
                const builtForSpec = [...builtSet].filter(b =>
                  BUILDING_CATALOG.get(b)!.specialization === def.specialization
                )
                const levelLocked = builtForSpec.length >= 1 && city.level < 2
                const canAffordProd = (myResources?.production ?? 0) >= def.productionCost
                const canAffordGold = (myResources?.gold ?? 0) >= def.goldCost
                const canAfford = canAffordProd && canAffordGold
                return (
                  <div key={def.type} className="flex items-center gap-2 py-1.5 border-b border-aetas-border/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${levelLocked ? 'text-aetas-dim' : 'text-aetas-text'}`}>{def.name}</span>
                      <span className="text-aetas-dim text-xs ml-2">{effectLabel(def.effect)}</span>
                      <span className="text-aetas-border-strong text-xs ml-1">· {def.constructionTurns}t</span>
                    </div>
                    {levelLocked ? (
                      <span className="text-xs text-aetas-dim opacity-60 whitespace-nowrap">{t('city.requiresLevel2')}</span>
                    ) : (
                      <>
                        <span className="text-aetas-muted text-xs whitespace-nowrap">⚙ {def.productionCost} 💰 {def.goldCost}</span>
                        <button
                          onClick={() => onConstructBuilding(city.id, def.type)}
                          disabled={!canAfford || constructing != null}
                          className="px-2.5 py-1 rounded-sm text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-aetas-gold text-aetas-bg hover:brightness-110"
                        >
                          {t('city.buildBtn')}
                        </button>
                      </>
                    )}
                  </div>
                )
              })
            }

            {isMyCity && builtSet.size === buildingsForSpec.length && !constructing && (
              <p className="text-xs text-aetas-dim">{t('city.allBuilt')}</p>
            )}
          </div>

          {/* World Wonders — global catalog, not filtered by specialization */}
          <div className="mt-4 border-t border-aetas-border pt-4">
            <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-2">{t('city.wonders.title')}</p>
            <div className="flex flex-col gap-0.5">
              {WONDERS.map(def => {
                const built = (gameState.wonders ?? []).find(w => w.wonderId === def.id)

                if (built && built.cityId === city.id) {
                  return (
                    <div key={def.id} className="flex items-center gap-2 py-0.5 text-xs">
                      <span className="text-emerald-500">✓</span>
                      <span className="text-aetas-muted">{def.name}</span>
                      <span className="text-aetas-dim ml-auto">{wonderEffectLabel(def.effect)}</span>
                    </div>
                  )
                }

                if (built) {
                  const builtOwner = gameState.players.find(p => p.id === built.ownerId)
                  const builtCivName = CIVILIZATIONS.find(c => c.id === builtOwner?.civilizationId)?.name ?? builtOwner?.id.slice(0, 8)
                  const builtCityName = gameState.cities.find(c => c.id === built.cityId)?.name ?? '?'
                  return (
                    <div key={def.id} className="flex items-center gap-2 py-1.5 border-b border-aetas-border/50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-aetas-dim">{def.name}</span>
                        <span className="text-aetas-dim text-xs ml-2">{wonderEffectLabel(def.effect)}</span>
                      </div>
                      <span className="text-xs text-aetas-dim opacity-60 whitespace-nowrap">
                        {t('city.wonders.builtBy', { civ: builtCivName, city: builtCityName })}
                      </span>
                    </div>
                  )
                }

                const eraLocked = !eraAtLeast(gameState.era, def.eraRequired)
                const canAfford = (myResources?.production ?? 0) >= def.productionCost
                return (
                  <div key={def.id} className="flex items-center gap-2 py-1.5 border-b border-aetas-border/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${eraLocked ? 'text-aetas-dim' : 'text-aetas-text'}`}>{def.name}</span>
                      <span className="text-aetas-dim text-xs ml-2">{wonderEffectLabel(def.effect)}</span>
                    </div>
                    {eraLocked ? (
                      <span className="text-xs text-aetas-dim opacity-60 whitespace-nowrap">
                        {t('city.wonders.requiresEra', { era: t(ERA_NAME_KEY[def.eraRequired]) })}
                      </span>
                    ) : isMyCity && onBuildWonder ? (
                      <>
                        <span className="text-aetas-muted text-xs whitespace-nowrap">⚙ {def.productionCost}</span>
                        <button
                          onClick={() => onBuildWonder(city.id, def.id)}
                          disabled={!canAfford}
                          className="px-2.5 py-1 rounded-sm text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-aetas-gold text-aetas-bg hover:brightness-110"
                        >
                          {t('city.buildBtn')}
                        </button>
                      </>
                    ) : null}
                  </div>
                )
              })}
            </div>
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
                    const cost = trainingCost(def, myCityCount, myCivId)
                    const canAfford =
                      (myResources?.production ?? 0) >= cost.production &&
                      (myResources?.food ?? 0) >= cost.food &&
                      (myResources?.gold ?? 0) >= cost.gold
                    return (
                      <div key={def.type} className="flex items-center gap-2 py-1.5 border-b border-aetas-border/50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-aetas-text text-sm font-medium">{def.name}</p>
                          <p className="text-aetas-dim text-[11px] mt-0.5">
                            ⚔{def.stats.attack} 🛡{def.stats.defense} ❤{def.stats.maxHp} 💨{def.stats.movement}
                          </p>
                        </div>
                        <span className="flex-shrink-0 text-aetas-muted text-xs whitespace-nowrap">⚙{cost.production} 🌾{cost.food} 💰{cost.gold}</span>
                        <button
                          onClick={() => onTrainUnit(city.id, def.type)}
                          disabled={!canAfford || hexOccupied}
                          className="flex-shrink-0 px-2.5 py-1 rounded-sm text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-aetas-red text-white hover:brightness-110"
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
    <div className="rounded-sm p-2.5 text-center"
      style={{ background: 'rgba(191,170,135,0.12)', border: '1px solid rgba(191,170,135,0.25)' }}>
      <p className="font-display text-aetas-gold font-semibold text-xl leading-none">{value}</p>
      <p className="text-aetas-dim uppercase tracking-widest text-[10px] mt-1">{label}</p>
    </div>
  )
}

function ResourcePill({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 bg-aetas-raised rounded-sm px-2 py-1">
      {RESOURCE_ICONS[icon] ?? <span>{icon}</span>}
      <div>
        <p className="text-aetas-text text-sm font-medium">{value}</p>
        <p className="text-aetas-dim text-xs">{label}</p>
      </div>
    </div>
  )
}
