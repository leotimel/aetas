import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameState } from '@aetas/game-engine'
import { CIVILIZATIONS, scoreAll, type PlayerScore } from '@aetas/game-engine'

interface Props {
  gameState:        GameState
  myEnginePlayerId: string
  xpGain:           { gained: number; newXp: number } | null
  onBack:           () => void
}

function civName(players: GameState['players'], playerId: string): string {
  const player = players.find(p => p.id === playerId)
  return CIVILIZATIONS.find(c => c.id === player?.civilizationId)?.name ?? playerId.slice(0, 6)
}

function civFlag(players: GameState['players'], playerId: string): string {
  const player = players.find(p => p.id === playerId)
  return CIVILIZATIONS.find(c => c.id === player?.civilizationId)?.flag ?? '🏛️'
}

function buildShareText(
  gameState: GameState,
  scores: Record<string, PlayerScore>,
): string {
  const ranked = [...gameState.players]
    .sort((a, b) => (scores[b.id]?.total ?? 0) - (scores[a.id]?.total ?? 0))

  const lines = [`🏛 Aetas · Turno ${gameState.turnNumber}/${gameState.maxTurns}`]
  ranked.forEach((p, i) => {
    const medal = i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`
    const flag  = civFlag(gameState.players, p.id)
    const name  = civName(gameState.players, p.id)
    const total = scores[p.id]?.total ?? 0
    lines.push(`${medal} ${flag} ${name} ${total}pts`)
  })
  lines.push('playaetas.vercel.app')
  return lines.join('\n')
}

function Particles() {
  const particles = useMemo(() => {
    return Array.from({ length: 32 }, (_, i) => ({
      id:    i,
      left:  `${Math.round(Math.random() * 96)}%`,
      delay: `${(Math.random() * 2.2).toFixed(2)}s`,
      dur:   `${(2.2 + Math.random() * 1.6).toFixed(2)}s`,
      size:  `${6 + Math.floor(Math.random() * 6)}px`,
      color: i % 3 === 0 ? '#fbbf24' : i % 3 === 1 ? '#facc15' : '#fde68a',
    }))
  }, [])

  return (
    <>
      {particles.map(p => (
        <div
          key={p.id}
          className="anim-particle pointer-events-none fixed rounded-sm"
          style={{
            top: '-5%',
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            '--delay': p.delay,
            '--dur': p.dur,
          } as React.CSSProperties}
        />
      ))}
    </>
  )
}

const RANK_LABEL = ['🥇', '🥈', '🥉']
const RANK_ORD   = ['1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º']

export default function GameOverScreen({ gameState, myEnginePlayerId, xpGain, onBack }: Props) {
  const { t } = useTranslation()
  const scores  = useMemo(() => scoreAll(gameState), [gameState])
  const [copied, setCopied] = useState(false)

  const ranked = useMemo(() => {
    const active     = gameState.players.filter(p => !p.isEliminated)
    const eliminated = gameState.players.filter(p => p.isEliminated)
    const sortFn = (a: (typeof gameState.players)[0], b: (typeof gameState.players)[0]) =>
      (scores[b.id]?.total ?? 0) - (scores[a.id]?.total ?? 0)
    return [...active.sort(sortFn), ...eliminated]
  }, [gameState.players, scores])

  const winner    = gameState.winner
  const winnerCiv = winner ? civName(gameState.players, winner) : null
  const iWon      = winner === myEnginePlayerId

  const handleShare = () => {
    const text = buildShareText(gameState, scores)
    if (navigator.share) {
      navigator.share({ text }).catch(() => {/* user cancelled or unsupported */})
    } else {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => {/* silent */})
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-start overflow-y-auto">
      {iWon && <Particles />}

      <div className="w-full max-w-lg px-4 py-8 flex flex-col gap-5 relative">
        {/* Victory / Tie banner */}
        <div className="text-center anim-fanfare">
          {winnerCiv ? (
            <>
              <div className="text-5xl mb-2">🏆</div>
              <h1 className="text-2xl font-bold text-aetas-gold">{t('gameover.winner', { winner: winnerCiv })}</h1>
              {iWon && <p className="text-aetas-muted text-sm mt-1">{t('gameover.congrats')}</p>}
            </>
          ) : (
            <>
              <div className="text-5xl mb-2">🤝</div>
              <h1 className="text-2xl font-bold text-aetas-text">{t('gameover.draw')}</h1>
            </>
          )}
          {xpGain && (
            <span className="inline-block mt-2 px-3 py-1 rounded-full bg-emerald-900/60 border border-emerald-700/50 text-emerald-300 text-sm font-medium">
              +{xpGain.gained} XP · Total: {xpGain.newXp} XP
            </span>
          )}
        </div>

        {/* Ranking */}
        <div className="flex flex-col gap-2">
          {ranked.map((player, i) => {
            const isElim   = player.isEliminated
            const isWinner = player.id === winner
            const isMe     = player.id === myEnginePlayerId
            const s        = scores[player.id] ?? { territory: 0, population: 0, development: 0, total: 0 }
            const rankLabel = i < 3 ? RANK_LABEL[i] : RANK_ORD[i] ?? `${i + 1}º`
            return (
              <div
                key={player.id}
                className={`rounded-xl p-3 border ${
                  isElim
                    ? 'opacity-50 bg-aetas-raised border-aetas-border'
                    : isWinner
                      ? 'bg-aetas-raised border-aetas-gold/50'
                      : 'bg-aetas-raised border-aetas-border'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl w-8 text-center flex-shrink-0">{rankLabel}</span>
                  <span className="text-lg">{civFlag(gameState.players, player.id)}</span>
                  <span className={`font-medium text-sm ${isElim ? 'line-through text-aetas-dim' : 'text-aetas-text'}`}>
                    {civName(gameState.players, player.id)}
                    {isMe && <span className="text-aetas-dim font-normal"> {t('ui.you')}</span>}
                    {isElim && <span className="ml-1">🚫</span>}
                  </span>
                  <span className={`ml-auto text-sm font-bold ${isWinner ? 'text-aetas-gold' : 'text-aetas-muted'}`}>
                    {s.total}pts
                  </span>
                </div>
                {!isElim && (
                  <div className="flex gap-3 mt-1.5 ml-10 text-[11px] text-aetas-dim">
                    <span>{t('gameover.territory')} {s.territory}</span>
                    <span>{t('gameover.population')} {s.population}</span>
                    <span>{t('gameover.development')} {s.development}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onBack}
            className="w-full py-3 rounded-xl bg-aetas-gold text-aetas-bg font-bold text-sm hover:bg-aetas-gold-light transition-colors"
          >
            {t('gameover.backLobby')}
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleShare}
              className="flex-1 py-2.5 rounded-xl bg-aetas-raised border border-aetas-border text-aetas-muted text-sm font-medium hover:bg-aetas-panel transition-colors"
            >
              {copied ? t('gameover.copied') : t('gameover.share')}
            </button>
            <button
              disabled
              title="Em breve"
              className="flex-1 py-2.5 rounded-xl bg-aetas-raised border border-aetas-border text-aetas-border-strong text-sm font-medium cursor-not-allowed"
            >
              {t('gameover.viewHistory')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
