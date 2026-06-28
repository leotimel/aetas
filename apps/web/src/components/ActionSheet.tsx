import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { SealButton } from './ui/SealButton'
import type { GameState, Unit } from '@aetas/game-engine'
import { CombatDisputeStatus, CIVILIZATIONS, UNIT_CATALOG, SPECIAL_UNIT_CATALOG, UnitType, hexDistance, hexKey } from '@aetas/game-engine'
import DiplomacyPanel from './DiplomacyPanel.tsx'

interface DiplomacyHandlers {
  onProposePact:      (targetId: string) => void
  onDeclareWar:       (targetId: string) => void
  onBreakPact:        (targetId: string) => void
  onProposePeace:     (targetId: string) => void
  onProposeTrade:     (targetId: string) => void
  onRespondDiplomacy: (proposalId: string, accept: boolean) => void
}

interface Props extends DiplomacyHandlers {
  gameState: GameState
  myEnginePlayerId: string
  isMyTurn: boolean
  selectedUnitId: string | null
  log: string[]
  expandSignal?: number
  onEndTurn: () => void
  onResolveDispute: (disputeId: string) => void
  onInitiateCombat?: (attackerUnitId: string, defenderUnitId: string) => void
  onFoundCity?: (unitId: string) => void
  onAttackCity?: (unitId: string, cityId: string) => void
}

function civName(players: GameState['players'], playerId: string): string {
  const player = players.find(p => p.id === playerId)
  return CIVILIZATIONS.find(c => c.id === player?.civilizationId)?.name ?? playerId.slice(0, 6)
}

export default function ActionSheet({
  gameState, myEnginePlayerId, isMyTurn, selectedUnitId, log, expandSignal,
  onEndTurn, onResolveDispute, onInitiateCombat, onFoundCity, onAttackCity,
  onProposePact, onDeclareWar, onBreakPact, onProposePeace, onProposeTrade, onRespondDiplomacy,
}: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  // The header diplomacy badge bumps expandSignal to open the mobile sheet.
  useEffect(() => {
    if (expandSignal) setExpanded(true)
  }, [expandSignal])

  const diplomacyHandlers: DiplomacyHandlers = {
    onProposePact, onDeclareWar, onBreakPact, onProposePeace, onProposeTrade, onRespondDiplomacy,
  }

  const { combatDisputes, units, players } = gameState
  const selectedUnit = selectedUnitId ? units.find(u => u.id === selectedUnitId) : undefined

  const isFoundCityValid = !!selectedUnit?.canFoundCity &&
    selectedUnit.ownerId === myEnginePlayerId &&
    (() => {
      const tile = gameState.map.tiles.find(ti => hexKey(ti.coord) === hexKey(selectedUnit.position))
      if (!tile || tile.terrainType === 'water') return false
      if (gameState.cities.some(c => hexDistance(c.position, selectedUnit.position) <= 1)) return false
      return true
    })()

  const myPendingDisputes = combatDisputes.filter(
    d => d.status === CombatDisputeStatus.Pending &&
      (d.attackerPlayerId === myEnginePlayerId || d.defenderPlayerId === myEnginePlayerId),
  )
  const hasPending = myPendingDisputes.length > 0

  return (
    <>
      {/* ── Mobile: fixed bottom sheet ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-20">
        <div className={`bg-aetas-surface border-t border-aetas-border-strong transition-all duration-300 ${expanded ? 'max-h-[50vh]' : 'max-h-20'} overflow-hidden`}>
          {/* Handle + quick actions */}
          <div className="relative flex items-center gap-2 px-3 pt-3 pb-2">
            {/* Drag handle — full-width touch target, visual is just the line */}
            <button
              onClick={() => setExpanded(v => !v)}
              className="absolute inset-x-0 top-0 h-7 flex items-start justify-center pt-2"
              aria-label="Expandir painel"
            >
              <span className="w-10 h-1 rounded-full bg-aetas-border-strong block" />
            </button>
            <div className="flex gap-2 w-full mt-2">
              <button
                onClick={onEndTurn}
                disabled={!isMyTurn}
                className={`flex-1 py-2.5 rounded-sm font-display text-sm tracking-widest uppercase transition-colors ${
                  isMyTurn
                    ? 'text-aetas-gold hover:bg-aetas-raised'
                    : 'text-aetas-dim cursor-not-allowed'
                }`}
                style={isMyTurn ? { border: '1px solid rgba(201,168,76,0.45)', background: 'var(--color-aetas-panel)' } : undefined}
              >
                {isMyTurn ? t('action.endTurnMobile') : t('action.waiting')}
              </button>

              {hasPending && (
                <button
                  onClick={() => setExpanded(true)}
                  className="px-3 py-2.5 rounded-xl bg-amber-800 text-amber-300 text-sm font-medium"
                >
                  ⚔ {myPendingDisputes.length}
                </button>
              )}

              <button
                onClick={() => setExpanded(v => !v)}
                className="w-10 rounded-xl bg-aetas-raised text-aetas-muted text-sm flex items-center justify-center"
              >
                {expanded ? '▼' : '▲'}
              </button>
            </div>
          </div>

          {/* Expanded content */}
          {expanded && (
            <div className="px-3 pb-4 overflow-y-auto max-h-[calc(50vh-5rem)]">
              <ExpandedContent
                selectedUnit={selectedUnit}
                isMyTurn={isMyTurn}
                myPendingDisputes={myPendingDisputes}
                myEnginePlayerId={myEnginePlayerId}
                gameState={gameState}
                players={players}
                units={units}
                cities={gameState.cities}
                log={log}
                onResolveDispute={onResolveDispute}
                onInitiateCombat={onInitiateCombat}
                isFoundCityValid={isFoundCityValid}
                onFoundCity={onFoundCity}
                onAttackCity={onAttackCity}
                diplomacyHandlers={diplomacyHandlers}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop: right sidebar ── */}
      <div className="hidden md:flex flex-col w-72 flex-shrink-0 border-l border-aetas-border bg-aetas-surface overflow-y-auto">
        <div className="p-3 flex flex-col gap-2">
          <div className="flex flex-col items-center gap-2 py-2">
            <SealButton
              variant="gold"
              size="lg"
              onClick={onEndTurn}
              disabled={!isMyTurn}
            >
              <span className="font-display text-center leading-tight text-[10px] uppercase tracking-widest">
                END<br/>TURN
              </span>
            </SealButton>
            {!isMyTurn && (
              <p className="text-center text-aetas-dim text-xs">
                {t('action.waitingTurn')}
              </p>
            )}
          </div>

          <ExpandedContent
            selectedUnit={selectedUnit}
            isMyTurn={isMyTurn}
            myPendingDisputes={myPendingDisputes}
            myEnginePlayerId={myEnginePlayerId}
            gameState={gameState}
            players={players}
            units={units}
            cities={gameState.cities}
            log={log}
            onResolveDispute={onResolveDispute}
            onInitiateCombat={onInitiateCombat}
            isFoundCityValid={isFoundCityValid}
            onFoundCity={onFoundCity}
            onAttackCity={onAttackCity}
            diplomacyHandlers={diplomacyHandlers}
          />
        </div>
      </div>
    </>
  )
}

function formatCountdown(expiresAt: number, now: number): string {
  const ms = Math.max(0, expiresAt - now)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function ExpandedContent({
  selectedUnit, isMyTurn, myPendingDisputes, myEnginePlayerId, gameState, players, units, cities, log,
  onResolveDispute, onInitiateCombat, isFoundCityValid, onFoundCity, onAttackCity, diplomacyHandlers,
}: {
  selectedUnit: Unit | undefined
  isMyTurn: boolean
  myPendingDisputes: ReturnType<typeof Array.prototype.filter>
  myEnginePlayerId: string
  gameState: GameState
  players: GameState['players']
  units: GameState['units']
  cities: GameState['cities']
  log: string[]
  onResolveDispute: (id: string) => void
  onInitiateCombat?: (atk: string, def: string) => void
  isFoundCityValid?: boolean
  onFoundCity?: (unitId: string) => void
  onAttackCity?: (unitId: string, cityId: string) => void
  diplomacyHandlers: DiplomacyHandlers
}) {
  const { t } = useTranslation()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      {/* Selected unit panel */}
      {selectedUnit ? (
        <div className="bg-aetas-raised rounded-lg p-2.5 text-xs">
          {/* Header: unit name + exhausted badge */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-aetas-text font-medium capitalize">
              {(UNIT_CATALOG.get(selectedUnit.unitType as UnitType) ?? SPECIAL_UNIT_CATALOG.get(selectedUnit.unitType))?.name ?? selectedUnit.unitType}
            </span>
            {selectedUnit.hasMoved && selectedUnit.ownerId === myEnginePlayerId && (
              <span className="text-aetas-dim bg-aetas-bg px-1.5 py-0.5 rounded-full border border-aetas-border text-[10px]">
                {t('unit.exhausted')}
              </span>
            )}
          </div>

          {/* Stats: Atk / Def / HP / Mov */}
          <div className="grid grid-cols-4 gap-1 mb-2">
            {[
              { label: 'Atk', value: selectedUnit.stats.attack },
              { label: 'Def', value: selectedUnit.stats.defense },
              { label: 'HP',  value: `${selectedUnit.stats.hp}/${selectedUnit.stats.maxHp}` },
              { label: 'Mov', value: selectedUnit.hasMoved ? 0 : selectedUnit.stats.movement },
            ].map(s => (
              <div key={s.label} className="bg-aetas-bg rounded p-1 text-center">
                <p className="text-aetas-dim text-[9px]">{s.label}</p>
                <p className="text-aetas-text font-medium">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Action row */}
          {isMyTurn && selectedUnit.ownerId === myEnginePlayerId && (() => {
            const adjacentEnemies = units.filter(
              u => u.ownerId !== myEnginePlayerId &&
                   hexDistance(u.position, selectedUnit.position) === 1,
            )
            const adjacentEnemyCities = cities.filter(
              c => c.ownerId !== myEnginePlayerId &&
                   hexDistance(c.position, selectedUnit.position) === 1,
            )
            return (
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5">
                  <div className={`flex-1 py-1.5 text-center rounded-lg text-[10px] font-medium ${
                    selectedUnit.hasMoved ? 'text-aetas-dim' : 'border border-aetas-border text-aetas-muted'
                  }`}>
                    {selectedUnit.hasMoved ? t('unit.moved') : t('unit.move')}
                  </div>
                  {adjacentEnemies.length > 0 && !selectedUnit.hasAttacked && (
                    <button
                      onClick={() => onInitiateCombat?.(selectedUnit.id, adjacentEnemies[0].id)}
                      className="flex-1 py-1.5 rounded-lg bg-red-900/70 text-red-300 text-[10px] font-medium hover:bg-red-800 transition-colors"
                    >
                      {t('unit.attack')}
                    </button>
                  )}
                </div>
                {adjacentEnemyCities.length > 0 && !selectedUnit.hasAttacked && (
                  <button
                    onClick={() => onAttackCity?.(selectedUnit.id, adjacentEnemyCities[0].id)}
                    className="w-full py-1.5 rounded-lg bg-orange-900/70 text-orange-300 text-[10px] font-medium hover:bg-orange-800 transition-colors"
                  >
                    {t('unit.attackCity')}
                  </button>
                )}
              </div>
            )
          })()}

          {/* Found City (Settlers only) */}
          {selectedUnit.canFoundCity && isMyTurn && selectedUnit.ownerId === myEnginePlayerId && (
            <button
              onClick={() => isFoundCityValid && onFoundCity?.(selectedUnit.id)}
              disabled={!isFoundCityValid}
              title={!isFoundCityValid ? t('unit.foundInvalidTitle') : undefined}
              className={`w-full mt-1 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                isFoundCityValid
                  ? 'bg-emerald-800/70 text-emerald-300 hover:bg-emerald-700'
                  : 'bg-aetas-bg text-aetas-dim cursor-not-allowed'
              }`}
            >
              🏛 {t('unit.foundCity')}
            </button>
          )}
        </div>
      ) : isMyTurn ? (
        <p className="text-aetas-dim text-xs py-1">{t('unit.selectPrompt')}</p>
      ) : null}

      {/* Diplomacy */}
      <DiplomacyPanel
        gameState={gameState}
        myEnginePlayerId={myEnginePlayerId}
        isMyTurn={isMyTurn}
        {...diplomacyHandlers}
      />

      {/* Pending disputes */}
      {myPendingDisputes.length > 0 && (
        <div>
          <p className="text-xs text-aetas-muted uppercase tracking-wider mb-1.5">{t('combat.pendingDisputes')}</p>
          {myPendingDisputes.map((d: { id: string; attackerPlayerId: string; defenderPlayerId: string; expiresAt: number }) => {
            const isDefender = d.defenderPlayerId === myEnginePlayerId
            const attacker = civName(players, d.attackerPlayerId)
            const defender = civName(players, d.defenderPlayerId)
            return (
              <div key={d.id} className="bg-amber-950/60 border border-amber-900/50 rounded-lg p-2.5 mb-2">
                <p className="text-amber-300 text-xs font-medium">
                  {attacker} → {defender}
                </p>
                <p className="text-aetas-dim text-xs mt-0.5">
                  {isDefender
                    ? t('combat.beingAttacked', { time: formatCountdown(d.expiresAt, now) })
                    : t('combat.waitingResponse', { defender, time: formatCountdown(d.expiresAt, now) })}
                </p>
                {isDefender && (
                  <button
                    onClick={() => onResolveDispute(d.id)}
                    className="mt-2 w-full py-1.5 rounded-lg bg-amber-800 text-amber-200 text-xs font-medium hover:bg-amber-700 transition-colors"
                  >
                    {t('combat.resolveDispute')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Event log */}
      <div>
        <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-1.5">{t('log.title')}</p>
        <div className="bg-aetas-bg rounded-lg p-2 text-xs space-y-0.5 max-h-40 overflow-y-auto">
          {log.length === 0
            ? <span className="text-aetas-border-strong">{t('log.empty')}</span>
            : log.map((entry, i) => (
              <p key={i} className={
                entry.includes('✗') ? 'text-red-400' :
                entry.startsWith('★') ? 'text-aetas-gold' : 'text-aetas-dim'
              }>
                {entry}
              </p>
            ))
          }
        </div>
      </div>
    </>
  )
}
