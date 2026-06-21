import { useEffect, useState } from 'react'
import { supabase } from '../supabase.ts'
import DailyCard from '../components/DailyCard.tsx'
import { xpToLevel, xpProgress } from '@aetas/game-engine'

interface GameRow {
  game_id: string
  engine_player_id: string
  games: {
    turn_number: number
    current_player_id: string
    is_finished: boolean
    winner_id: string | null
    max_turns: number
    updated_at: string
  }
}

type Tab = 'myTurn' | 'active' | 'finished'

interface Props {
  userId: string
  onEnterGame: (gameId: string) => void
  onOpenProfile: () => void
}

export default function GameListPage({ userId, onEnterGame, onOpenProfile }: Props) {
  const [rows, setRows] = useState<GameRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('myTurn')
  const [creating, setCreating] = useState(false)
  const [xp, setXp] = useState<number>(0)

  useEffect(() => {
    void supabase.from('profiles').select('xp').eq('user_id', userId).single().then(({ data }) => {
      if (data) setXp((data as { xp: number }).xp)
    })
  }, [userId])

  const fetchGames = async () => {
    const { data } = await supabase
      .from('game_players')
      .select('game_id, engine_player_id, games(turn_number, current_player_id, is_finished, winner_id, max_turns, updated_at)')
      .eq('user_id', userId)
      .eq('is_ai', false)
    setRows((data as GameRow[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => { void fetchGames() }, [userId])

  const myTurnGames  = rows.filter(r => !r.games.is_finished && r.games.current_player_id === r.engine_player_id)
  const activeGames  = rows.filter(r => !r.games.is_finished && r.games.current_player_id !== r.engine_player_id)
  const finishedGames = rows.filter(r => r.games.is_finished)

  const currentList = tab === 'myTurn' ? myTurnGames : tab === 'active' ? activeGames : finishedGames

  const createTestGame = async () => {
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-game`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session!.access_token}`,
          'Content-Type': 'application/json',
        },
      },
    )
    setCreating(false)
    if (res.ok) await fetchGames()
  }

  const signOut = () => void supabase.auth.signOut()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="border-b border-slate-800 px-4 pt-3 pb-2 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-100">Aetas</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors text-sm"
              title="Perfil"
            >
              <LevelBadge xp={xp} />
            </button>
            <button
              onClick={() => void fetchGames()}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
              title="Atualizar"
            >
              ↺
            </button>
            <button
              onClick={signOut}
              className="text-sm text-slate-500 hover:text-red-400 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
        {/* XP mini-bar */}
        <XpMiniBar xp={xp} />
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-6 pb-24">
        {/* Daily challenge */}
        <DailyCard userId={userId} onEnterGame={onEnterGame} />

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6">
          <TabButton active={tab === 'myTurn'} count={myTurnGames.length} onClick={() => setTab('myTurn')}>
            Minha Vez
          </TabButton>
          <TabButton active={tab === 'active'} count={activeGames.length} onClick={() => setTab('active')}>
            Ativas
          </TabButton>
          <TabButton active={tab === 'finished'} count={finishedGames.length} onClick={() => setTab('finished')}>
            Finalizadas
          </TabButton>
        </div>

        {/* Game list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-slate-700 border-t-slate-400 animate-spin" />
          </div>
        ) : currentList.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="flex flex-col gap-3">
            {currentList.map(row => (
              <GameCard
                key={row.game_id}
                row={row}
                isMyTurn={tab === 'myTurn'}
                onEnter={() => onEnterGame(row.game_id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* FAB — criar partida de teste */}
      <div className="fixed bottom-6 right-4 left-4 max-w-2xl mx-auto flex justify-end">
        <button
          onClick={() => void createTestGame()}
          disabled={creating}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 text-white font-semibold text-sm shadow-lg shadow-blue-900/40 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {creating ? (
            <span className="w-4 h-4 rounded-full border-2 border-blue-300 border-t-transparent animate-spin" />
          ) : '+'}
          Nova Partida
        </button>
      </div>
    </div>
  )
}

function TabButton({ active, count, onClick, children }: {
  active: boolean
  count: number
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-slate-800 text-slate-100'
          : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {children}
      {count > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

function GameCard({ row, isMyTurn, onEnter }: { row: GameRow; isMyTurn: boolean; onEnter: () => void }) {
  const { games: g } = row
  const shortId = row.game_id.slice(0, 8)
  const updatedAgo = relativeTime(g.updated_at)

  const iWon = g.is_finished && g.winner_id === row.engine_player_id

  return (
    <div className={`bg-slate-900 border rounded-xl p-4 transition-colors ${
      isMyTurn ? 'border-green-800 hover:border-green-700' : 'border-slate-800 hover:border-slate-700'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Status dot + ID */}
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              g.is_finished ? 'bg-slate-600' : isMyTurn ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
            }`} />
            <span className="text-slate-300 font-mono text-sm font-medium">{shortId}…</span>
            {g.is_finished && iWon && <span className="text-xs text-amber-400">🏆 Você venceu</span>}
            {g.is_finished && !iWon && g.winner_id && <span className="text-xs text-slate-500">Derrota</span>}
          </div>

          {/* Turn info */}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Turno {g.turn_number}/{g.max_turns}</span>
            <span>·</span>
            <span>{updatedAgo}</span>
          </div>

          {/* Status label */}
          {!g.is_finished && (
            <p className="mt-1.5 text-xs text-slate-500">
              {isMyTurn
                ? <span className="text-green-400 font-medium">● Sua vez</span>
                : 'Aguardando oponente…'}
            </p>
          )}
        </div>

        {/* Action */}
        {!g.is_finished && (
          <button
            onClick={onEnter}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              isMyTurn
                ? 'bg-green-600 text-white hover:bg-green-500'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isMyTurn ? 'Jogar →' : 'Ver →'}
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyState({ tab }: { tab: Tab }) {
  const messages: Record<Tab, { icon: string; title: string; sub: string }> = {
    myTurn: { icon: '⏳', title: 'Sem jogadas pendentes', sub: 'Quando for sua vez, as partidas aparecem aqui.' },
    active: { icon: '🗺️', title: 'Sem partidas ativas', sub: 'Crie uma nova partida para começar.' },
    finished: { icon: '🏁', title: 'Sem partidas finalizadas', sub: 'Partidas concluídas ficam registradas aqui.' },
  }
  const m = messages[tab]
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
      <span className="text-4xl">{m.icon}</span>
      <p className="text-slate-300 font-medium mt-2">{m.title}</p>
      <p className="text-slate-600 text-sm">{m.sub}</p>
    </div>
  )
}

function LevelBadge({ xp }: { xp: number }) {
  const level = xpToLevel(xp)
  return (
    <span className="flex items-center gap-1">
      <span className="w-5 h-5 rounded-md bg-blue-700 flex items-center justify-center text-xs font-bold text-blue-100">{level}</span>
      <span className="text-slate-400 text-xs hidden sm:inline">{xp} XP</span>
    </span>
  )
}

function XpMiniBar({ xp }: { xp: number }) {
  const [progress, range] = xpProgress(xp)
  const isMax = range === 0
  const pct = isMax ? 100 : Math.round((progress / range) * 100)
  return (
    <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-blue-600/70 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso)
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'agora mesmo'
  if (m < 60) return `há ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}
