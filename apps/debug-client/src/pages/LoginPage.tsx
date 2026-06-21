import { supabase } from '../supabase.ts'

export default function LoginPage() {
  const signIn = (provider: 'google' | 'apple') => {
    void supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 16 }}>
      <h1 style={{ color: '#e6edf3', fontSize: 28 }}>Aetas</h1>
      <p style={{ color: '#888', fontSize: 13 }}>Debug Client — Inspecione partidas em andamento</p>
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button onClick={() => signIn('google')} style={btn('#4285f4')}>
          Login com Google
        </button>
        <button onClick={() => signIn('apple')} style={btn('#1a1a1a', '#fff', '1px solid #444')}>
          Login com Apple
        </button>
      </div>
    </div>
  )
}

function btn(bg: string, color = '#fff', border = 'none'): React.CSSProperties {
  return {
    background: bg, color, border,
    padding: '10px 28px', borderRadius: 6,
    cursor: 'pointer', fontSize: 14, minWidth: 200,
  }
}
