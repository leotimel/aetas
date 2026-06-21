# Realtime — formato de eventos para os clients

Como web/iOS/Android recebem notificações de uma partida em tempo real.
Os eventos são emitidos pelo Postgres (triggers em `games` e `combat_disputes`)
via **Supabase Realtime Broadcast** — ver `supabase/migrations/20260621000003_realtime.sql`.

> **Regra de ouro mantida:** o client NÃO decide nada com base nesses eventos além
> de "preciso re-buscar o estado / avisar o usuário". Toda regra continua no
> game-engine via backend. Os eventos são gatilhos leves de UI, não estado.

---

## Modelo de canal

- **Um canal privado por partida.** Tópico: `game:<gameId>` (ex: `game:7f3a...e1`).
- Todos os participantes da partida assinam o mesmo tópico.
- Cada evento **nomeia o(s) jogador(es) que ele concerne** — o client compara com o
  próprio `userId` e reage só aos relevantes (ex: "é a minha vez" quando
  `currentPlayerId === meuId`).
- Canal **privado**: o client precisa estar autenticado e ter um slot na partida
  (RLS em `realtime.messages`). Antes de assinar, chame `supabase.realtime.setAuth()`.

### Payloads são notificações, não estado

Os eventos carregam só o necessário para o client decidir agir. Ao receber um
evento relevante, o client **re-busca o GameState completo** com um SELECT
RLS-gated em `games` (ou usa o stream `postgres_changes` de `games`, ver fim).
Isso mantém os payloads pequenos e o estado sempre vindo de uma única fonte.

---

## Os três eventos

### 1. `turn_changed` — o turno passou para um novo jogador

Disparado quando `games.current_player_id` muda (avanço normal de turno).
**Não** dispara no turno que encerra a partida (aí vem `game_over`).

```json
{
  "gameId": "7f3a...e1",
  "turnNumber": 12,
  "currentPlayerId": "a1b2c3d4-..."
}
```

O client cujo `userId === currentPlayerId` mostra "é a sua vez" e habilita ações.

### 2. `dispute_resolved` — uma disputa de combate foi resolvida

Disparado quando uma `combat_disputes` deixa de estar `pending` — seja por ação de
um jogador, seja por timeout (~24h).

```json
{
  "gameId": "7f3a...e1",
  "disputeId": "dispute-u12-u30-1718900000000",
  "status": "resolvedByAction",
  "attackerPlayerId": "a1b2c3d4-...",
  "defenderPlayerId": "e5f6a7b8-..."
}
```

- `status`: `"resolvedByAction"` ou `"resolvedByTimeout"`.
- Os clients cujo `userId` é `attackerPlayerId` ou `defenderPlayerId` re-buscam o
  estado para ver o resultado (unidade perdida, etc.).

### 3. `game_over` — a partida terminou

Disparado quando `games.is_finished` vira `true` (vitória por pontuação ao fim de
N turnos, ou último jogador de pé).

```json
{
  "gameId": "7f3a...e1",
  "winnerId": "a1b2c3d4-...",
  "finalTurn": 30
}
```

- `winnerId`: id do vencedor, ou `null` em caso de empate.

---

## Assinando do client (supabase-js)

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 1. Autentique o socket Realtime (necessário para canais privados).
await supabase.realtime.setAuth() // usa a sessão atual

// 2. Assine o canal privado da partida.
const channel = supabase
  .channel(`game:${gameId}`, { config: { private: true } })
  .on('broadcast', { event: 'turn_changed' }, ({ payload }) => {
    if (payload.currentPlayerId === myUserId) showYourTurn()
    refetchGameState(gameId)
  })
  .on('broadcast', { event: 'dispute_resolved' }, ({ payload }) => {
    if (payload.attackerPlayerId === myUserId || payload.defenderPlayerId === myUserId) {
      refetchGameState(gameId)
    }
  })
  .on('broadcast', { event: 'game_over' }, ({ payload }) => {
    showGameOver(payload.winnerId)
  })
  .subscribe()

// Ao sair da tela:
await supabase.removeChannel(channel)
```

Convenções nativas (Swift/Kotlin) seguem o mesmo tópico e os mesmos nomes de
evento e campos — ver `docs/GLOSSARY.md`.

---

## Re-buscar o estado completo

Ao receber um evento, busque o estado autoritativo (RLS garante que só
participantes leem):

```ts
const { data } = await supabase
  .from('games')
  .select('game_state, turn_number, current_player_id, is_finished, winner_id, state_version')
  .eq('id', gameId)
  .single()
// data.game_state é o GameState completo (ver packages/game-engine/src/types.ts)
```

**Alternativa — stream de linha completa:** `games` e `game_players` estão na
publicação `postgres_changes` (migration 2.1). Um client pode assinar
`postgres_changes` em `games` e receber a linha inteira (com `game_state`) a cada
UPDATE, dispensando o re-fetch. Use isto se preferir empurrar o estado completo;
use os eventos de Broadcast acima para notificações semânticas leves. Os dois
coexistem.

---

## O que dispara cada evento (referência server-side)

| Evento | Origem | Condição |
|---|---|---|
| `turn_changed` | trigger `games_realtime_events` | `current_player_id` mudou |
| `game_over` | trigger `games_realtime_events` | `is_finished` virou `true` |
| `dispute_resolved` | trigger `combat_disputes_realtime_events` | status saiu de `pending` |

Como os triggers ficam no banco, os eventos disparam igual vindo de
`submit-action`, `resolve-dispute` ou `timeout-sweep` — e só após o commit
(nunca num write que sofreu rollback por conflito de CAS).

---

## Fora do escopo v1 (futuro)

- **Notificação "é a sua vez" entre TODAS as partidas** (pilar de retenção
  Words-with-Friends): exige um tópico por usuário (`user:<id>`) + push
  notifications reais (APNs/FCM), não só Realtime in-app. Entra junto com push.
