import type { GameState, DiplomaticProposal, Resources } from '@aetas/game-engine'
import { CIVILIZATIONS, haveMadeContact, relationBetween } from '@aetas/game-engine'

interface Props {
  gameState:          GameState
  myEnginePlayerId:   string
  isMyTurn:           boolean
  onProposePact:      (targetId: string) => void
  onDeclareWar:       (targetId: string) => void
  onBreakPact:        (targetId: string) => void
  onProposePeace:     (targetId: string) => void
  onProposeTrade:     (targetId: string) => void
  onRespondDiplomacy: (proposalId: string, accept: boolean) => void
}

function civName(players: GameState['players'], playerId: string): string {
  const player = players.find(p => p.id === playerId)
  return CIVILIZATIONS.find(c => c.id === player?.civilizationId)?.name ?? playerId.slice(0, 6)
}

const RELATION_CHIP: Record<'neutral' | 'pact' | 'war', { label: string; cls: string }> = {
  neutral: { label: 'Neutro',    cls: 'text-aetas-dim bg-aetas-bg border-aetas-border' },
  pact:    { label: 'Pacto 🤝',  cls: 'text-emerald-300 bg-emerald-950/60 border-emerald-900/50' },
  war:     { label: 'Guerra ⚔️', cls: 'text-red-300 bg-red-950/60 border-red-900/50' },
}

function resStr(r: Resources): string {
  const parts: string[] = []
  if (r.gold) parts.push(`${r.gold}🪙`)
  if (r.food) parts.push(`${r.food}🌾`)
  if (r.production) parts.push(`${r.production}⚙️`)
  return parts.length ? parts.join(' ') : 'nada'
}

/** Describes a proposal from the RESPONDER's perspective (the local player is the target). */
function describeIncoming(p: DiplomaticProposal): string {
  const kind = p.kind ?? (p.terms ? 'trade' : 'pact')
  if (kind === 'pact')  return 'Propõe um Pacto de Não-Agressão'
  if (kind === 'peace') return 'Propõe Paz'
  if (p.terms) return `Você recebe ${resStr(p.terms.offer)} · você dá ${resStr(p.terms.request)}`
  return 'Proposta diplomática'
}

const TURN_HINT = 'Só no seu turno'

export default function DiplomacyPanel({
  gameState, myEnginePlayerId, isMyTurn,
  onProposePact, onDeclareWar, onBreakPact, onProposePeace, onProposeTrade, onRespondDiplomacy,
}: Props) {
  const me = myEnginePlayerId
  const others = gameState.players.filter(
    p => p.id !== me && !p.isEliminated && haveMadeContact(gameState, me, p.id),
  )

  const incoming = gameState.diplomaticProposals.filter(
    p => p.status === 'pending' && p.targetId === me,
  )
  const outgoingByTarget = new Map(
    gameState.diplomaticProposals
      .filter(p => p.status === 'pending' && p.proposerId === me)
      .map(p => [p.targetId, p]),
  )

  return (
    <div>
      <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-1.5">Diplomacia</p>

      {others.length === 0 && incoming.length === 0 && (
        <p className="text-aetas-dim text-xs py-1">Nenhuma civilização conhecida ainda. Explore o mapa para fazer contato.</p>
      )}

      {/* Incoming proposals — actionable on your turn */}
      {incoming.map(p => (
        <div key={p.id} className="bg-amber-950/50 border border-amber-900/50 rounded-lg p-2.5 mb-2">
          <p className="text-amber-300 text-xs font-medium">{civName(gameState.players, p.proposerId)}</p>
          <p className="text-aetas-dim text-[11px] mt-0.5">{describeIncoming(p)}</p>
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={() => onRespondDiplomacy(p.id, true)}
              disabled={!isMyTurn}
              title={!isMyTurn ? TURN_HINT : undefined}
              className="flex-1 py-1.5 rounded-lg bg-emerald-800/80 text-emerald-200 text-[11px] font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Aceitar
            </button>
            <button
              onClick={() => onRespondDiplomacy(p.id, false)}
              disabled={!isMyTurn}
              title={!isMyTurn ? TURN_HINT : undefined}
              className="flex-1 py-1.5 rounded-lg bg-aetas-raised text-aetas-muted text-[11px] font-medium hover:bg-aetas-panel disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Recusar
            </button>
          </div>
        </div>
      ))}

      {/* Relations + actions per known player */}
      {others.map(other => {
        const relation = relationBetween(gameState, me, other.id)
        const chip = RELATION_CHIP[relation]
        const pendingOut = outgoingByTarget.get(other.id)
        return (
          <div key={other.id} className="bg-aetas-raised rounded-lg p-2.5 mb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-aetas-text text-xs font-medium">{civName(gameState.players, other.id)}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${chip.cls}`}>{chip.label}</span>
            </div>

            {pendingOut ? (
              <p className="text-aetas-dim text-[11px]">⏳ Aguardando resposta…</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {relation === 'neutral' && (
                  <>
                    <DiploButton label="Propor Pacto" disabled={!isMyTurn} onClick={() => onProposePact(other.id)} />
                    <DiploButton label="Declarar Guerra ⚔" tone="danger" disabled={!isMyTurn} onClick={() => onDeclareWar(other.id)} />
                  </>
                )}
                {relation === 'pact' && (
                  <>
                    <DiploButton label="Propor Troca 📦" disabled={!isMyTurn} onClick={() => onProposeTrade(other.id)} />
                    <DiploButton label="Romper Pacto 💔" tone="danger" disabled={!isMyTurn} onClick={() => onBreakPact(other.id)} />
                  </>
                )}
                {relation === 'war' && (
                  <DiploButton label="Propor Paz 🕊️" tone="peace" disabled={!isMyTurn} onClick={() => onProposePeace(other.id)} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DiploButton({
  label, onClick, disabled, tone = 'neutral',
}: { label: string; onClick: () => void; disabled?: boolean; tone?: 'neutral' | 'danger' | 'peace' }) {
  const toneCls =
    tone === 'danger' ? 'bg-red-900/60 text-red-300 hover:bg-red-800'
    : tone === 'peace' ? 'bg-sky-900/60 text-sky-300 hover:bg-sky-800'
    : 'bg-aetas-bg border border-aetas-border text-aetas-muted hover:bg-aetas-panel'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? TURN_HINT : undefined}
      className={`flex-1 min-w-[7rem] py-1.5 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${toneCls}`}
    >
      {label}
    </button>
  )
}
