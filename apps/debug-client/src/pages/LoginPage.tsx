import { useState } from 'react'
import { supabase } from '../supabase.ts'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const signInWithOAuth = (provider: 'google' | 'apple') => {
    void supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
  }

  const sendMagicLink = async () => {
    if (!email) return
    setError('')
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (err) setError(err.message)
    else setSent(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 12 }}>
      <h1 style={{ color: '#e6edf3', fontSize: 26 }}>Aetas</h1>
      <p style={{ color: '#888', fontSize: 12 }}>Debug Client</p>

      {/* Email magic link — para testes sem OAuth configurado */}
      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8, width: 240 }}>
        <div style={{ color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Email (magic link)</div>
        {sent ? (
          <p style={{ color: '#22c55e', fontSize: 13 }}>✓ Link enviado para {email} — verifique o e-mail.</p>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void sendMagicLink()}
              placeholder="seu@email.com"
              style={{
                background: '#161b22', color: '#e6edf3', border: '1px solid #30363d',
                padding: '8px 10px', borderRadius: 4, fontSize: 13, outline: 'none',
              }}
            />
            <button onClick={() => void sendMagicLink()} style={btn('#1f6feb')}>
              Enviar magic link
            </button>
            {error && <p style={{ color: '#f87171', fontSize: 12 }}>{error}</p>}
          </>
        )}
      </div>

      {/* OAuth — quando configurado no Supabase Dashboard */}
      <div style={{ color: '#333', fontSize: 11, margin: '12px 0 4px' }}>── ou ──</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 240 }}>
        <button onClick={() => signInWithOAuth('google')} style={btn('#4285f4')}>
          Login com Google
        </button>
        <button onClick={() => signInWithOAuth('apple')} style={{ ...btn('#0d1117'), border: '1px solid #444' }}>
          Login com Apple
        </button>
      </div>
    </div>
  )
}

function btn(bg: string): React.CSSProperties {
  return {
    background: bg, color: '#fff', border: 'none',
    padding: '9px 0', borderRadius: 4, cursor: 'pointer', fontSize: 13, width: '100%',
  }
}
