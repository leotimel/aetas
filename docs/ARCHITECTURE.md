# Arquitetura Técnica — Aetas

Decisões de stack e estrutura, complementando o GAME_DESIGN.md. Diferente do
Taut e do Longshot (100% frontend), este projeto tem multiplayer assíncrono
persistente — por isso o backend é o coração do produto, não um adendo.

## Decisões travadas

- **Backend:** Supabase (Postgres + Auth + Realtime gerenciado). Razão
  decisiva: Realtime nativo resolve a notificação "é sua vez" em múltiplas
  partidas simultâneas sem montar infraestrutura de push do zero.
- **Linguagem do motor de jogo:** TypeScript em tudo — um único pacote
  compartilhado entre backend (Supabase Edge Functions) e os clients, evita
  duplicar regras de jogo em duas linguagens.
- **Clients:** três front-ends completos e independentes, todos consumindo a
  mesma API: **Web** (React), **Android nativo** (Kotlin), **iOS nativo**
  (Swift/SwiftUI). Ambos os nativos desde a v1 — decisão consciente de maior
  escopo, não um meio-termo via React Native ou PWA. Ordem de construção:
  Android antes de iOS (iOS requer Mac; Android roda no Windows sem restrição).
- **Autenticação:** OAuth apenas (Google + Apple) — sem e-mail/senha. Login
  social já entrega nome e foto prontos, úteis para identificar jogadores
  numa partida de 4-8 pessoas, sem construir fluxo de recuperação de senha.
- **Cliente de debug:** webpage mínima com botões (não CLI). Razão específica
  deste projeto: hex map + fog of war + combate tático têm estado espacial
  genuinamente difícil de inspecionar em texto puro — uma grade visual,
  mesmo sem design nenhum, poupa muito tempo de depuração.
- **Convenções entre linguagens:** um `docs/GLOSSARY.md` compartilhado define
  os termos centrais (ex: `currentPlayer`, `turnState`, `combatDispute`) que
  TS, Swift e Kotlin devem seguir nas suas convenções nativas de nomenclatura
  — evita o mesmo conceito ganhar nomes diferentes em cada client.
  1. Motor + backend, validado por um cliente de debug mínimo (texto/web simples).
  2. Web completa (Fase 4 ✅) + Web Jogável (Fase 4.5 🔜).
  3. Android nativo (Kotlin) — sem restrição de plataforma.
  4. Publicação Google Play.
  5. iOS nativo (Swift/SwiftUI) — requer Mac ou CI na nuvem (Codemagic).
  6. Publicação App Store.
  Cada etapa só começa com a anterior testada — o motor de jogo (a parte
  mais arriscada: regras, turnos, combate) é validado ANTES de qualquer
  investimento em UI bonita, nativa ou não.

## Por que essa ordem importa (risco do projeto)

Este é, de longe, o projeto mais ambicioso dos três que você construiu até
agora — comparável em complexidade a uma pequena equipe, não a um hobby de
fim de semana. A escolha de nativo (iOS + Android) duplicado, mais a web,
significa **três UIs completas** sobre o mesmo motor. A forma de tornar isso
tratável é proteger o investimento: o motor de jogo e o backend são
construídos e testados exaustivamente UMA vez; cada client é, depois disso,
"burro" — ele só desenha estado e envia ações, sem reimplementar regras.

## Estrutura de repositório (monorepo)

```
aetas/
├── CLAUDE.md
├── packages/
│   └── game-engine/          # TS PURO — o motor (compartilhado por tudo)
│       ├── src/
│       │   ├── types.ts      # HexCoord, Unit, City, Civilization, GameState...
│       │   ├── map.ts        # geração de mapa hex, fog of war
│       │   ├── turn.ts       # máquina de estados do turno sequencial
│       │   ├── combat.ts     # resolução de combate tático
│       │   ├── economy.ts    # ouro/comida/produção, crescimento de cidade
│       │   ├── diplomacy.ts  # pacto de não-agressão, troca de recursos
│       │   ├── ai.ts         # IA de turno-substituto (timeout) e oponentes
│       │   └── scoring.ts    # pontuação de vitória
│       └── *.test.ts         # Vitest — a parte mais testada do projeto
├── supabase/
│   ├── migrations/           # schema Postgres (partidas, jogadores, estado)
│   └── functions/            # Edge Functions TS que usam @aetas/game-engine
├── apps/
│   ├── debug-client/         # ✅ web mínima — valida motor+backend
│   ├── web/                  # ✅ React/Vite/Tailwind v4 — Fase 4 completa
│   ├── android/              # Kotlin — Fase 5 (próximo após 4.5)
│   └── ios/                  # Swift/SwiftUI — Fase 7 (requer Mac)
└── docs/
    ├── GAME_DESIGN.md
    └── ARCHITECTURE.md       # este arquivo
```

A regra de ouro do monorepo: **só `game-engine` define regras**. Nenhum
client (debug, web, iOS, Android) reimplementa lógica de turno, combate ou
pontuação — eles chamam a API (que por sua vez chama `game-engine` nas Edge
Functions) e renderizam o resultado. iOS e Android não conseguem importar o
pacote TS diretamente, então a regra prática é: **toda decisão de jogo passa
pelo backend**; os clients nativos nunca decidem um resultado sozinhos,
apenas mostram estado e enviam intenção de ação — evita duplicar `combat.ts`
em Swift e Kotlin.

## Responsabilidade por camada

- **`game-engine` (TS puro):** todas as regras — validação de movimento,
  resolução de combate, cálculo de economia, máquina de turnos, pontuação,
  IA de timeout. Sem I/O, sem banco, sem rede — só lógica pura e testável.
- **Supabase Postgres:** estado persistente — partidas, jogadores, mapas,
  unidades, cidades, histórico de turnos.
- **Supabase Edge Functions (TS):** orquestram — recebem ação do client,
  chamam `game-engine` pra validar/resolver, persistem no Postgres, e
  disparam evento Realtime pro próximo jogador.
- **Supabase Realtime:** notifica clients quando é a vez deles, quando um
  combate em disputa foi resolvido, quando uma partida termina.
- **Clients (debug/web/iOS/Android):** só UI e chamadas de API. Zero lógica
  de jogo duplicada.

## Recomendação de modelo Claude por tipo de tarefa

Baseado na documentação oficial da Anthropic (claude.com/resources/tutorials/
choosing-the-right-claude-model): **Sonnet 5 é o daily driver para coding**
— cobre a maioria das tarefas deste projeto (quase-Opus em código/agêntico,
mais barato que Opus). **Opus 4.8** vale especificamente para raciocínio
sustentado e complexo — o que este projeto tem mais do que o Taut/Longshot,
por causa do estado distribuído entre turnos assíncronos. **Haiku 4.5** serve
tarefas leves e mecânicas. **Fable 5** — o modelo mais capaz da Anthropic —
fica reservado como escalação de exceção quando um bug de concorrência trava
mesmo no Opus 4.8; custa ~2× o Opus, então nunca é o padrão de um prompt.

| Tipo de tarefa | Modelo sugerido | Por quê |
|---|---|---|
| Scaffold, CLAUDE.md, configuração de projeto | Sonnet | Tarefa direta, bem definida |
| Tipos e estruturas de dados (`types.ts`) | Sonnet | Mecânico, baixo risco |
| Geração de mapa hex + fog of war | Sonnet | Algoritmo conhecido, bem documentável |
| **Máquina de estados de turno sequencial** | **Opus** | Estado distribuído entre N jogadores, múltiplas partidas simultâneas, timeout — exige raciocínio cuidadoso sobre condições de corrida e edge cases |
| **Resolução de combate em disputa (assíncrono)** | **Opus** | Mesma razão: dois jogadores agindo em momentos diferentes sobre o mesmo evento, com timeout — é o ponto mais sutil do projeto |
| Economia (ouro/comida/produção) | Sonnet | Cálculo direto, sem concorrência |
| **IA de turno-substituto e oponentes** | **Opus** | Lógica de decisão com múltiplos fatores; bugs aqui são difíceis de notar (a IA "parece" jogar razoável mas erra sutilmente) |
| Diplomacia (pacto, troca) | Sonnet | Regras simples na v1 |
| Schema Postgres + migrations | Sonnet | Direto, mas revisar com cuidado (é a fonte de verdade) |
| Edge Functions (orquestração) | Sonnet, escalar p/ Opus se houver bug de concorrência | Geralmente direto; condições de corrida reais merecem Opus |
| UI de cada client (web/iOS/Android) | Sonnet | Trabalho de interface padrão |
| **Debugging de sincronização entre clients** | **Opus** | Bugs de estado distribuído são o tipo mais caro de debugar errado |
| Testes (Vitest, XCTest, etc.) | Sonnet | Direto, ainda que extenso |
| Documentação, README | Haiku ou Sonnet | Baixo risco, alto volume de texto |

Regra prática pro playbook: comece todo prompt em Sonnet 5. Se a resposta
"parecer" funcionar mas você tiver dúvida sobre um edge case de concorrência
(dois jogadores agindo quase ao mesmo tempo, timeout disparando no limite),
peça pro Claude Code trocar para Opus nesse prompt específico — não troque
o projeto inteiro, troque o prompt. Se mesmo o Opus travar no mesmo bug,
escale pro Fable 5 como último recurso, também só naquele prompt.

**Deploy do motor:** o `game-engine` roda nas Edge Functions via
`supabase/functions/_shared/backend-core.js`, um bundle que precisa ser
regenerado manualmente e publicado com `supabase functions deploy` — o Vercel
só publica a web. Qualquer prompt que altera `packages/game-engine` deve
terminar com `pnpm --filter @aetas/backend-core bundle && npx supabase
functions deploy`.

## Glossário compartilhado (a criar na Fase 0 do playbook)

`docs/GLOSSARY.md` deve listar os termos centrais do domínio do jogo (estado
de turno, disputa de combate, civilização, especialização de cidade, etc.)
com a forma canônica em português/conceito + a convenção esperada em cada
linguagem (camelCase TS, camelCase Swift, camelCase ou snake_case Kotlin
conforme convenção da comunidade). Évita que o mesmo conceito ganhe nomes
diferentes em cada client por não haver código compartilhado de UI.
