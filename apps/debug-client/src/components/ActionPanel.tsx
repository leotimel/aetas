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

export default function ActionPanel({
  gameState, myEnginePlayerId, isMyTurn, selectedUnitId, log, onEndTurn, onResolveDispute,
}: Props) {
  const { combatDisputes, units } = gameState

  const selectedUnit = selectedUnitId ? units.find(u => u.id === selectedUnitId) : undefined

  const myPendingDisputes = combatDisputes.filter(
    d =>
      d.status === CombatDisputeStatus.Pending &&
      (d.attackerPlayerId === myEnginePlayerId || d.defenderPlayerId === myEnginePlayerId),
  )

  return (
    <div style={{ flex: 1, padding: '10px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
      <div style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Ações</div>

      <button onClick={onEndTurn} disabled={!isMyTurn} style={actionBtn(!isMyTurn)}>
        Terminar Turno
      </button>

      {selectedUnit ? (
        <div style={{ color: '#888', fontSize: 11, padding: '3px 0' }}>
          Unidade selecionada: <span style={{ color: '#e6edf3' }}>{selectedUnit.unitType}</span>
          <br />
          {isMyTurn && 'Clique numa unidade inimiga adjacente para atacar.'}
        </div>
      ) : null}

      {/* V2 placeholders */}
      <div style={{ marginTop: 4 }}>
        {['Mover Unidade', 'Fundar Cidade', 'Propor Pacto'].map(label => (
          <button key={label} disabled style={{ ...actionBtn(true), marginBottom: 4, display: 'block', width: '100%' }}>
            {label} <span style={{ fontSize: 9, color: '#374151' }}>[v2]</span>
          </button>
        ))}
      </div>

      {/* Pending disputes */}
      {myPendingDisputes.length > 0 && (
        <>
          <div style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 }}>
            Disputas Pendentes ({myPendingDisputes.length})
          </div>
          {myPendingDisputes.map(d => {
            const isDefender = d.defenderPlayerId === myEnginePlayerId
            const expiresAt = new Date(d.expiresAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            return (
              <div key={d.id} style={{ background: '#1c1a0f', border: '1px solid #4a3800', padding: 8, borderRadius: 4 }}>
                <div style={{ color: '#f59e0b', fontSize: 11 }}>⚔ {d.id.slice(0, 16)}…</div>
                <div style={{ color: '#888', fontSize: 10 }}>
                  {d.attackerPlayerId.slice(0, 6)} → {d.defenderPlayerId.slice(0, 6)}
                  {isDefender ? ' (você defende)' : ' (você ataca)'}
                </div>
                <div style={{ color: '#555', fontSize: 10 }}>Expira às {expiresAt}</div>
                {isDefender && (
                  <button
                    onClick={() => onResolveDispute(d.id)}
                    style={{ ...actionBtn(false), marginTop: 4, background: '#92400e', width: '100%' }}
                  >
                    Resolver (defender posição)
                  </button>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* Event log */}
      <div style={{ color: '#555', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 }}>
        Log de Eventos
      </div>
      <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: 3, padding: 6, flex: 1, overflowY: 'auto', minHeight: 60 }}>
        {log.length === 0 ? (
          <span style={{ color: '#333', fontSize: 11 }}>Sem eventos</span>
        ) : (
          log.map((entry, i) => (
            <div key={i} style={{ color: entry.includes('✓') ? '#22c55e' : entry.includes('✗') ? '#f87171' : '#6b7280', fontSize: 11, lineHeight: 1.5 }}>
              {entry}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function actionBtn(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#161b22' : '#1f6feb',
    color: disabled ? '#4b5563' : '#e6edf3',
    border: `1px solid ${disabled ? '#21262d' : '#1f6feb'}`,
    padding: '5px 8px',
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    textAlign: 'left' as const,
    width: '100%',
  }
}
