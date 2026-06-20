# CLAUDE.md — Aetas

## O que é o Aetas

**Aetas** (latim "era/idade") é um Civ-like destilado para mobile/web —
hex map procedural, fog of war clássico, multiplayer assíncrono sequencial
(modelo "xadrez por correio"), 4-8 jogadores por partida.
Pilar de retenção: múltiplas partidas simultâneas (modelo Words with Friends)
+ desafio diário com seed compartilhada (padrão Wordle/Taut/Longshot)
+ meta-progressão de conta (XP → civilizações + cosméticos).

---

## REGRA DE ARQUITETURA INVIOLÁVEL

> **Só `packages/game-engine` define regras de jogo.**
> Nenhum client (debug-client, web, iOS, Android) reimplementa lógica de
> turno, combate, pontuação ou economia — toda decisão passa pelo backend
> (Supabase Edge Functions que chamam game-engine). Clients apenas renderizam
> estado e enviam intenção de ação.

Violar essa regra duplica bugs em 3 interfaces. Não fazer.

---

## Estrutura do monorepo

```
aetas/
├── packages/game-engine/   # @aetas/game-engine — TS puro, sem I/O, sem rede
├── supabase/
│   ├── migrations/         # schema Postgres
│   └── functions/          # Edge Functions TS (importam game-engine)
├── apps/
│   ├── debug-client/       # Fase 3 — valida motor+backend, grade visual de hex
│   ├── web/                # Fase 4 — React + Vite + Tailwind
│   ├── ios/                # Fase 5 — Swift/SwiftUI  ← NÃO criar agora
│   └── android/            # Fase 6 — Kotlin         ← NÃO criar agora
└── docs/                   # GAME_DESIGN.md · ARCHITECTURE.md · PLAYBOOK_PROMPTS.md · GLOSSARY.md
```

**Ordem de construção por risco decrescente:**
motor → backend → debug-client → web → iOS → Android.
Cada etapa só começa com a anterior testada e com CHECKPOINT aprovado.

---

## Decisões V1 — o que construir agora

| Tema | Decisão |
|---|---|
| Jogadores | 4-8; IA preenche vagas; solo vs. IA suportado |
| Turnos | Sequencial; jogador ausente → IA assume (**IA é obrigatória na v1**) |
| Mapa | Hex procedural, fog of war, tamanho a calibrar em playtesting |
| Economia | 3 recursos: ouro, comida, produção; cidades com crescimento passivo + especialização |
| Progressão | Por eras (poucos níveis), não árvore ramificada |
| Civilizações | 1-2 habilidades + 1 unidade especial; desbloqueáveis por XP |
| Combate | Tático (stats + terreno + ordem); disputa assíncrona ~24h com timeout automático |
| Diplomacia | Pacto de não-agressão + troca de recursos, só após contato |
| Vitória | Pontuação combinada (território + população + desenvolvimento) ao fim de N turnos |
| Eliminação | Jogador sai; território vira neutro |
| Auth | OAuth apenas — Google + Apple, sem e-mail/senha |
| Retenção | Múltiplas partidas + desafio diário seed do dia + meta-progressão XP |

## Decisões V2+ — NÃO construir agora

- Diplomacia profunda (tratados formais, alianças militares, comércio automático)
- Múltiplos tamanhos/tipos de mapa selecionáveis
- Desbloqueáveis mais ricos (avatares, cosméticos de unidade)
- Eliminação não-definitiva / retorno de jogador
- Condições de vitória alternativas (militar, cultural, científico)

---

## Modelo por tipo de tarefa

| Tarefa | Modelo |
|---|---|
| Scaffold, configs, schema Postgres, UI de qualquer client | Sonnet |
| `types.ts`, `economy.ts`, `diplomacy.ts`, `scoring.ts` | Sonnet |
| Geração de mapa hex + fog of war | Sonnet |
| Edge Functions simples (auth, read-only) | Sonnet |
| **`turn.ts` — máquina de estados do turno sequencial** | **Opus** |
| **`combat.ts` — disputa assíncrona + timeout** | **Opus** |
| **`ai.ts` — IA seguradora de posição + oponente** | **Opus** |
| **Edge Functions de orquestração (concorrência real)** | **Opus** |
| **Debugging de sincronização entre clients** | **Opus** |

Regra prática: **comece em Sonnet**; troque para Opus só no prompt específico
que mexe com estado distribuído ou condições de corrida.

---

## Convenções

- **TypeScript strict** em todo o monorepo (`tsconfig.base.json` na raiz)
- **Vitest** para testes do `game-engine` — rode após cada mudança no motor:
  `pnpm --filter @aetas/game-engine test`
- **Supabase:** Postgres (fonte de verdade) + Auth OAuth + Realtime (notificação "é sua vez")
- Termos de domínio: `docs/GLOSSARY.md` — Swift e Kotlin seguem suas convenções
  nativas mas mapeiam para os mesmos conceitos canônicos
- Commits por fase; CHECKPOINTs do playbook não são opcionais

---

## Referências completas

@docs/GAME_DESIGN.md
@docs/ARCHITECTURE.md
