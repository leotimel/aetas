import { useTranslation } from 'react-i18next'
import type { GameState } from '@aetas/game-engine'
import { CIVILIZATIONS, ERA_SCIENCE_THRESHOLDS_ARRAY, scorePlayer } from '@aetas/game-engine'
import { ERA_ICONS, ERA_ORDER_UI } from './EraModal.tsx'
import { Era } from '@aetas/game-engine'

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
]

function civColor(civilizationId: string, fallback: string): string {
  return CIVILIZATIONS.find(c => c.id === civilizationId)?.color ?? fallback
}

const ERA_NAME_KEY: Record<Era, 'era.ancient' | 'era.classical' | 'era.medieval'> = {
  [Era.Ancient]:   'era.ancient',
  [Era.Classical]: 'era.classical',
  [Era.Medieval]:  'era.medieval',
}

interface Props {
  gameState:       GameState
  myEnginePlayerId: string
  onScoreClick?:   () => void
}

export default function PlayerBar({ gameState, myEnginePlayerId, onScoreClick }: Props) {
  const { t } = useTranslation()
  const { players, units, cities, currentPlayerId } = gameState
  const eraIdx    = ERA_ORDER_UI.indexOf(gameState.era)
  const eraProgress = gameState.eraProgress ?? 0
  const threshold = ERA_SCIENCE_THRESHOLDS_ARRAY[eraIdx] as number | undefined
  const eraName = t(ERA_NAME_KEY[gameState.era])

  return (
    <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto bg-aetas-surface">
      {players.map((player, i) => {
        const color = civColor(player.civilizationId, PLAYER_COLORS[i % PLAYER_COLORS.length])
        const civ = CIVILIZATIONS.find(c => c.id === player.civilizationId)
        const isActive = player.id === currentPlayerId
        const isMe = player.id === myEnginePlayerId
        const uCount = units.filter(u => u.ownerId === player.id && !player.isEliminated).length
        const cCount = cities.filter(c => c.ownerId === player.id).length
        const score = scorePlayer(gameState, player.id)

        return (
          <button
            key={player.id}
            onClick={onScoreClick}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg flex-shrink-0 text-xs transition-colors text-left ${
              isActive ? 'bg-aetas-panel' : 'bg-aetas-raised/60'
            } ${player.isEliminated ? 'opacity-40' : ''} ${onScoreClick ? 'hover:bg-aetas-panel cursor-pointer' : 'cursor-default'}`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'animate-pulse' : ''}`} style={{ backgroundColor: color }} />
            {civ && <span title={civ.name}>{civ.flag}</span>}
            <span className={`${player.isEliminated ? 'line-through text-aetas-dim' : 'text-aetas-text'}`}>
              {player.displayName ?? civ?.name ?? player.id.slice(0, 6)}
            </span>
            {isMe && <span className="text-aetas-dim">{t('ui.you')}</span>}
            {player.isAIControlled && <span>🤖</span>}
            <span className="text-aetas-dim">{uCount}u {cCount}c</span>
            <span className="text-aetas-gold font-medium">{score.total}pts</span>
            {isActive && <span className="text-aetas-gold">◄</span>}
          </button>
        )
      })}

      {/* Era badge — global per-game, shown once after the player list */}
      <div className="flex-shrink-0 flex items-center gap-1 ml-1 pl-2 border-l border-aetas-border text-xs text-aetas-muted whitespace-nowrap">
        <span title={eraName}>{ERA_ICONS[gameState.era]}</span>
        <span className="hidden sm:inline">{eraName}</span>
        {threshold !== undefined && (
          <span className="text-[9px] text-aetas-dim">({eraProgress}/{threshold}⚗)</span>
        )}
      </div>
    </div>
  )
}
