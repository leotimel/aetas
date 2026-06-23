import { useMemo } from 'react'
import type { GameState } from '@aetas/game-engine'
import { CIVILIZATIONS, scoreAll } from '@aetas/game-engine'

interface Props {
  gameState:        GameState
  myEnginePlayerId: string
  onClose:          () => void
}

function civName(players: GameState['players'], playerId: string): string {
  const player = players.find(p => p.id === playerId)
  return CIVILIZATIONS.find(c => c.id === player?.civilizationId)?.name ?? playerId.slice(0, 6)
}

function civFlag(players: GameState['players'], playerId: string): string {
  const player = players.find(p => p.id === playerId)
  return CIVILIZATIONS.find(c => c.id === player?.civilizationId)?.flag ?? '🏛️'
}

export default function ScoreModal({ gameState, myEnginePlayerId, onClose }: Props) {
  const scores = useMemo(() => scoreAll(gameState), [gameState])

  const ranked = useMemo(() => {
    return [...gameState.players].sort(
      (a, b) => (scores[b.id]?.total ?? 0) - (scores[a.id]?.total ?? 0)
    )
  }, [gameState.players, scores])

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-aetas-surface border border-aetas-border-strong rounded-2xl w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-aetas-border">
          <h2 className="font-display text-sm font-semibold text-aetas-text uppercase tracking-wider">
            Placar ao Vivo
          </h2>
          <button
            onClick={onClose}
            className="text-aetas-dim hover:text-aetas-text transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        <div className="p-3">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-2 mb-1 text-[10px] text-aetas-dim uppercase tracking-wider">
            <span>Civilização</span>
            <span className="text-right">Terr.</span>
            <span className="text-right">Pop.</span>
            <span className="text-right">Dev.</span>
            <span className="text-right font-semibold">Total</span>
          </div>

          <div className="flex flex-col gap-1">
            {ranked.map((player, i) => {
              const s    = scores[player.id] ?? { territory: 0, population: 0, development: 0, total: 0 }
              const isMe = player.id === myEnginePlayerId
              return (
                <div
                  key={player.id}
                  className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 items-center px-2 py-1.5 rounded-lg text-xs ${
                    player.isEliminated
                      ? 'opacity-40'
                      : isMe
                        ? 'bg-aetas-panel'
                        : 'bg-aetas-raised'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-aetas-dim text-[10px] w-4 text-center">{i + 1}.</span>
                    <span>{civFlag(gameState.players, player.id)}</span>
                    <span className={`truncate ${player.isEliminated ? 'line-through text-aetas-dim' : 'text-aetas-text'}`}>
                      {civName(gameState.players, player.id)}
                      {isMe && <span className="text-aetas-dim"> (você)</span>}
                    </span>
                  </div>
                  <span className="text-right text-aetas-muted">{s.territory}</span>
                  <span className="text-right text-aetas-muted">{s.population}</span>
                  <span className="text-right text-aetas-muted">{s.development}</span>
                  <span className="text-right font-bold text-aetas-text">{s.total}</span>
                </div>
              )
            })}
          </div>

          <p className="text-[10px] text-aetas-dim mt-3 px-2">
            Território (cidades × 3) + População + Desenvolvimento (nível + edifícios)
          </p>
        </div>
      </div>
    </div>
  )
}
