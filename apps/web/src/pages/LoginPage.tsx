import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../supabase.ts'

export default function LoginPage() {
  const { t } = useTranslation()
  const [devEmail, setDevEmail] = useState('')
  const [devSent, setDevSent] = useState(false)
  const [devOpen, setDevOpen] = useState(true)
  const [error, setError] = useState('')

  const signInWith = (provider: 'google' | 'apple') => {
    void supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
  }

  const sendMagicLink = async () => {
    if (!devEmail) return
    setError('')
    const { error: err } = await supabase.auth.signInWithOtp({
      email: devEmail,
      options: { emailRedirectTo: window.location.origin },
    })
    if (err) setError(err.message)
    else setDevSent(true)
  }

  return (
    <div className="min-h-screen bg-aetas-bg flex flex-col items-center justify-center px-4">
      {/* Logo / branding */}
      <div className="mb-10 text-center">
        <h1 className="font-display text-5xl font-bold tracking-tight text-aetas-gold">Aetas</h1>
        <p className="mt-2 text-aetas-dim text-sm tracking-widest uppercase">
          {t('login.tagline')}
        </p>
      </div>

      {/* Auth card */}
      <div className="w-full max-w-sm bg-aetas-surface border border-aetas-border rounded-2xl p-8 shadow-xl shadow-black/60">
        <p className="text-aetas-muted text-sm text-center mb-6">
          {t('login.signIn')}
        </p>

        <div className="flex flex-col gap-3">
          {/* Google */}
          <button
            onClick={() => signInWith('google')}
            className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-xl bg-white text-slate-900 font-medium text-sm hover:bg-slate-100 active:bg-slate-200 transition-colors"
          >
            <GoogleIcon />
            {t('login.google')}
          </button>

          {/* Apple */}
          <button
            onClick={() => signInWith('apple')}
            className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-xl bg-aetas-raised border border-aetas-border-strong text-aetas-text font-medium text-sm hover:bg-aetas-panel active:bg-aetas-panel transition-colors"
          >
            <AppleIcon />
            {t('login.apple')}
          </button>
        </div>

        {/* Magic link */}
        <div className="mt-6 pt-5 border-t border-aetas-border">
          <button
            onClick={() => setDevOpen(v => !v)}
            className="text-xs text-aetas-dim hover:text-aetas-muted transition-colors w-full text-center"
          >
            {devOpen ? t('login.emailClose') : t('login.email')}
          </button>

          {devOpen && (
            <div className="mt-3 flex flex-col gap-2">
              {devSent ? (
                <p className="text-green-500 text-xs text-center">
                  {t('login.linkSent', { email: devEmail })}
                </p>
              ) : (
                <>
                  <input
                    type="email"
                    value={devEmail}
                    onChange={e => setDevEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && void sendMagicLink()}
                    placeholder={t('login.emailPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg bg-aetas-raised border border-aetas-border-strong text-aetas-muted text-xs placeholder:text-aetas-dim outline-none focus:border-aetas-gold/60 transition-colors"
                  />
                  <button
                    onClick={() => void sendMagicLink()}
                    className="w-full py-2 rounded-lg bg-aetas-panel text-aetas-muted text-xs hover:bg-aetas-border-strong transition-colors"
                  >
                    {t('login.magicLink')}
                  </button>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor">
      <path d="M13.173 9.497c-.022-2.122 1.736-3.151 1.814-3.2C13.96 4.37 12.25 4.14 11.64 4.12c-1.39-.143-2.72.83-3.427.83-.714 0-1.803-.812-2.97-.789C3.737 4.185 2.31 5.02 1.53 6.335c-1.602 2.77-.409 6.863 1.143 9.109.762 1.096 1.664 2.326 2.851 2.28 1.148-.046 1.579-.737 2.966-.737 1.378 0 1.77.737 2.972.713 1.237-.02 2.016-1.112 2.764-2.215a10.95 10.95 0 0 0 1.258-2.567c-.027-.012-2.404-.921-2.31-3.421zM10.735 2.73C11.37 1.944 11.8.878 11.673 0c-.9.037-2.002.6-2.65 1.372-.581.675-1.098 1.768-.957 2.81.998.077 2.03-.506 2.669-1.452z"/>
    </svg>
  )
}
