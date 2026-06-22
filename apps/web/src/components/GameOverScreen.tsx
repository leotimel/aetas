import type { GameState } from '@aetas/game-engine'
import { rankPlayers, xpToLevel, xpProgress, TERRITORY_POINTS_PER_CITY, POPULATION_POINTS_PER_POP, DEVELOPMENT_POINTS_PER_LEVEL, CIVILIZATIONS } from '@aetas/game-engine'

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
]

const MEDALS = ['🥇', '🥈', '🥉']

function civColor(civilizationId: string | undefined, fallback: string): string {
  return (civilizationId ? CIVILIZATIONS.find(c => c.id === civilizationId)?.color : undefined) ?? fallback
}

interface Props {
  gameState: GameState
  myEnginePlayerId: string
  xpGain: { gained: number; newXp: number } | null
  onBack: () => void
}

export default function GameOverScreen({ gameState, myEnginePlayerId, xpGain, onBack }: Props) {
  const ranked = rankPlayers(gameState)
  const winner = ranked[0]
  const iWon = winner?.playerId === myEnginePlayerId

  const playerIndexMap = new Map(gameState.players.map((p, i) => [p.id, i]))

  return (
    <div className="fixed inset-0 z-50 bg-aetas-bg/95 flex flex-col items-center justify-center p-4">
      {/* Trophy + headline */}
      <div className="text-center mb-6">
        <p className="text-5xl mb-3">{iWon ? '🏆' : '🎮'}</p>
        <h1 className="font-display text-aetas-text text-2xl font-semibold">
          {iWon ? 'Você venceu!' : 'Fim de Partida'}
        </h1>
        {winner && (
          <p className="text-aetas-muted text-sm mt-1">
            {iWon
              ? 'Parabéns pela vitória!'
              : (() => {
                  const wp = gameState.players.find(p => p.id === winner.playerId)
                  const wName = CIVILIZATIONS.find(c => c.id === wp?.civilizationId)?.name ?? winner.playerId.slice(0, 8)
                  return `${wName} venceram`
                })()
            }
          </p>
        )}
        {!winner && <p className="text-aetas-muted text-sm mt-1">Empate!</p>}
      </div>

      {/* Score table */}
      <div className="w-full max-w-sm bg-aetas-surface border border-aetas-border-strong rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-5 gap-0 px-4 py-2 bg-aetas-raised/60 border-b border-aetas-border-strong">
          <div className="col-span-2 text-xs text-aetas-muted uppercase tracking-wider">Jogador</div>
          <div className="text-xs text-aetas-muted text-center" title={`${TERRITORY_POINTS_PER_CITY}pts/cidade`}>Terr.</div>
          <div className="text-xs text-aetas-muted text-center" title={`${POPULATION_POINTS_PER_POP}pts/pop`}>Pop.</div>
          <div className="text-xs text-aetas-muted text-right" title={`${DEVELOPMENT_POINTS_PER_LEVEL}pts/nível`}>Total</div>
        </div>

        {/* Rows */}
        {ranked.map((score, i) => {
          const playerIndex = playerIndexMap.get(score.playerId) ?? 0
          const player = gameState.players.find(p => p.id === score.playerId)
          const color = civColor(player?.civilizationId, PLAYER_COLORS[playerIndex % PLAYER_COLORS.length])
          const isMe = score.playerId === myEnginePlayerId
          const medal = MEDALS[i] ?? `#${i + 1}`

          return (
            <div
              key={score.playerId}
              className={`grid grid-cols-5 gap-0 px-4 py-3 border-b border-aetas-border last:border-0 ${
                i === 0 ? 'bg-aetas-raised/40' : ''
              } ${isMe ? 'ring-1 ring-inset ring-aetas-gold/40' : ''}`}
            >
              {/* Player column */}
              <div className="col-span-2 flex items-center gap-2">
                <span className="text-sm">{medal}</span>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <div className="min-w-0">
                  <p className="text-aetas-muted text-xs truncate">
                    {CIVILIZATIONS.find(c => c.id === player?.civilizationId)?.name ?? score.playerId.slice(0, 8)}
                  </p>
                  <p className="text-aetas-dim text-xs">
                    {isMe && 'você '}
                    {player?.isAIControlled && '🤖'}
                    {player?.isEliminated && 'elim.'}
                  </p>
                </div>
              </div>

              {/* Score columns */}
              <ScoreCell value={score.territory} />
              <ScoreCell value={score.population} />
              <div className="text-right">
                <span className={`text-sm font-bold ${i === 0 ? 'text-aetas-gold' : 'text-aetas-text'}`}>
                  {score.total}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Score legend */}
      <div className="flex gap-4 mt-3 mb-4">
        <LegendItem label="Território" pts={TERRITORY_POINTS_PER_CITY} unit="cidade" />
        <LegendItem label="População" pts={POPULATION_POINTS_PER_POP} unit="pop" />
        <LegendItem label="Desenvolvimento" pts={DEVELOPMENT_POINTS_PER_LEVEL} unit="nível" />
      </div>

      {/* XP gain */}
      {xpGain && <XpGainBanner gained={xpGain.gained} newXp={xpGain.newXp} />}

      <button
        onClick={onBack}
        className="mt-4 px-8 py-3 rounded-2xl bg-aetas-gold text-aetas-bg font-bold hover:bg-aetas-gold-light active:bg-aetas-gold-dark transition-colors"
      >
        Voltar à lista
      </button>
    </div>
  )
}

function ScoreCell({ value }: { value: number }) {
  return (
    <div className="text-center">
      <span className="text-aetas-muted text-xs">{value}</span>
    </div>
  )
}

function LegendItem({ label, pts, unit }: { label: string; pts: number; unit: string }) {
  return (
    <div className="text-center">
      <p className="text-aetas-dim text-xs">{label}</p>
      <p className="text-aetas-dim text-xs">{pts}pts/{unit}</p>
    </div>
  )
}

function XpGainBanner({ gained, newXp }: { gained: number; newXp: number }) {
  const level = xpToLevel(newXp)
  const [progress, range] = xpProgress(newXp)
  const pct = Math.round((progress / (range || 1)) * 100)

  return (
    <div className="w-full max-w-sm bg-aetas-gold/10 border border-aetas-gold/30 rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-aetas-gold font-bold text-sm">+{gained} XP</span>
          <span className="text-aetas-dim text-xs">→ nível {level}</span>
        </div>
        <span className="text-aetas-dim text-xs">{progress}/{range}</span>
      </div>
      <div className="h-1.5 bg-aetas-raised rounded-full overflow-hidden">
        <div
          className="h-full bg-aetas-gold rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
