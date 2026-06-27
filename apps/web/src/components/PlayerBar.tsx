import { useTranslation } from 'react-i18next'
import type { GameState } from '@aetas/game-engine'
import { CIVILIZATIONS, scorePlayer } from '@aetas/game-engine'

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
]

function civColor(civilizationId: string, fallback: string): string {
  return CIVILIZATIONS.find(c => c.id === civilizationId)?.color ?? fallback
}

interface Props {
  gameState:        GameState
  myEnginePlayerId: string
  onScoreClick?:    () => void
}

export default function PlayerBar({ gameState, myEnginePlayerId, onScoreClick }: Props) {
  const { t } = useTranslation()
  const { players, units, cities, currentPlayerId } = gameState

  const civCount: Record<string, number> = {}
  const civSeen:  Record<string, number> = {}
  for (const p of players) civCount[p.civilizationId] = (civCount[p.civilizationId] ?? 0) + 1

  return (
    <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto bg-aetas-surface">
      {players.map((player, i) => {
        const color    = civColor(player.civilizationId, PLAYER_COLORS[i % PLAYER_COLORS.length])
        const civ      = CIVILIZATIONS.find(c => c.id === player.civilizationId)
        const isActive = player.id === currentPlayerId
        const isMe     = player.id === myEnginePlayerId
        const uCount   = units.filter(u => u.ownerId === player.id && !player.isEliminated).length
        const cCount   = cities.filter(c => c.ownerId === player.id).length
        const score    = scorePlayer(gameState, player.id)

        let civIdx: number | null = null
        if ((civCount[player.civilizationId] ?? 0) > 1) {
          civSeen[player.civilizationId] = (civSeen[player.civilizationId] ?? 0) + 1
          civIdx = civSeen[player.civilizationId]
        }

        return (
          <button
            key={player.id}
            onClick={onScoreClick}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg flex-shrink-0 text-xs transition-colors text-left ${
              isActive ? 'bg-aetas-panel' : 'bg-aetas-raised/60'
            } ${player.isEliminated ? 'opacity-40' : ''} ${onScoreClick ? 'hover:bg-aetas-panel cursor-pointer' : 'cursor-default'}`}
            style={isActive ? { borderLeft: `3px solid ${color}`, paddingLeft: '5px' } : {}}
          >
            {civ && (
              <span className="text-base leading-none flex-shrink-0" title={civ.name}>
                {civ.flag}
                {civIdx !== null && (
                  <sup className="text-[8px] text-aetas-dim leading-none">{civIdx}</sup>
                )}
              </span>
            )}
            <span className={player.isEliminated ? 'line-through text-aetas-dim' : 'text-aetas-text'}>
              {player.displayName ?? civ?.name ?? player.id.slice(0, 6)}
            </span>
            {isMe && <span className="text-aetas-dim">{t('ui.you')}</span>}
            {player.isAIControlled && <span>🤖</span>}
            <span className="text-aetas-dim">⚔{uCount} 🏛{cCount}</span>
            <span className="text-aetas-gold font-medium">{score.total}pts</span>
            {isActive && <span className="text-aetas-gold text-[10px]">◄</span>}
          </button>
        )
      })}
    </div>
  )
}
