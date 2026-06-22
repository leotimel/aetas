import { useState } from 'react'
import type { GameState } from '@aetas/game-engine'
import { CombatDisputeStatus, CIVILIZATIONS } from '@aetas/game-engine'

interface Props {
  gameState: GameState
  myEnginePlayerId: string
  isMyTurn: boolean
  selectedUnitId: string | null
  log: string[]
  onEndTurn: () => void
  onResolveDispute: (disputeId: string) => void
}

function civName(players: GameState['players'], playerId: string): string {
  const player = players.find(p => p.id === playerId)
  return CIVILIZATIONS.find(c => c.id === player?.civilizationId)?.name ?? playerId.slice(0, 6)
}

export default function ActionSheet({
  gameState, myEnginePlayerId, isMyTurn, selectedUnitId, log, onEndTurn, onResolveDispute,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  const { combatDisputes, units, players } = gameState
  const selectedUnit = selectedUnitId ? units.find(u => u.id === selectedUnitId) : undefined
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
          <div className="flex items-center gap-2 px-3 pt-3 pb-2">
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-8 h-1 rounded-full bg-aetas-border-strong mx-auto absolute left-1/2 -translate-x-1/2 top-2"
              aria-label="Expandir painel"
            />
            <div className="flex gap-2 w-full mt-2">
              <button
                onClick={onEndTurn}
                disabled={!isMyTurn}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  isMyTurn
                    ? 'bg-aetas-gold text-aetas-bg hover:bg-aetas-gold-light active:bg-aetas-gold-dark'
                    : 'bg-aetas-raised text-aetas-dim cursor-not-allowed'
                }`}
              >
                {isMyTurn ? 'Terminar Turno ✓' : 'Aguardando…'}
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
                players={players}
                log={log}
                onResolveDispute={onResolveDispute}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop: right sidebar ── */}
      <div className="hidden md:flex flex-col w-72 flex-shrink-0 border-l border-aetas-border bg-aetas-surface overflow-y-auto">
        <div className="p-3 flex flex-col gap-2">
          <button
            onClick={onEndTurn}
            disabled={!isMyTurn}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-colors ${
              isMyTurn
                ? 'bg-aetas-gold text-aetas-bg hover:bg-aetas-gold-light active:bg-aetas-gold-dark'
                : 'bg-aetas-raised text-aetas-dim cursor-not-allowed opacity-50'
            }`}
          >
            {isMyTurn ? 'Terminar Turno' : 'Aguardando turno…'}
          </button>

          <ExpandedContent
            selectedUnit={selectedUnit}
            isMyTurn={isMyTurn}
            myPendingDisputes={myPendingDisputes}
            myEnginePlayerId={myEnginePlayerId}
            players={players}
            log={log}
            onResolveDispute={onResolveDispute}
          />
        </div>
      </div>
    </>
  )
}

function ExpandedContent({
  selectedUnit, isMyTurn, myPendingDisputes, myEnginePlayerId, players, log, onResolveDispute,
}: {
  selectedUnit: { unitType: string } | undefined
  isMyTurn: boolean
  myPendingDisputes: ReturnType<typeof Array.prototype.filter>
  myEnginePlayerId: string
  players: GameState['players']
  log: string[]
  onResolveDispute: (id: string) => void
}) {
  return (
    <>
      {/* Selected unit info / guidance */}
      {selectedUnit ? (
        <div className="bg-aetas-raised rounded-lg p-2.5 text-xs text-aetas-muted">
          <span className="text-aetas-text font-medium capitalize">{selectedUnit.unitType}</span> selecionado
          {isMyTurn && <p className="mt-0.5 text-aetas-dim">Clique numa unidade inimiga adjacente para atacar.</p>}
        </div>
      ) : isMyTurn ? (
        <p className="text-aetas-dim text-xs py-1">Selecione uma unidade no mapa para agir.</p>
      ) : null}

      {/* Diplomacy — coming soon */}
      <div className="flex items-center gap-2 py-1">
        <p className="font-display text-xs text-aetas-dim uppercase tracking-wider">Diplomacia</p>
        <span
          className="text-xs text-aetas-dim bg-aetas-raised px-1.5 py-0.5 rounded-full border border-aetas-border"
          title="Pactos, trocas e declarações de guerra — disponível em breve"
        >
          em breve
        </span>
      </div>

      {/* Pending disputes */}
      {myPendingDisputes.length > 0 && (
        <div>
          <p className="text-xs text-aetas-muted uppercase tracking-wider mb-1.5">Disputas Pendentes</p>
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
                  {isDefender ? 'Você está sendo atacado' : 'Aguardando resolução'}
                </p>
                {isDefender && (
                  <button
                    onClick={() => onResolveDispute(d.id)}
                    className="mt-2 w-full py-1.5 rounded-lg bg-amber-800 text-amber-200 text-xs font-medium hover:bg-amber-700 transition-colors"
                  >
                    Resolver disputa
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Event log */}
      <div>
        <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-1.5">Log</p>
        <div className="bg-aetas-bg rounded-lg p-2 text-xs space-y-0.5 max-h-40 overflow-y-auto">
          {log.length === 0
            ? <span className="text-aetas-border-strong">As ações do turno aparecerão aqui.</span>
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
