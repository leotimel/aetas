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

## Estado atual das fases

| Fase | Status | Entrega |
|---|---|---|
| 0 — Monorepo + CLAUDE.md + Glossário | ✅ | scaffold, docs base |
| 1 — Motor de jogo (game-engine) | ✅ | types, map, turn, combat, economy, diplomacy, ai, scoring |
| 1.5 — Profundidade de conteúdo | ✅ | 8 tipos de unidade, 6 edifícios/spec, 6 civilizações |
| 2 — Backend Supabase | ✅ | schema Postgres, OAuth, Edge Functions, Realtime |
| 3 — Debug client | ✅ | mapa hex visual, ações de turno, inspeção de estado |
| 4 — Web básica | ✅ | auth, mapa SVG, fog of war, modal de cidade, perfil/XP, daily |
| 4 (polimento 4.4–4.7) | ✅ | cores de civ, tema dark/dourado (Cinzel + gold), [v2] removido, nomes de civ no lugar de IDs |
| 4.5 — Bloco A (design system Roma Antiga) | ✅ | tokens CSS, texturas SVG de terreno, sprites por tipo de unidade, animações de movimento/combate |
| 4.5 — Bloco B (mecânicas jogáveis) | ✅ | preview de movimento, Colono+fundação, combate narrativo, eras, diplomacia, pontuação, fim de partida |
| **4.5 — Bloco B-Extra (pré-lançamento)** | 🔜 | mapa procedural por seed, criação de partida, home refinada, ações de cidade, XP backend, deploy Vercel |
| 4.5 — Bloco C (i18n + polimento mobile) | ⏳ | — |
| 5 — Android (Kotlin) | ⏳ | — |
| 6 — Google Play | ⏳ | — |
| 7 — iOS (Swift/SwiftUI) | ⏳ | requer Mac |
| 8 — App Store | ⏳ | — |

**Próximo:** 🛑 CHECKPOINT DE JOGABILIDADE (manual) → Bloco B-Extra (BX1–BX6).
**AskUserQuestions é obrigatório** antes de qualquer decisão de design, UX ou arquitetura não coberta no playbook.

---

## Estrutura do monorepo

```
aetas/
├── packages/game-engine/   # @aetas/game-engine — TS puro, sem I/O, sem rede
├── supabase/
│   ├── migrations/         # schema Postgres
│   └── functions/          # Edge Functions TS (importam game-engine)
├── apps/
│   ├── debug-client/       # Fase 3 ✅ — valida motor+backend, grade visual de hex
│   ├── web/                # Fase 4 ✅ — React + Vite + Tailwind v4
│   ├── android/            # Fase 5 — Kotlin  ← NÃO criar agora
│   └── ios/                # Fase 7 — Swift/SwiftUI  ← NÃO criar agora (requer Mac)
└── docs/                   # GAME_DESIGN.md · ARCHITECTURE.md · GLOSSARY.md
```

**Ordem real de construção:**
motor → backend → debug-client → web → **Android** → Google Play → iOS → App Store.
Android vem antes de iOS porque não requer Mac. iOS fica por último.

---

## Decisões V1 — o que construir agora

| Tema | Decisão |
|---|---|
| Jogadores | 4-8; IA preenche vagas; solo vs. IA suportado |
| Turnos | Sequencial; jogador ausente → IA assume (**IA é obrigatória na v1**) |
| Mapa | Hex procedural, fog of war, tamanho a calibrar em playtesting |
| Economia | 3 recursos: ouro, comida, produção; cidades com crescimento passivo + especialização |
| Progressão | Por eras (poucos níveis), não árvore ramificada |
| Civilizações | 6 civilizações; 1-2 habilidades + 1 unidade especial; desbloqueáveis por XP |
| Combate | Tático (stats + terreno + ordem); disputa assíncrona ~24h com timeout automático |
| Diplomacia | Pacto de não-agressão + troca de recursos, só após contato |
| Vitória | Pontuação combinada (território + população + desenvolvimento) ao fim de N turnos |
| Eliminação | Jogador sai; território vira neutro |
| Auth | OAuth apenas — Google + Apple, sem e-mail/senha |
| Retenção | Múltiplas partidas + desafio diário seed do dia + meta-progressão XP |
| Visual (web) | Paleta dark quente (pedra à noite), dourado, fonte Cinzel nos títulos |
| Idioma (web) | EN padrão, PT disponível; seletor no header |

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
| Scaffold, configs, schema Postgres, UI de qualquer client | Sonnet 5 |
| `types.ts`, `economy.ts`, `diplomacy.ts`, `scoring.ts` | Sonnet 5 |
| Geração de mapa hex + fog of war | Sonnet 5 |
| Edge Functions simples (auth, read-only) | Sonnet 5 |
| Docs, boilerplate, tarefas mecânicas de alto volume | Haiku 4.5 |
| **`turn.ts` — máquina de estados do turno sequencial** | **Opus 4.8** |
| **`combat.ts` — disputa assíncrona + timeout** | **Opus 4.8** |
| **`ai.ts` — IA seguradora de posição + oponente** | **Opus 4.8** |
| **Edge Functions de orquestração (concorrência real)** | **Opus 4.8** |
| **Debugging de sincronização entre clients** | **Opus 4.8** |
| **Diplomacia (estado de relação multi-jogador)** | **Opus 4.8** |

Regra prática: **comece em Sonnet 5**; troque para Opus 4.8 só no prompt
específico que mexe com estado distribuído ou condições de corrida.
**Escalação de exceção:** se um bug de concorrência travar mesmo no Opus 4.8,
escale pro **Fable 5** só naquele prompt — é o modelo mais capaz da Anthropic,
mas custa ~2× o Opus, então é exceção rara, não padrão.

**Deploy do motor:** o `game-engine` roda nas Edge Functions via bundle
(`supabase/functions/_shared/backend-core.js`), que não se regenera sozinho e
não é publicado pelo Vercel. Todo prompt que altera `packages/game-engine`
termina com `pnpm --filter @aetas/backend-core bundle && npx supabase
functions deploy` — senão a regra nova só existe nos testes, não em produção.

---

## Convenções

- **TypeScript strict** em todo o monorepo (`tsconfig.base.json` na raiz)
- **Vitest** para testes do `game-engine` — rode após cada mudança no motor:
  `pnpm --filter @aetas/game-engine test`
- **Supabase:** Postgres (fonte de verdade) + Auth OAuth + Realtime (notificação "é sua vez")
- Termos de domínio: `docs/GLOSSARY.md` — Swift e Kotlin seguem suas convenções
  nativas mas mapeiam para os mesmos conceitos canônicos
- Commits por fase; CHECKPOINTs do playbook não são opcionais
- **AskUserQuestions é regra** — qualquer decisão de design/UX/arquitetura não
  coberta no playbook deve ser resolvida via pergunta antes de codar

---

## Referências completas

@docs/GAME_DESIGN.md
@docs/ARCHITECTURE.md
