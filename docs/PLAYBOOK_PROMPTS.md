# Playbook de prompts — Aetas

Sequência de prompts para o **Claude Code**, seguindo a ordem de risco
decrescente travada na arquitetura: motor + backend → cliente de debug →
web → iOS → Android. Anexe `GAME_DESIGN.md` e `ARCHITECTURE.md` na primeira
mensagem.

## Como usar este playbook

- **Um prompt por vez.** Revise o diff antes do próximo.
- **Modelo sugerido em cada prompt** — ver a tabela completa em
  `ARCHITECTURE.md`. Regra prática: comece em **Sonnet**; troque para
  **Opus** só no prompt específico que mexe com estado distribuído/
  concorrência, não no projeto inteiro.
- **Rode os testes** (`npx vitest run` no `game-engine`) depois de cada
  mudança em regras de jogo.
- **Commit por fase.**
- 🧠 = peça pro Claude **planejar antes de codar**.
- 🔴 = prompt onde **Opus é recomendado**, não Sonnet.
- **Respeite os CHECKPOINTs** — mais críticos aqui que em qualquer projeto
  anterior, porque bug de regra descoberto tarde custa retrabalho em 3 UIs.

---

## FASE 0 — Fundação do monorepo

**0.1 — Scaffold do monorepo** · Sonnet
```
Crie um monorepo chamado "aetas" (use pnpm workspaces ou turborepo, a seu
critério) com a estrutura: packages/game-engine/ (publicado internamente
como @aetas/game-engine, TS puro, sem dependências de runtime além de
stdlib), supabase/ (migrations + functions), apps/debug-client/,
apps/web/, docs/. NÃO crie ainda apps/ios/ nem apps/android/ — chegaremos
lá depois de validar o motor. TypeScript strict em todo o repo. Configure
Vitest no game-engine.
```

**0.2 — CLAUDE.md**
```
Crie um CLAUDE.md na raiz com: o que é o jogo (Aetas — Civ-like destilado,
hex map, multiplayer assíncrono sequencial, 4-8 jogadores; nome do latim
"era/idade", refletindo a progressão por eras); a regra de arquitetura
inviolável (só game-engine define regras de jogo; nenhum client — debug,
web, iOS, Android — reimplementa lógica; toda decisão passa pelo backend);
o resumo das decisões de v1 vs v2+ do GAME_DESIGN.md (cole as seções
principais); a tabela de modelo por tipo de tarefa do ARCHITECTURE.md
(resumida); convenções (TS strict, Vitest, Supabase). Mantenha gerenciável,
~150 linhas — pode usar @docs/GAME_DESIGN.md e @docs/ARCHITECTURE.md como
imports se preferir não duplicar tudo.
```

**0.3 — Glossário compartilhado**
```
Crie docs/GLOSSARY.md com os termos centrais do domínio do jogo em uma
tabela: conceito (em português, descritivo) | nome canônico em TS (camelCase)
| convenção esperada em Swift | convenção esperada em Kotlin. Inclua pelo
menos: estado de turno, jogador atual, disputa de combate, civilização,
unidade, cidade, especialização de cidade, pacto de não-agressão, partida,
desafio diário, meta-progressão/XP. Vamos expandir esse arquivo conforme o
projeto avança.
```

✅ **Commit:** "monorepo + CLAUDE.md + glossário".

---

## FASE 1 — Motor de jogo (game-engine) — a parte mais arriscada do projeto

Construa de baixo pra cima, testando cada peça antes da próxima.

**1.1 — Tipos centrais** · Sonnet
```
Em packages/game-engine/src/types.ts, defina os tipos centrais: HexCoord
(coordenadas axiais ou cúbicas, sua escolha — justifique); Player; Unit
(tipo, posição, stats, dono); City (posição, dono, população, especialização,
nível); Civilization (nome, habilidades, unidade especial); GameState
(jogadores, mapa, unidades, cidades, turno atual, jogador da vez); TurnState
(enum: aguardando ação, processando, concluído); CombatDispute (unidades
envolvidas, timestamp, prazo de timeout). Baseie os nomes no GLOSSARY.md.
```

**1.2 — Geração de mapa hex + fog of war** · Sonnet 🧠
```
Em packages/game-engine/src/map.ts: gere um mapa hexagonal proceduralmente
(tamanho parametrizável — ainda vamos calibrar contra 4-8 jogadores), com
tipos de terreno (planície, floresta, montanha, água, etc.) que influenciam
combate depois. Implemente o cálculo de fog of war: dado um jogador e o
conjunto de unidades/cidades dele, quais hexágonos estão visíveis (raio de
visão por unidade/cidade). Escreva testes: mapa determinístico com seed;
fog of war revela só o que está no raio; hexágono nunca revelado uma vez
visto (memória de exploração, não visão atual).
```

**1.3 — Economia das cidades** · Sonnet
```
Em packages/game-engine/src/economy.ts: implemente o crescimento passivo de
população por turno, e a lógica de especialização de cidade (militar,
comercial, científica — cada uma afeta a produção de ouro/comida/produção
de forma diferente). Escreva testes para os 3 recursos e para a curva de
crescimento populacional ao longo de N turnos.
```

🔴 **1.4 — Máquina de estados do turno sequencial** · **Opus** 🧠
```
Em packages/game-engine/src/turn.ts, implemente a máquina de estados do
turno sequencial para uma partida com 4-8 jogadores. Responsabilidades:
- Determinar de quem é a vez (ordem fixa, ciclo).
- Validar que só o jogador da vez pode submeter ações.
- Processar o fim de turno (aplica crescimento de cidade, resolve timeouts
  pendentes, avança para o próximo jogador).
- Detectar fim de partida (atingiu N turnos do GAME_DESIGN.md).
Preste atenção especial a: o que acontece se duas requisições de "terminar
turno" chegarem quase simultaneamente (não deve ser possível, mas trate
defensivamente); como o estado persiste de forma que uma falha no meio do
processamento não deixe a partida num estado inconsistente (pense em termos
de transação). Escreva testes extensivos, incluindo casos de borda: último
jogador do turno, jogador eliminado no meio do ciclo, partida com só 1
jogador restante.
```

🔴 **1.5 — Resolução de combate (incluindo disputa assíncrona)** · **Opus** 🧠
```
Em packages/game-engine/src/combat.ts, implemente:
1. Resolução de combate tático: stats das unidades envolvidas + bônus/
   penalidade de terreno + ordem de ataque → resultado (vencedor, dano,
   unidades destruídas).
2. O fluxo de "disputa assíncrona": quando unidades de dois jogadores
   diferentes se encontram, crie um CombatDispute com prazo de ~24h. Modele
   os possíveis estados: aguardando resposta de ambos, resolvido por ação de
   um dos jogadores, resolvido por timeout (resolução automática).
Preste atenção especial a: condições de corrida caso ambos os jogadores
respondam quase ao mesmo tempo; o que exatamente acontece na resolução por
timeout (qual lado "vence" por padrão — defina e justifique a regra); como
isso interage com a IA de timeout do turno (prompt 1.6) se o jogador ausente
também está envolvido no combate. Escreva testes cobrindo cada um desses
estados explicitamente, não só o caminho feliz.
```

🔴 **1.6 — IA de turno-substituto e oponentes** · **Opus** 🧠
```
Em packages/game-engine/src/ai.ts, implemente duas IAs com propósitos
diferentes:
1. IA "seguradora de posição" — assume temporariamente o turno de um
   jogador ausente (ver GAME_DESIGN.md: turno sequencial). Deve jogar de
   forma RAZOÁVEL mas conservadora (não perder unidades de graça, não
   declarar guerra) — o objetivo é não atrapalhar a partida, não jogar bem.
2. IA de oponente (preenche vagas vazias e modo solo vs. IA) — pode ser mais
   ativa/estratégica que a seguradora de posição.
Documente claramente a diferença de comportamento entre as duas no código.
Escreva testes que validem que a IA nunca produz uma ação ilegal (sempre
passa pela mesma validação que uma ação humana passaria).
```

**1.7 — Diplomacia (v1: pacto + troca)** · Sonnet
```
Em packages/game-engine/src/diplomacy.ts: implemente proposta e aceite de
pacto de não-agressão simples, e troca de recursos entre jogadores que já
tiveram contato (fog of war — ver GLOSSARY.md). Sem tratados complexos
(isso é v2+, conforme GAME_DESIGN.md). Testes para proposta, aceite, recusa,
e a checagem de que só funciona após contato prévio.
```

**1.8 — Pontuação e vitória** · Sonnet
```
Em packages/game-engine/src/scoring.ts: calcule a pontuação combinada
(território + população + nível de desenvolvimento) e determine o vencedor
ao fim de N turnos. Implemente também a lógica de eliminação (jogador sem
cidades sai da partida, território vira neutro). Testes cobrindo empate,
eliminação no meio da partida, e cálculo correto dos 3 componentes da
pontuação.
```

🛑 **CHECKPOINT DO MOTOR — não pule.**
Rode a suíte de testes completa (`npx vitest run`). Escreva um script
temporário que simula uma partida completa entre "bots" simples chamando
direto o game-engine (sem rede, sem UI) — turnos avançando, combates
acontecendo, uma disputa de combate sendo resolvida por timeout, um jogador
sendo eliminado, a partida terminando por pontuação. Leia o GameState
resultante a cada etapa. Esse é o equivalente, aqui, ao checkpoint do Taut e
do Longshot — mas mais crítico, porque qualquer bug de regra encontrado
depois desse ponto vai custar retrabalho em 3 interfaces diferentes, não
numa só.

✅ **Commit:** "game-engine completo + testado".

---

## FASE 2 — Backend (Supabase)

**2.1 — Schema do banco** · Sonnet 🧠
```
Em supabase/migrations/, crie o schema Postgres: tabelas para partidas
(games), jogadores por partida (game_players), estado do mapa/unidades/
cidades (pode ser JSONB do GameState ou normalizado — avalie e justifique a
escolha), histórico de turnos, disputas de combate pendentes, e perfis de
usuário (vinculados ao OAuth). Configure Row Level Security: um jogador só
pode ler/escrever na partida em que está, e só pode submeter ação no seu
próprio turno.
```

**2.2 — Autenticação OAuth**
```
Configure Supabase Auth com Google e Apple OAuth (sem e-mail/senha, conforme
ARCHITECTURE.md). Documente em docs/ os passos manuais que EU preciso fazer
no console do Google/Apple e no painel do Supabase (client IDs, redirect
URIs) — isso não dá pra automatizar via Claude Code.
```

🔴 **2.3 — Edge Functions de orquestração de turno** · **Opus** 🧠
```
Crie as Supabase Edge Functions que conectam o backend ao game-engine:
submeter ação de turno (valida que é a vez do jogador, chama turn.ts,
persiste, dispara Realtime), resolver disputa de combate (chama combat.ts),
e o job de timeout (verifica disputas/turnos vencidos e aplica a IA
seguradora ou a resolução automática). Preste atenção especial a chamadas
concorrentes para a mesma partida — use transações Postgres para evitar
condição de corrida entre duas ações quase simultâneas. Escreva testes de
integração que simulem chamadas concorrentes.
```

**2.4 — Realtime de notificação**
```
Configure os canais Supabase Realtime: notificar o próximo jogador quando o
turno passa pra ele, notificar quando uma disputa de combate envolvendo o
jogador é resolvida, notificar fim de partida. Documente o formato dos
eventos para os clients consumirem.
```

✅ **Commit:** "backend Supabase completo".

---

## FASE 3 — Cliente de debug

**3.1 — Webpage mínima de debug** · Sonnet 🧠
```
Crie apps/debug-client/ como uma webpage simples (Vite + vanilla TS ou React
mínimo, sem necessidade de design) que: faz login via Supabase Auth, lista
partidas do jogador, mostra o GameState de uma partida como uma grade visual
de hexágonos (cor por tipo de terreno, ícone simples para unidade/cidade,
hexágonos não explorados em cinza/escuro para representar fog of war), e
tem botões para as ações básicas (mover unidade, atacar, fundar cidade,
propor pacto, terminar turno). O objetivo é INSPECIONAR o estado real do
jogo via Supabase, não ser bonito.
```

🛑 **CHECKPOINT DE INTEGRAÇÃO — não pule.**
Jogue uma partida completa de verdade entre 2-3 contas de teste através do
debug client: turnos passando, combate acontecendo, uma disputa de combate,
timeout funcionando, fim de partida. Esse é o primeiro teste end-to-end
real (motor + backend + rede + auth juntos). Só depois disso vale investir
em qualquer UI de produto.

✅ **Commit:** "debug client funcional".

---

## FASE 4 — Web (React)

**4.1 — Scaffold e auth** · Sonnet
```
Em apps/web/, crie um projeto Vite + React + TypeScript + TailwindCSS.
Configure login OAuth via Supabase Auth (Google + Apple). Tela de lista de
partidas (ativas, aguardando sua vez, finalizadas).
```

**4.2 — Visualização do mapa hex** · Sonnet 🧠
```
Crie o componente de mapa hexagonal em SVG ou Canvas: terreno, fog of war,
unidades, cidades, seleção e movimento (clique para selecionar unidade,
clique no destino para mover, respeitando as regras do game-engine via API).
Visual mobile-first responsivo mesmo sendo "web".
```

**4.3 — Telas de jogo**
```
Crie as telas restantes: detalhes de cidade (escolher especialização), tela
de combate (mostrar resultado/disputa), tela de diplomacia (propor pacto/
troca), tela de fim de turno, tela de fim de partida (pontuação final).
```

**4.4 — Desafio diário solo**
```
Implemente o desafio diário: mapa pequeno gerado com seed do dia
(compartilhada entre todos os jogadores — mesmo padrão do Taut e do
Longshot), partida solo contra IA, resultado comparável/compartilhável.
```

**4.5 — Meta-progressão de conta**
```
Implemente XP por partida jogada/vencida, tela de desbloqueio de
civilizações e cosméticos simples (cores/bandeiras), persistido no perfil
do usuário no Supabase.
```

✅ **Commit:** "web completa".

---

## FASE 5 — iOS nativo (Swift/SwiftUI)

**5.1 — Scaffold e auth**
```
Crie apps/ios/ como projeto Swift/SwiftUI. Configure Supabase Auth (Google +
Apple OAuth) usando o SDK oficial do Supabase para Swift. Tela de lista de
partidas. Siga as convenções do docs/GLOSSARY.md para nomear os conceitos
de domínio de forma consistente com o resto do projeto.
```

**5.2 — Mapa hex e telas de jogo** · Sonnet 🧠
```
Reimplemente a visualização do mapa hexagonal nativamente (SwiftUI Canvas ou
similar) e as telas de jogo equivalentes à Fase 4 (web) — cidade, combate,
diplomacia, fim de turno/partida. A LÓGICA é sempre via chamadas à API
(Edge Functions); este client nunca decide um resultado de jogo sozinho.
```

**5.3 — Desafio diário e progressão**
```
Implemente as telas equivalentes às 4.4 e 4.5, consumindo a mesma API.
```

✅ **Commit:** "iOS completo".

---

## FASE 6 — Android nativo (Kotlin)

**6.1 a 6.3 — Espelham a Fase 5**
```
Repita a Fase 5 em Kotlin/Jetpack Compose, usando o SDK Supabase para
Kotlin, seguindo o mesmo GLOSSARY.md.
```

✅ **Commit:** "Android completo".

---

## Transversal — qualidade (quando a dor aparecer)

**T.1 — Slash command de teste**
```
Crie .claude/commands/testar.md: roda vitest run no game-engine e resume.
```

**T.2 — Subagent revisor de concorrência** 🔴 (defina como Opus)
```
Crie .claude/agents/revisor-concorrencia.md: subagent que revisa mudanças em
turn.ts, combat.ts e nas Edge Functions de orquestração, especificamente
procurando condições de corrida e estados inconsistentes — os pontos mais
caros de errar neste projeto.
```

---

### Lembrete final

Este é o projeto mais ambicioso dos seus três (Taut, Longshot, este) — três
UIs completas sobre um motor compartilhado, com multiplayer assíncrono
persistente. A proteção contra esse tamanho é a disciplina dos checkpoints:
o motor de jogo validado exaustivamente ANTES do backend, o backend validado
via debug client ANTES de qualquer UI de produto, e cada client nativo só
começa depois que o anterior provou o conceito. Pular um checkpoint aqui não
economiza tempo — desloca o custo do bug para um momento mais caro de
corrigir (depois de já ter 2-3 UIs construídas em cima dele).
