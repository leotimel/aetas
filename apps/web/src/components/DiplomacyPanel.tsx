import { useTranslation } from 'react-i18next'
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

function resStr(r: Resources, nothing: string): string {
  const parts: string[] = []
  if (r.gold)       parts.push(`${r.gold}🪙`)
  if (r.food)       parts.push(`${r.food}🌾`)
  if (r.production) parts.push(`${r.production}⚙️`)
  return parts.length ? parts.join(' ') : nothing
}

const RELATION_CLS: Record<'neutral' | 'pact' | 'war', string> = {
  neutral: 'text-aetas-dim bg-aetas-bg border-aetas-border',
  pact:    'text-emerald-300 bg-emerald-950/60 border-emerald-900/50',
  war:     'text-red-300 bg-red-950/60 border-red-900/50',
}

export default function DiplomacyPanel({
  gameState, myEnginePlayerId, isMyTurn,
  onProposePact, onDeclareWar, onBreakPact, onProposePeace, onProposeTrade, onRespondDiplomacy,
}: Props) {
  const { t } = useTranslation()

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

  const nothing = t('diplo.nothing')
  const turnHint = t('diplo.turnHint')

  function describeIncoming(p: DiplomaticProposal): string {
    const kind = p.kind ?? (p.terms ? 'trade' : 'pact')
    if (kind === 'pact')  return t('diplo.incomingPact')
    if (kind === 'peace') return t('diplo.incomingPeace')
    if (p.terms) return t('diplo.incomingTradeOffer', { offer: resStr(p.terms.offer, nothing), request: resStr(p.terms.request, nothing) })
    return t('diplo.incomingUnknown')
  }

  const RELATION_LABEL: Record<'neutral' | 'pact' | 'war', string> = {
    neutral: t('diplo.neutral'),
    pact:    t('diplo.pact'),
    war:     t('diplo.war'),
  }

  return (
    <div>
      <p className="font-display text-xs text-aetas-dim uppercase tracking-wider mb-1.5">{t('diplo.title')}</p>

      {others.length === 0 && incoming.length === 0 && (
        <p className="text-aetas-dim text-xs py-1">{t('diplo.noCivKnown')}</p>
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
              title={!isMyTurn ? turnHint : undefined}
              className="flex-1 py-1.5 rounded-lg bg-emerald-800/80 text-emerald-200 text-[11px] font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('diplo.accept')}
            </button>
            <button
              onClick={() => onRespondDiplomacy(p.id, false)}
              disabled={!isMyTurn}
              title={!isMyTurn ? turnHint : undefined}
              className="flex-1 py-1.5 rounded-lg bg-aetas-raised text-aetas-muted text-[11px] font-medium hover:bg-aetas-panel disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('diplo.refuse')}
            </button>
          </div>
        </div>
      ))}

      {/* Relations + actions per known player */}
      {others.map(other => {
        const relation = relationBetween(gameState, me, other.id)
        const labelCls = RELATION_CLS[relation]
        const pendingOut = outgoingByTarget.get(other.id)
        return (
          <div key={other.id} className="bg-aetas-raised rounded-lg p-2.5 mb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-aetas-text text-xs font-medium">{civName(gameState.players, other.id)}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${labelCls}`}>{RELATION_LABEL[relation]}</span>
            </div>

            {pendingOut ? (
              <p className="text-aetas-dim text-[11px]">{t('diplo.waitingResp')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {relation === 'neutral' && (
                  <>
                    <DiploButton label={t('diplo.proposePact')} disabled={!isMyTurn} turnHint={turnHint} onClick={() => onProposePact(other.id)} />
                    <DiploButton label={t('diplo.declareWar')} tone="danger" disabled={!isMyTurn} turnHint={turnHint} onClick={() => onDeclareWar(other.id)} />
                  </>
                )}
                {relation === 'pact' && (
                  <>
                    <DiploButton label={t('diplo.proposeTrade')} disabled={!isMyTurn} turnHint={turnHint} onClick={() => onProposeTrade(other.id)} />
                    <DiploButton label={t('diplo.breakPact')} tone="danger" disabled={!isMyTurn} turnHint={turnHint} onClick={() => onBreakPact(other.id)} />
                  </>
                )}
                {relation === 'war' && (
                  <DiploButton label={t('diplo.proposePeace')} tone="peace" disabled={!isMyTurn} turnHint={turnHint} onClick={() => onProposePeace(other.id)} />
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
  label, onClick, disabled, tone = 'neutral', turnHint,
}: { label: string; onClick: () => void; disabled?: boolean; tone?: 'neutral' | 'danger' | 'peace'; turnHint: string }) {
  const toneCls =
    tone === 'danger' ? 'bg-red-900/60 text-red-300 hover:bg-red-800'
    : tone === 'peace' ? 'bg-sky-900/60 text-sky-300 hover:bg-sky-800'
    : 'bg-aetas-bg border border-aetas-border text-aetas-muted hover:bg-aetas-panel'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? turnHint : undefined}
      className={`flex-1 min-w-[7rem] py-1.5 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${toneCls}`}
    >
      {label}
    </button>
  )
}
