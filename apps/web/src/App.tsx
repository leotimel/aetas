import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase.ts'
import LoginPage from './pages/LoginPage.tsx'
import GameListPage from './pages/GameListPage.tsx'
import GameView from './pages/GameView.tsx'
import ProfilePage from './pages/ProfilePage.tsx'
import NewGamePage from './pages/NewGamePage.tsx'
import GameLobbyPage from './pages/GameLobbyPage.tsx'
import { joinGame } from './api.ts'

type Screen = 'list' | 'game' | 'profile' | 'new-game' | 'lobby'

export default function App() {
  const [session,  setSession]  = useState<Session | null | undefined>(undefined)
  const [screen,   setScreen]   = useState<Screen>('list')
  const [gameId,   setGameId]   = useState<string | null>(null)
  const [lobbyId,  setLobbyId]  = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)

      // Handle ?join=<gameId> invite link after sign-in
      if (s) {
        const joinGameId = new URLSearchParams(window.location.search).get('join')
        if (joinGameId) {
          // Clear the query param without full reload
          const url = new URL(window.location.href)
          url.searchParams.delete('join')
          window.history.replaceState({}, '', url.toString())

          void joinGame(joinGameId).then(res => {
            if (res.ok && res.data) {
              setLobbyId(joinGameId)
              setScreen('lobby')
            }
          })
        }
      }
    })
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

  if (screen === 'new-game') {
    return (
      <NewGamePage
        userId={session.user.id}
        onBack={() => setScreen('list')}
        onGameCreated={(id) => { setGameId(id); setScreen('game') }}
        onLobby={(id) => { setLobbyId(id); setScreen('lobby') }}
      />
    )
  }

  if (screen === 'lobby' && lobbyId) {
    return (
      <GameLobbyPage
        userId={session.user.id}
        gameId={lobbyId}
        onGameReady={(id) => { setGameId(id); setScreen('game') }}
        onBack={() => setScreen('list')}
      />
    )
  }

  return (
    <GameListPage
      userId={session.user.id}
      onEnterGame={enterGame}
      onOpenProfile={() => setScreen('profile')}
      onNewGame={() => setScreen('new-game')}
    />
  )
}
