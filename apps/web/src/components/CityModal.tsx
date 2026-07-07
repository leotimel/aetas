import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { City, GameState, BuildingEffect, WonderEffect, Resources } from '@aetas/game-engine'
import { Era, CitySpecialization, BuildingType, unitsForCiv, trainingCost, BUILDING_CATALOG, getBuildingsBySpecialization, CIVILIZATIONS, cityMaxHp, computeCityProduction, WONDERS, eraAtLeast } from '@aetas/game-engine'
import { ERA_ICONS, ERA_ORDER_UI } from './EraModal.tsx'
import { SealButton } from './ui/SealButton'
import { ResourceChip } from './ui/ResourceChip'
import { CivCrest } from './ui/CivCrest'
import i18n from '../i18n.ts'

const AMBER_GRAD = 'radial-gradient(80% 120% at 50% 0%, #3a2a12, #160f06)'

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
  const [tab, setTab] = useState<'buildings' | 'units'>('buildings')

  const isMyCity = city.ownerId === myEnginePlayerId
  const ownerPlayer = gameState.players.find(p => p.id === city.ownerId)
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

  // Per-city per-turn output — feeds the resource-strip deltas.
  const cityIncome: Resources = computeCityProduction(city, gameState.cities, gameState.map.tiles)

  const ownerLabel = [
    ownerCivName ?? ownerPlayer?.id.slice(0, 8) ?? '?',
    isMyCity ? t('ui.you') : null,
    ownerPlayer?.isAIControlled ? 'AI' : null,
    `LVL ${city.level}`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="fixed inset-0 z-50 bg-aetas-bg flex flex-col">
      {/* Header — amber gradient */}
      <header
        className="flex-shrink-0 flex items-center gap-3 px-4 py-4"
        style={{ background: AMBER_GRAD, borderBottom: '1px solid rgba(201,168,76,0.3)' }}
      >
        <CivCrest civId={ownerPlayer?.civilizationId ?? ''} size={44} />
        <div className="min-w-0">
          <p className="font-body text-aetas-label text-[11px] uppercase tracking-wider truncate">{ownerLabel}</p>
          <h2 className="font-display text-aetas-gold font-semibold leading-tight" style={{ fontSize: 25 }}>{city.name}</h2>
        </div>
        <div className="ml-auto flex-shrink-0">
          <SealButton variant="red" size="sm" onClick={onClose}>✕</SealButton>
        </div>
      </header>

      {/* Scrollable body — centered column */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto w-full px-4 py-4 space-y-4">

          {/* Resource strip (own cities only) */}
          {isMyCity && myResources && (
            <div className="flex gap-2 bg-aetas-panel rounded-sm p-2" style={{ border: '1px solid var(--color-aetas-border)' }}>
              <ResourceChip icon="gold" value={myResources.gold} delta={cityIncome.gold} />
              <ResourceChip icon="food" value={myResources.food} delta={cityIncome.food} />
              <ResourceChip icon="production" value={myResources.production} delta={cityIncome.production} />
            </div>
          )}

          {/* Double row — Specialization + Level */}
          <div className="grid grid-cols-2 gap-2">
            {/* Specialization card */}
            <div className="rounded-sm p-3" style={{ background: 'rgba(111,143,74,0.10)', border: '1px solid rgba(111,143,74,0.25)' }}>
              <p className="text-sm font-medium text-aetas-text mb-0.5">
                {SPEC_ICON[city.specialization]} {t(SPEC_LABEL_KEY[city.specialization])}
              </p>
              <p className="text-xs text-aetas-dim">{t(SPEC_DESC_KEY[city.specialization])}</p>
            </div>

            {/* Level card */}
            <div className="rounded-sm p-3" style={{ background: 'var(--color-aetas-panel)', border: '1px solid var(--color-aetas-border)' }}>
              {isMyCity && city.level < 3 ? (() => {
                const threshold = city.level === 1 ? 2 : 4
                const nextLevel = city.level + 1
                const pct = Math.min(100, Math.round((city.population / threshold) * 100))
                return (
                  <>
                    <p className="font-display text-[10px] text-aetas-gold/80 mb-1.5">
                      {t('city.levelProgress', { pop: city.population, threshold, next: nextLevel })}
                    </p>
                    <div className="h-1.5 rounded-sm overflow-hidden" style={{ background: 'rgba(122,79,30,0.3)' }}>
                      <div className="h-full bg-aetas-gold transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </>
                )
              })() : (
                <p className="text-sm font-medium text-aetas-gold">
                  {city.level === 3 ? t('city.maxLevel') : `${t('city.level')} ${city.level}`}
                </p>
              )}
              <p className="text-[11px] text-aetas-dim mt-1.5">🌾 {t('city.foodStored', { n: city.foodStored })}</p>
            </div>
          </div>

          {/* Fortify city (own damaged cities only) */}
          {isMyCity && onFortifyCity && (city.hp ?? cityMaxHp(city.level)) < cityMaxHp(city.level) && (
            <div className="bg-aetas-raised rounded-xl p-3 flex items-center justify-between gap-3">
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

          {/* Tabs */}
          <div className="flex gap-1 bg-aetas-panel border border-aetas-border rounded-full p-1">
            {([
              ['buildings', `🏛 ${t('city.buildings')}`],
              ['units', `⚔ ${t('city.units')}`],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 px-3 py-1.5 rounded-full text-xs font-semibold font-body transition-colors ${
                  tab === key ? 'bg-aetas-gold text-aetas-bg' : 'text-aetas-dim hover:text-aetas-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Buildings tab ── */}
          {tab === 'buildings' && (
            <div>
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
            </div>
          )}

          {/* ── Units tab ── */}
          {tab === 'units' && (
            isMyCity && onTrainUnit ? (
              <div>
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
            ) : (
              <p className="text-xs text-aetas-dim py-2">{t('city.noUnits')}</p>
            )
          )}

        </div>
      </div>
    </div>
  )
}
