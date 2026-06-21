import type { GameState } from '@aetas/game-engine'

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
]

interface Props {
  gameState: GameState
  myEnginePlayerId: string
}

export default function PlayerBar({ gameState, myEnginePlayerId }: Props) {
  const { players, units, cities, currentPlayerId } = gameState

  return (
    <div className="flex gap-2 px-3 py-2 overflow-x-auto">
      {players.map((player, i) => {
        const color = PLAYER_COLORS[i % PLAYER_COLORS.length]
        const isActive = player.id === currentPlayerId
        const isMe = player.id === myEnginePlayerId
        const uCount = units.filter(u => u.ownerId === player.id && !player.isEliminated).length
        const cCount = cities.filter(c => c.ownerId === player.id).length

        return (
          <div
            key={player.id}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg flex-shrink-0 text-xs transition-colors ${
              isActive ? 'bg-slate-700' : 'bg-slate-800/60'
            } ${player.isEliminated ? 'opacity-40' : ''}`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'animate-pulse' : ''}`} style={{ backgroundColor: color }} />
            <span className={`font-mono ${player.isEliminated ? 'line-through text-slate-500' : 'text-slate-200'}`}>
              {player.id.slice(0, 6)}
            </span>
            {isMe && <span className="text-slate-500">(você)</span>}
            {player.isAIControlled && <span>🤖</span>}
            <span className="text-slate-500">{uCount}u {cCount}c</span>
            {isActive && <span className="text-green-400">◄</span>}
          </div>
        )
      })}
    </div>
  )
}
