import type { GameState } from '@aetas/game-engine'

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
]

interface Props {
  gameState: GameState
  myEnginePlayerId: string
}

export default function GameInfo({ gameState, myEnginePlayerId }: Props) {
  const { players, units, cities } = gameState

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid #30363d', fontSize: 12 }}>
      <div style={{ color: '#555', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Jogadores</div>
      {players.map((player, i) => {
        const color = PLAYER_COLORS[i % PLAYER_COLORS.length]
        const isActive = player.id === gameState.currentPlayerId
        const isMe = player.id === myEnginePlayerId
        const uCount = units.filter(u => u.ownerId === player.id).length
        const cCount = cities.filter(c => c.ownerId === player.id).length

        return (
          <div
            key={player.id}
            style={{
              padding: '3px 6px',
              marginBottom: 2,
              borderRadius: 3,
              borderLeft: `3px solid ${color}`,
              background: isActive ? '#1a261a' : 'transparent',
            }}
          >
            <span style={{ color: player.isEliminated ? '#4b5563' : color }}>
              {player.id.slice(0, 8)}
            </span>
            {isMe && <span style={{ color: '#888', marginLeft: 4 }}>(você)</span>}
            {player.isAIControlled && <span style={{ marginLeft: 4 }}>🤖</span>}
            {player.isEliminated && <span style={{ color: '#6b7280', marginLeft: 4 }}>✗</span>}
            <span style={{ color: '#555', marginLeft: 8 }}>
              {uCount}u {cCount}c
            </span>
            {isActive && <span style={{ color: '#22c55e', marginLeft: 6, fontSize: 10 }}>◄</span>}
          </div>
        )
      })}
    </div>
  )
}
