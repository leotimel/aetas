import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase.ts'
import LoginPage from './pages/LoginPage.tsx'
import GameListPage from './pages/GameListPage.tsx'
import GameView from './pages/GameView.tsx'
import ProfilePage from './pages/ProfilePage.tsx'

type Screen = 'list' | 'game' | 'profile'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [screen, setScreen] = useState<Screen>('list')
  const [gameId, setGameId] = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-slate-700 border-t-slate-400 animate-spin" />
      </div>
    )
  }

  if (!session) return <LoginPage />

  const enterGame = (id: string) => { setGameId(id); setScreen('game') }

  if (screen === 'game' && gameId) {
    return <GameView gameId={gameId} userId={session.user.id} onBack={() => setScreen('list')} />
  }

  if (screen === 'profile') {
    return <ProfilePage userId={session.user.id} onClose={() => setScreen('list')} />
  }

  return (
    <GameListPage
      userId={session.user.id}
      onEnterGame={enterGame}
      onOpenProfile={() => setScreen('profile')}
    />
  )
}
