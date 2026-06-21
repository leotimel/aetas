import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase.ts'
import { createTestGame } from '../api.ts'

interface GameEntry {
  game_id: string
  engine_player_id: string
  is_ai: boolean
  games: {
    turn_number: number
    current_player_id: string
    is_finished: boolean
    winner_id: string | null
    max_turns: number
  } | null
}

interface Props {
  userId: string
  onSelectGame: (gameId: string) => void
  onLogout: () => void
}

export default function GameListPage({ userId, onSelectGame, onLogout }: Props) {
  const [games, setGames] = useState<GameEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const addLog = (msg: string) => setLog(l => [msg, ...l].slice(0, 10))

  const loadGames = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('game_players')
      .select('game_id, engine_player_id, is_ai, games(turn_number, current_player_id, is_finished, winner_id, max_turns)')
      .eq('user_id', userId)
    if (error) {
      addLog(`Erro: ${error.message}`)
    } else {
      setGames((data as unknown as GameEntry[]) ?? [])
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { void loadGames() }, [loadGames])

  const handleCreate = async () => {
    setCreating(true)
    const result = await createTestGame()
    if (result.ok && result.data) {
      addLog(`✓ Partida criada: ${result.data.gameId.slice(0, 8)}…`)
      await loadGames()
    } else {
      addLog(`✗ ${result.error ?? 'erro desconhecido'}`)
    }
    setCreating(false)
  }

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16 }}>Partidas — {userId.slice(0, 8)}…</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { void handleCreate() }} disabled={creating} style={primaryBtn}>
            {creating ? 'Criando…' : '+ Criar Partida de Teste'}
          </button>
          <button onClick={() => { void loadGames() }} style={ghostBtn}>↺</button>
          <button onClick={onLogout} style={{ ...ghostBtn, color: '#f87171' }}>Sair</button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#888', fontSize: 13 }}>Carregando…</p>
      ) : games.length === 0 ? (
        <p style={{ color: '#555', fontSize: 13 }}>Nenhuma partida. Clique em "Criar Partida de Teste".</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: '#888', borderBottom: '1px solid #333' }}>
              <th style={th}>ID</th>
              <th style={th}>Meu slot</th>
              <th style={th}>Turno</th>
              <th style={th}>Vez de</th>
              <th style={th}>Status</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {games.map(g => {
              const gd = g.games
              const isMyTurn = gd?.current_player_id === userId
              return (
                <tr key={g.game_id} style={{ borderBottom: '1px solid #1e2733' }}>
                  <td style={td}>{g.game_id.slice(0, 8)}…</td>
                  <td style={td}>{g.engine_player_id.slice(0, 8)}{g.is_ai ? ' 🤖' : ''}</td>
                  <td style={td}>{gd?.turn_number ?? '–'} / {gd?.max_turns ?? '–'}</td>
                  <td style={{ ...td, color: isMyTurn ? '#22c55e' : '#888' }}>
                    {isMyTurn ? '● Você' : (gd?.current_player_id?.slice(0, 8) ?? '–')}
                  </td>
                  <td style={td}>
                    {gd?.is_finished
                      ? (gd.winner_id ? `Fim — ${gd.winner_id.slice(0, 8)}` : 'Fim — Empate')
                      : 'Em andamento'}
                  </td>
                  <td style={td}>
                    <button onClick={() => onSelectGame(g.game_id)} style={primaryBtn}>
                      Entrar →
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {log.length > 0 && (
        <div style={{ marginTop: 20, background: '#111', padding: 10, borderRadius: 4, fontSize: 12 }}>
          {log.map((l, i) => <div key={i} style={{ color: '#6b7280', lineHeight: 1.6 }}>{l}</div>)}
        </div>
      )}
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  background: '#3b82f6', color: '#fff', border: 'none',
  padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
}
const ghostBtn: React.CSSProperties = {
  background: 'transparent', color: '#aaa', border: '1px solid #374151',
  padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
}
const th: React.CSSProperties = { padding: '6px 8px', textAlign: 'left', fontWeight: 'normal' }
const td: React.CSSProperties = { padding: '6px 8px' }
