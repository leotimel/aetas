import { useState } from 'react'
import type { GameState } from '@aetas/game-engine'
import { CombatDisputeStatus } from '@aetas/game-engine'

interface Props {
  gameState: GameState
  myEnginePlayerId: string
  isMyTurn: boolean
  selectedUnitId: string | null
  log: string[]
  onEndTurn: () => void
  onResolveDispute: (disputeId: string) => void
}

export default function ActionSheet({
  gameState, myEnginePlayerId, isMyTurn, selectedUnitId, log, onEndTurn, onResolveDispute,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  const { combatDisputes, units } = gameState
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
        <div className={`bg-slate-900 border-t border-slate-700 transition-all duration-300 ${expanded ? 'max-h-[50vh]' : 'max-h-20'} overflow-hidden`}>
          {/* Handle + quick actions */}
          <div className="flex items-center gap-2 px-3 pt-3 pb-2">
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-8 h-1 rounded-full bg-slate-600 mx-auto absolute left-1/2 -translate-x-1/2 top-2"
              aria-label="Expandir painel"
            />
            <div className="flex gap-2 w-full mt-2">
              <button
                onClick={onEndTurn}
                disabled={!isMyTurn}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  isMyTurn
                    ? 'bg-green-600 text-white hover:bg-green-500 active:bg-green-700'
                    : 'bg-slate-800 text-slate-600 cursor-not-allowed'
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
                className="w-10 rounded-xl bg-slate-800 text-slate-400 text-sm flex items-center justify-center"
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
                log={log}
                onResolveDispute={onResolveDispute}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop: right sidebar ── */}
      <div className="hidden md:flex flex-col w-72 flex-shrink-0 border-l border-slate-800 bg-slate-900 overflow-y-auto">
        <div className="p-3 flex flex-col gap-2">
          <button
            onClick={onEndTurn}
            disabled={!isMyTurn}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              isMyTurn
                ? 'bg-green-600 text-white hover:bg-green-500'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            {isMyTurn ? 'Terminar Turno' : 'Aguardando turno…'}
          </button>

          <ExpandedContent
            selectedUnit={selectedUnit}
            isMyTurn={isMyTurn}
            myPendingDisputes={myPendingDisputes}
            myEnginePlayerId={myEnginePlayerId}
            log={log}
            onResolveDispute={onResolveDispute}
          />
        </div>
      </div>
    </>
  )
}

function ExpandedContent({
  selectedUnit, isMyTurn, myPendingDisputes, myEnginePlayerId, log, onResolveDispute,
}: {
  selectedUnit: { unitType: string } | undefined
  isMyTurn: boolean
  myPendingDisputes: ReturnType<typeof Array.prototype.filter>
  myEnginePlayerId: string
  log: string[]
  onResolveDispute: (id: string) => void
}) {
  return (
    <>
      {/* Selected unit info */}
      {selectedUnit && (
        <div className="bg-slate-800 rounded-lg p-2.5 text-xs text-slate-400">
          <span className="text-slate-200 font-medium capitalize">{selectedUnit.unitType}</span> selecionado
          {isMyTurn && <p className="mt-0.5 text-slate-500">Clique numa unidade inimiga adjacente para atacar.</p>}
        </div>
      )}

      {/* v2 placeholder actions */}
      <div className="flex flex-col gap-1.5">
        {['Mover Unidade', 'Fundar Cidade'].map(label => (
          <button
            key={label}
            disabled
            className="w-full py-2 px-3 rounded-lg bg-slate-800/50 text-slate-600 text-xs text-left cursor-not-allowed"
          >
            {label} <span className="text-slate-700">[v2]</span>
          </button>
        ))}
      </div>

      {/* Diplomacy */}
      <div>
        <p className="text-xs text-slate-600 uppercase tracking-wider mb-1.5">
          Diplomacia <span className="text-slate-700">[v2]</span>
        </p>
        <div className="flex flex-col gap-1">
          {[
            { label: 'Propor Pacto de Não-Agressão', icon: '🤝' },
            { label: 'Propor Troca de Recursos', icon: '🔄' },
            { label: 'Declarar Guerra', icon: '⚔️' },
          ].map(({ label, icon }) => (
            <button
              key={label}
              disabled
              className="flex items-center gap-2 w-full py-2 px-3 rounded-lg bg-slate-800/30 text-slate-700 text-xs text-left cursor-not-allowed"
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Pending disputes */}
      {myPendingDisputes.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1.5">Disputas Pendentes</p>
          {myPendingDisputes.map((d: { id: string; attackerPlayerId: string; defenderPlayerId: string; expiresAt: number }) => {
            const isDefender = d.defenderPlayerId === myEnginePlayerId
            return (
              <div key={d.id} className="bg-amber-950/60 border border-amber-900/50 rounded-lg p-2.5 mb-2">
                <p className="text-amber-400 text-xs font-mono">{d.id.slice(0, 20)}…</p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {d.attackerPlayerId.slice(0, 6)} → {d.defenderPlayerId.slice(0, 6)}
                  {isDefender ? ' (você defende)' : ' (você ataca)'}
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
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-1.5">Log</p>
        <div className="bg-slate-950 rounded-lg p-2 text-xs space-y-0.5 max-h-40 overflow-y-auto">
          {log.length === 0
            ? <span className="text-slate-700">Sem eventos</span>
            : log.map((entry, i) => (
              <p key={i} className={
                entry.includes('✓') ? 'text-green-400' :
                entry.includes('✗') ? 'text-red-400' : 'text-slate-500'
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
