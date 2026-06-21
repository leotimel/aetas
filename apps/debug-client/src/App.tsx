import { useState, useEffect } from 'react'
import { supabase } from './supabase.ts'
import type { Session } from '@supabase/supabase-js'
import LoginPage from './pages/LoginPage.tsx'
import GameListPage from './pages/GameListPage.tsx'
import GameView from './pages/GameView.tsx'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <div style={{ padding: 20, color: '#888' }}>Carregando…</div>
  if (!session) return <LoginPage />
  if (selectedGameId) {
    return (
      <GameView
        gameId={selectedGameId}
        userId={session.user.id}
        onBack={() => setSelectedGameId(null)}
      />
    )
  }
  return (
    <GameListPage
      userId={session.user.id}
      onSelectGame={setSelectedGameId}
      onLogout={() => { void supabase.auth.signOut() }}
    />
  )
}
