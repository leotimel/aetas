import type { City, GameState } from '@aetas/game-engine'
import { CitySpecialization } from '@aetas/game-engine'

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#a855f7', '#06b6d4', '#f97316', '#ec4899',
]

const SPEC_ICON: Record<string, string> = {
  [CitySpecialization.Military]:   '⚔️',
  [CitySpecialization.Commercial]: '💰',
  [CitySpecialization.Scientific]: '🔬',
}

const SPEC_LABEL: Record<string, string> = {
  [CitySpecialization.Military]:   'Militar',
  [CitySpecialization.Commercial]: 'Comercial',
  [CitySpecialization.Scientific]: 'Científica',
}

const SPEC_DESC: Record<string, string> = {
  [CitySpecialization.Military]:   '+Produção, +Ataque de unidades',
  [CitySpecialization.Commercial]: '+Ouro, +Comércio',
  [CitySpecialization.Scientific]: '+Crescimento de população, +Era',
}

interface Props {
  city: City
  gameState: GameState
  myEnginePlayerId: string
  onClose: () => void
}

export default function CityModal({ city, gameState, myEnginePlayerId, onClose }: Props) {
  const isMyCity = city.ownerId === myEnginePlayerId
  const ownerIndex = gameState.players.findIndex(p => p.id === city.ownerId)
  const ownerColor = PLAYER_COLORS[ownerIndex % PLAYER_COLORS.length] ?? '#888'
  const ownerPlayer = gameState.players.find(p => p.id === city.ownerId)
  const myResources = gameState.players.find(p => p.id === myEnginePlayerId)?.resources

  const allSpecs = Object.values(CitySpecialization)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet — slides up from bottom */}
      <div className="fixed inset-x-0 bottom-0 z-40 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-96">
        <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl shadow-2xl p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: ownerColor }} />
              <div>
                <h2 className="text-slate-100 font-bold text-base">{city.name}</h2>
                <p className="text-slate-500 text-xs">
                  {ownerPlayer?.id.slice(0, 8)}…
                  {city.ownerId === myEnginePlayerId && ' (você)'}
                  {ownerPlayer?.isAIControlled && ' 🤖'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatBox label="Nível" value={city.level} />
            <StatBox label="População" value={city.population} />
            <StatBox label="Comida" value={city.foodStored} />
          </div>

          {/* My resources (only shown for my cities) */}
          {isMyCity && myResources && (
            <div className="bg-slate-800 rounded-xl p-3 mb-4">
              <p className="text-xs text-slate-500 mb-2">Recursos do jogador</p>
              <div className="flex gap-4">
                <ResourcePill icon="💰" label="Ouro" value={myResources.gold} />
                <ResourcePill icon="🌾" label="Comida" value={myResources.food} />
                <ResourcePill icon="⚙️" label="Produção" value={myResources.production} />
              </div>
            </div>
          )}

          {/* Specialization */}
          <div>
            <p className="text-xs text-slate-500 mb-2">
              Especialização atual: <span className="text-slate-300">{SPEC_ICON[city.specialization]} {SPEC_LABEL[city.specialization]}</span>
            </p>
            <p className="text-xs text-slate-600 mb-3">{SPEC_DESC[city.specialization]}</p>

            {isMyCity && (
              <>
                <p className="text-xs text-slate-600 uppercase tracking-wider mb-2">
                  Mudar especialização <span className="text-slate-700">[v2]</span>
                </p>
                <div className="flex flex-col gap-1.5">
                  {allSpecs.map(spec => (
                    <button
                      key={spec}
                      disabled
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left cursor-not-allowed transition-colors ${
                        spec === city.specialization
                          ? 'bg-slate-700 border border-slate-600 text-slate-300'
                          : 'bg-slate-800/50 text-slate-600'
                      }`}
                    >
                      <span>{SPEC_ICON[spec]}</span>
                      <div>
                        <span className="font-medium">{SPEC_LABEL[spec]}</span>
                        <span className="text-slate-600 text-xs ml-2">{SPEC_DESC[spec]}</span>
                      </div>
                      {spec === city.specialization && (
                        <span className="ml-auto text-slate-500 text-xs">atual</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-800 rounded-lg p-2.5 text-center">
      <p className="text-slate-100 font-bold text-lg">{value}</p>
      <p className="text-slate-500 text-xs mt-0.5">{label}</p>
    </div>
  )
}

function ResourcePill({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span>{icon}</span>
      <div>
        <p className="text-slate-100 text-sm font-medium">{value}</p>
        <p className="text-slate-600 text-xs">{label}</p>
      </div>
    </div>
  )
}
