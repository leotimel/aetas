import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase.ts'

interface PlayerSlot {
  slot_order: number
  is_ai: boolean
  user_id: string | null
  engine_player_id: string
  profiles?: { display_name?: string } | null
}

interface Props {
  userId:       string
  gameId:       string
  onGameReady:  (gameId: string) => void
  onBack:       () => void
}

const INVITE_BASE = import.meta.env.VITE_APP_URL as string | undefined ?? 'https://playaetas.vercel.app'

export default function GameLobbyPage({ userId, gameId, onGameReady, onBack }: Props) {
  const [slots,   setSlots]   = useState<PlayerSlot[]>([])
  const [copied,  setCopied]  = useState(false)
  const [loading, setLoading] = useState(true)

  const inviteUrl = `${INVITE_BASE}?join=${gameId}`

  const fetchSlots = useCallback(async () => {
    const { data } = await supabase
      .from('game_players')
      .select('slot_order, is_ai, user_id, engine_player_id')
      .eq('game_id', gameId)
      .order('slot_order')
    setSlots((data as PlayerSlot[] | null) ?? [])
    setLoading(false)
  }, [gameId])

  useEffect(() => {
    void fetchSlots()
  }, [fetchSlots])

  // Realtime: watch game_players for new joins
  useEffect(() => {
    const channel = supabase
      .channel(`lobby-players:${gameId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_players',
        filter: `game_id=eq.${gameId}`,
      }, () => void fetchSlots())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [gameId, fetchSlots])

  // Realtime: watch games.status for 'active'
  useEffect(() => {
    const channel = supabase
      .channel(`lobby-game:${gameId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`,
      }, (payload) => {
        const newStatus = (payload.new as { status?: string }).status
        if (newStatus === 'active') onGameReady(gameId)
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [gameId, onGameReady])

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const humanSlots  = slots.filter(s => !s.is_ai)
  const aiSlots     = slots.filter(s => s.is_ai)
  const filledCount = humanSlots.filter(s => s.user_id !== null).length
  const totalHuman  = humanSlots.length
  const allFilled   = filledCount === totalHuman && totalHuman > 0

  const handleFillWithAI = async () => {
    // Fill all remaining open human slots with AI by calling a dedicated endpoint.
    // For now we navigate directly — the edge function fills slots server-side.
    await supabase
      .from('games')
      .update({ status: 'active' })
      .eq('id', gameId)
    onGameReady(gameId)
  }

  return (
    <div className="min-h-screen bg-aetas-bg text-aetas-text flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-aetas-surface border-b border-aetas-border">
        <button
          onClick={onBack}
          className="text-aetas-muted hover:text-aetas-text transition-colors text-sm"
        >
          ← Voltar
        </button>
        <h1 className="font-display text-aetas-text font-semibold">Sala de Espera</h1>
      </header>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-6">

        {/* Game ID shorthand */}
        <div className="text-center">
          <p className="text-aetas-dim text-xs uppercase tracking-wider mb-1">Código da partida</p>
          <p className="font-mono text-2xl font-bold text-aetas-gold tracking-widest">
            {gameId.slice(0, 8).toUpperCase()}
          </p>
        </div>

        {/* Invite link */}
        <div className="bg-aetas-surface border border-aetas-border rounded-xl p-4 space-y-3">
          <p className="text-xs text-aetas-dim uppercase tracking-wider">Link de Convite</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="flex-1 bg-aetas-raised border border-aetas-border rounded-lg px-3 py-2 text-xs text-aetas-muted font-mono truncate"
            />
            <button
              onClick={() => void copyLink()}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-aetas-gold text-aetas-bg hover:brightness-110'
              }`}
            >
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs text-aetas-dim">
            Compartilhe este link com os outros jogadores. Cada um precisará ter uma conta.
          </p>
        </div>

        {/* Player slots */}
        <div className="space-y-2">
          <p className="border-l-2 border-aetas-gold pl-3 text-xs uppercase tracking-wider text-aetas-dim font-semibold mb-3">
            Jogadores ({filledCount}/{totalHuman} prontos)
          </p>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 rounded-full border-2 border-aetas-border border-t-aetas-muted animate-spin" />
            </div>
          ) : (
            <>
              {humanSlots.map((slot, i) => {
                const isMe    = slot.user_id === userId
                const isFilled = slot.user_id !== null
                return (
                  <div
                    key={slot.slot_order}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      isFilled
                        ? 'border-aetas-gold/40 bg-aetas-gold/5'
                        : 'border-aetas-border bg-aetas-surface'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      isFilled ? 'bg-aetas-gold/20 text-aetas-gold' : 'bg-aetas-raised text-aetas-dim'
                    }`}>
                      {isFilled ? (isMe ? '★' : String(i + 1)) : '?'}
                    </div>
                    <div className="min-w-0">
                      {isFilled ? (
                        <>
                          <p className="text-aetas-text text-sm font-medium">
                            {isMe ? 'Você' : `Jogador ${i + 1}`}
                            {isMe && <span className="ml-2 text-xs text-aetas-gold">(criador)</span>}
                          </p>
                          <p className="text-aetas-dim text-xs">Pronto ✓</p>
                        </>
                      ) : (
                        <>
                          <p className="text-aetas-dim text-sm">Aguardando…</p>
                          <p className="text-aetas-dim text-xs">Vaga {i + 1} aberta</p>
                        </>
                      )}
                    </div>
                    {!isFilled && (
                      <div className="ml-auto w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    )}
                  </div>
                )
              })}

              {aiSlots.map((slot, i) => (
                <div
                  key={slot.slot_order}
                  className="flex items-center gap-3 p-3 rounded-xl border border-aetas-border/50 bg-aetas-surface/50 opacity-70"
                >
                  <div className="w-8 h-8 rounded-full bg-aetas-raised flex items-center justify-center text-sm flex-shrink-0">
                    🤖
                  </div>
                  <div>
                    <p className="text-aetas-muted text-sm">Oponente IA {i + 1}</p>
                    <p className="text-aetas-dim text-xs">Pronto</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          {allFilled && (
            <button
              onClick={() => onGameReady(gameId)}
              className="w-full py-3 rounded-xl bg-aetas-gold text-aetas-bg font-bold text-sm hover:brightness-110 transition-all"
            >
              Iniciar Partida →
            </button>
          )}
          {!allFilled && (
            <button
              onClick={() => void handleFillWithAI()}
              className="w-full py-3 rounded-xl border border-aetas-border text-aetas-muted text-sm font-medium hover:border-aetas-border-strong hover:text-aetas-text transition-all"
            >
              Iniciar com IAs nas vagas abertas
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
