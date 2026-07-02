# Playbook de prompts — Aetas

Sequência de prompts para o **Claude Code**, seguindo a ordem de risco
decrescente travada na arquitetura: motor + backend → cliente de debug →
web jogável → Android → iOS.
Anexe `GAME_DESIGN.md` e `ARCHITECTURE.md` na primeira mensagem.

**Estado atual (nesta revisão):** Fases 0–4 e 4.5 Blocos A/B/B-Extra/FX completas (código). Motor, backend, debug-client e toda a web jogável implementados (design system, sprites, texturas, movimento, combate, diplomacia, eras, pontuação, fim de partida), deploy Vercel ativo.
**Bloqueio atual:** validação em produção achou que FX1–FX4 não estão no servidor (Edge Functions não redeployadas) e que partidas com N IAs criam só 2 jogadores. O próximo bloco é o **Bloco GX** (jogabilidade mínima viável) — execute GX1 → GX2 → GX3 → GX4. GX1 (deploy + nº de jogadores) é o destravamento que resolve fog/custos/posições de uma vez.
Só após o 🛑 CHECKPOINT GX seguir para o Bloco C → Android (Fase 5).

## Como usar este playbook

- **Um prompt por vez.** Revise o diff antes do próximo.
- **🤔 AskUserQuestions é regra:** qualquer decisão de design, UX ou
  arquitetura não coberta neste playbook DEVE ser resolvida via perguntas
  ao usuário antes de codar — nunca assuma. Se o Claude Code iniciar uma
  sessão nova, pergunte antes de partir para código.
- **Modelo sugerido em cada prompt** (regra): comece em **Sonnet 5**
  (daily driver — quase-Opus em código/agêntico e mais barato); troque para
  **Opus 4.8** só em prompts marcados 🔴 (estado distribuído, concorrência,
  algoritmos complexos). **Haiku 4.5** para docs/boilerplate. Nunca troque
  o projeto inteiro de modelo — troque o prompt específico.
  - **⚡ Escalação p/ Fable 5 (raro):** se um bug de concorrência/estado
    distribuído travar mesmo no Opus 4.8, escale pro **Fable 5** só naquele
    prompt. É o modelo mais capaz, mas custa ~2× o Opus — use como exceção,
    não como padrão.
- **Rode os testes** (`pnpm --filter @aetas/game-engine test`) depois de cada
  mudança em regras de jogo.
- **🔻 Deploy do backend após mudar o `game-engine`:** o motor roda nas Edge
  Functions através do bundle `supabase/functions/_shared/backend-core.js`. Ele
  NÃO se regenera sozinho e o Vercel só publica a web. Todo prompt que altera
  `packages/game-engine` DEVE terminar com:
  `pnpm --filter @aetas/backend-core bundle && npx supabase functions deploy`.
  (Foi por pular isso que BAL-1/2/3 não foram ao ar por várias sessões.)
- **Commit por fase.**
- 🧠 = peça pro Claude **planejar antes de codar**.
- 🔴 = prompt onde **Opus 4.8 é recomendado**, não Sonnet.
- **Respeite os CHECKPOINTs** — mais críticos aqui que em qualquer projeto
  anterior; bug de regra descoberto tarde custa retrabalho em 3 UIs.

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

## FASE 1 — Motor de jogo (game-engine) ✅ IMPLEMENTADO

Esta fase está completa. O `packages/game-engine/` contém: tipos centrais,
geração de mapa hex + fog of war, economia das cidades (3 recursos),
máquina de estados do turno sequencial, resolução de combate assíncrono,
IA de turno-substituto e oponentes, diplomacia, pontuação e vitória.
Ver FASE 1.5 abaixo para o conteúdo adicionado sobre essa base.

---

## FASE 1.5 — Profundidade de conteúdo (motor)

**Por que esta fase existe:** o playbook original implementou a estrutura
mínima de cada sistema (1 unidade, especialização sem edifícios, sem catálogo
de civilizações) e seguiu para backend/UI sem nunca encher esses sistemas de
conteúdo de verdade. O resultado: o jogo "funciona" mas não é jogável — falta
variedade real. Esta fase preenche isso ANTES de continuar para Fase 2+,
porque unidades/edifícios/civilizações são REGRAS DE JOGO (pertencem ao
`game-engine`, não à UI) — adicioná-las depois da Fase 4 forçaria retrabalho
na UI que já consome esses dados.

**1.5.1 — Catálogo de unidades** · Sonnet 🧠
```
Em packages/game-engine/src/units.ts, expanda além do Warrior único atual
para um catálogo de 6-8 tipos de unidade com progressão por era (conforme
GAME_DESIGN.md): por exemplo Warrior (era 1, corpo a corpo básico), Arqueiro
(era 1, ataque à distância), Colono (era 1, funda cidades — hoje isso pode
estar implícito, torne explícito como unidade), Cavalaria (era 2, movimento
alto), Catapulta/Cerco (era 2, bônus contra cidades), Cavaleiro (era 3,
forte mas caro), Besteiro ou equivalente (era 3, ataque à distância
avançado). Cada tipo: custo de produção, stats (ataque, defesa, movimento,
alcance), era mínima para construir. Atualize types.ts se necessário.
Escreva testes: cada unidade tem stats válidos; unidades de era superior
exigem progressão tecnológica adquirida.
```

**1.5.2 — Edifícios por especialização** · Sonnet
```
Em packages/game-engine/src/buildings.ts, implemente 2-3 edifícios fixos por
especialização de cidade (militar, comercial, científica — conforme
economy.ts já existente): por exemplo, especialização militar desbloqueia
Quartel (produção de unidade mais rápida) e Muralha (bônus defensivo);
comercial desbloqueia Mercado (bônus de ouro) e Porto (se costeira, bônus
adicional); científica desbloqueia Biblioteca (acelera progressão de era) e
Templo (bônus cultural/pontuação). Edifícios são construídos com o recurso
"produção" e levam um número de turnos. Integre com economy.ts existente.
Testes: cada edifício aplica seu bônus corretamente; só pode construir
edifício compatível com a especialização escolhida.
```

**1.5.3 — Catálogo de 6 civilizações** · Sonnet 🧠
```
Em packages/game-engine/src/civilizations.ts, implemente o catálogo completo
de 6 civilizações jogáveis, cada uma com 1-2 habilidades únicas + 1 unidade
especial (substituindo um tipo de unidade comum equivalente):
1. Roma — bônus de produção/infraestrutura; unidade especial: Legionário
   (bônus em terreno aberto, substitui um corpo-a-corpo padrão).
2. Mongóis — bônus de movimento de cavalaria; unidade especial: Cavaleiro
   Mongol (movimento extra, substitui a Cavalaria padrão).
3. Egito — bônus de crescimento populacional/comida; unidade especial:
   Carro de Guerra (substitui um corpo-a-corpo ou cavalaria leve).
4. Grécia — bônus científico/cultural; unidade especial: Hoplita (bônus
   defensivo, substitui o Warrior/corpo-a-corpo padrão).
5. Vikings — bônus de exploração/naval; unidade especial: Berserker ou
   Drakkar (a definir se há unidade naval no catálogo geral).
6. China — bônus de ouro/comércio; unidade especial: Arqueiro de Cavalo ou
   equivalente avançado (substitui um tipo à distância).
Cada civilização referencia tipos de units.ts (1.5.1), trocando uma entrada
pela versão especial dela. Testes: cada civilização tem exatamente 1 unidade
especial válida; bônus de habilidade aplicam corretamente no economy.ts e
combat.ts existentes (ex: bônus de produção de Roma realmente aumenta o
output).
```

🛑 **CHECKPOINT DE CONTEÚDO — não pule.**
Rode os testes. Depois, no script de simulação de partida (do checkpoint da
Fase 1), jogue com pelo menos 3 civilizações diferentes e confirme que cada
uma "sente" diferente — Roma produzindo mais rápido, Mongóis se movendo mais,
etc. Construa pelo menos 1 edifício de cada especialização e confirme o bônus.
Esse é o ponto que faltava no playbook original: validar que o jogo tem
profundidade ANTES de investir em deixá-lo bonito.

✅ **Commit:** "profundidade de conteúdo: unidades, edifícios, civilizações".

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

## FASE 4 — Web (React): estrutura básica ✅ IMPLEMENTADO

Esta fase está completa. `apps/web/` tem: auth OAuth, mapa SVG com fog of
war, modal de cidade (especialização, edifícios, produção de unidades),
perfil/XP, civilizações, game over, desafio diário. Ver FASE 4.5 abaixo
para os fluxos completos, estética Roma Antiga e polimento que faltam.

---

## FASE 4.5 — Web Jogável: mecânicas completas + estética Roma Antiga

**O que esta fase entrega:** transformar a web de "estrutura funcional" em
jogo jogável de verdade — todas as mecânicas que faltam (movimento com
preview, Colono fundando cidade, combate com log narrativo, eras de
progressão, diplomacia completa, pontuação e fim de partida) + estética
refinada "UI clássica de mármore/ouro + mapa com textura visual rica" +
idioma EN/PT com EN como padrão. Só depois desta fase seguir para mobile.

**Decisões de design travadas para esta fase:**
- Arte: sprites SVG por tipo de unidade (vetorial, zero dependência externa);
  texturas de terreno como padrões SVG procedurais (gradientes + formas
  geométricas por tipo — floresta, montanha, água, planície, deserto).
- Animações: suaves no movimento (250-400ms), dramáticas no combate e fim
  de partida (500-800ms com efeito de impacto).
- Idioma: EN padrão, PT disponível; seletor no header e em Settings/Perfil.
- Estética: paleta ouro/mármore/pedra escura (Roma Antiga/Panteão) para UI;
  mapa com texturas de terreno ilustradas em SVG.
- **AskUserQuestions é obrigatório** em qualquer decisão não coberta aqui.

---

### Bloco A — Identidade Visual "Roma Antiga + Tabuleiro de Guerra" ✅ IMPLEMENTADO

Design system (tokens CSS, Cinzel, paleta dark/dourado em `src/styles/tokens.css`), texturas SVG procedurais de terreno (`src/assets/terrain-patterns.tsx`), sprites SVG por tipo de unidade em `src/assets/units/` (11 tipos + cidade + capital), animações CSS de movimento (300ms), combate (600ms flash de impacto) e fim de partida (`anim-fanfare` + chuva de partículas douradas).

---

### Bloco B — Mecânicas que tornam o jogo jogável ✅ IMPLEMENTADO

Preview de movimento + seleção (B1), Colono funda cidade via `FoundCityModal` (B2), combate com log narrativo via `CombatPreviewModal` (B3), eras via `EraModal` (B4), diplomacia — pacto/guerra/troca — via `DiplomacyPanel`/`DeclareWarModal`/`TradeModal` (B5), pontuação via `ScoreModal` + fim de partida via `GameOverScreen` + `scoring.ts` no engine (B6). Edge Function `submit-action` transmite `game_over` via Realtime quando `isFinished`.

🛑 **CHECKPOINT DE JOGABILIDADE.**
Jogue uma partida completa do início ao fim com **2 contas reais de teste (Google OAuth)**: funde
uma cidade (Colono), avance de era, declare guerra e resolva um combate,
proponha e aceite um pacto diplomático, e chegue ao fim de partida vendo
a tela de resultados. Se qualquer um desses fluxos travar ou não existir,
corrija antes de seguir. Este é o checkpoint mais importante desde o motor
— é aqui que o Aetas vira um jogo de verdade.

---

### Bloco B-Extra — Melhorias pré-lançamento web

**Decisões travadas para este bloco:**
- Mapa: gerado da seed da partida (determinístico e replicável), com opção
  de pedir novo mapa ao criar — gera nova seed aleatória.
- Fog of war: dissipação gradual e dinâmica conforme a tropa se aproxima
  (raio de visão expande progressivamente, não pisca instantaneamente).
- Criação de partida: dificuldade (fácil/normal/difícil), nações (2-8),
  tamanho do mapa (P/M/G), modo solo vs IA, escolha de civilização.
- Ações de cidade: treinar unidades e construir edifícios funcionando.
- XP: enriquecido com eventos granulares (ver tabela abaixo).
- Publicação: Vercel, deploy automático via GitHub, `playaetas.vercel.app`
  (sem domínio próprio agora — validar primeiro, comprar depois).

**Ordem de execução definida:** BX4 → BX5 → BX1 → BX2 → BX3 → BX6
(ações de cidade e XP backend primeiro por serem dependências técnicas; seed do mapa antes da tela de criação que a usa).

**4.5.BX4 — Ações de cidade funcionando (treinar e construir)** · Sonnet 🧠
```
As ações do modal de cidade (botões "Treinar" e "Construir") existem
visualmente mas não chamam nenhuma ação real. Implemente os dois fluxos
completos:
1. TREINAR UNIDADE:
   - Clique em "Treinar [Unidade]": verifica se o jogador tem produção
     suficiente (já mostrado no modal). Se sim, chama a Edge Function de
     produção, debita o custo, e inicia o timer de produção (N turnos).
   - Enquanto produzindo: o modal mostra "Treinando [Unidade] — X turnos
     restantes" no lugar do botão. A cidade não pode treinar outra unidade
     ao mesmo tempo (fila simples de 1 item na v1).
   - Quando a produção termina (no processamento do turno): a unidade
     aparece no hex da cidade com animação de surgimento (fade-in + scale).
2. CONSTRUIR EDIFÍCIO:
   - Mesmo fluxo: clique → verifica recursos → debita produção → inicia
     timer de construção.
   - Edifício aparece como "construindo" no modal com barra de progresso por
     turno. Quando termina, o bônus passa a ser aplicado e o edifício
     aparece como construído com ícone colorido.
3. Após qualquer ação de cidade: o modal atualiza os recursos do jogador
   em tempo real (sem precisar fechar e abrir de novo).
4. Escreva testes na Edge Function: não pode treinar sem recursos suficientes;
   não pode construir edifício incompatível com a especialização; duas ações
   simultâneas na mesma cidade são rejeitadas.
```

**4.5.BX5 — XP e levels funcionando no backend** · Sonnet
```
Conecte o sistema de XP/levels ao Supabase, implementando a tabela completa
de eventos com os valores refinados:

| Evento                    | XP  |
|---------------------------|-----|
| Turno jogado              | +5  |
| Primeira partida do dia   | +10 |
| Derrota (terminou partida)| +10 |
| Combate vencido           | +6  |
| Edifício construído       | +5  |
| Cidade fundada            | +8  |
| Era avançada              | +20 |
| Civilização eliminada     | +15 |
| Vitória                   | +40 |
| Daily jogado              | +15 |
| Daily vencido             | +50 |

Implemente:
1. Uma Edge Function `award_xp(userId, event, amount)` chamada pelos fluxos
   existentes (fim de turno, combate, construção, etc.) — um único ponto
   de entrada pra não espalhar lógica de XP pelo código.
2. A função atualiza `profiles.xp` e `profiles.level` no Supabase,
   calculando o nível com base na tabela de thresholds que já aparece no
   perfil (nível 2 = 50 XP, nível 3 = 150 XP, etc.).
3. Na web, quando XP é ganho: exiba um toast animado "+8 XP — Cidade
   fundada!" que aparece no canto da tela e some após 2s. Se subiu de nível,
   exiba um modal celebratório maior.
4. A barra de XP no header (BX3) deve atualizar em tempo real via Supabase
   Realtime (sem reload).
5. Testes: XP nunca fica negativo; level sobe no threshold correto; eventos
   duplicados na mesma ação não geram XP duplo (idempotência por ID de ação).
```

**4.5.BX1 — Mapa procedural por seed de partida** · Sonnet 🧠
```
Refatore a geração de mapa no game-engine e no backend para:
1. Cada partida ter uma seed única gerada no momento da criação (UUID ou
   hash aleatório). Essa seed determina completamente o mapa — terreno,
   tamanho, posições de recursos. Mesmo seed = mesmo mapa (replicável).
2. No fluxo de criação de partida, após o jogador configurar os parâmetros,
   mostrar uma prévia do mapa gerado (miniatura simplificada do hex grid,
   sem fog of war ainda) com um botão "Gerar Novo Mapa" que sorteia uma nova
   seed e exibe outra prévia. Quando satisfeito, o jogador confirma e a seed
   fica salva na partida no Supabase.
3. Garantir que o tamanho do mapa (P/M/G — definido em BX2) afete o número
   de hexes gerados: pequeno ~50 hexes, médio ~100, grande ~180. Calibre os
   valores jogando — não trave no número certo na primeira vez.
4. Escreva testes: mesma seed + mesmo tamanho = mapa idêntico; seeds
   diferentes = mapas diferentes; mapa sempre tem hexes de todos os tipos
   de terreno em proporções razoáveis.
```

**4.5.BX2 — Tela de criação de partida com personalizações** · Sonnet 🧠
```
Redesenhe o fluxo de "Nova Partida" na web com todas as opções de
personalização, numa tela dedicada (não um modal genérico):
1. MODO DE JOGO:
   - "Multiplayer" (convida outros jogadores por link/código)
   - "Solo vs IA" (preenche todas as vagas com IA)
   - "Misto" (alguns humanos, resto IA)
2. CONFIGURAÇÕES DA PARTIDA:
   - Número de nações: slider 2-8
   - Tamanho do mapa: toggle Pequeno / Médio / Grande (com descrição de
     quantos hexes e tempo estimado de partida)
   - Duração: Curta (10 turnos) / Média (20 turnos) / Longa (40 turnos)
   - Dificuldade da IA: Fácil / Normal / Difícil (só aparece se tiver IA)
3. SUA CIVILIZAÇÃO: grade com as 6 civilizações desbloqueadas (igual ao
   perfil), mais as bloqueadas com cadeado. Clique seleciona a sua civ.
4. PRÉVIA DO MAPA: miniatura do hex grid gerado pela seed atual + botão
   "Gerar Novo Mapa" (implementado em BX1).
5. Botão "Criar Partida" no final confirma tudo, chama a Edge Function de
   criação com todos os parâmetros, e navega para a partida.
Estética consistente com o design system do Bloco A (fundo pedra escura,
elementos ouro, tipografia serifada nos títulos).
```

**4.5.BX3 — Tela inicial em dashboard** · Sonnet 🧠
```
Refine `apps/web/src/pages/GameListPage.tsx` transformando-a num dashboard
com seções. Leia antes de começar: `MapPreviewMini.tsx` (criado em BX1),
`DailyCard.tsx`, e os helpers `LevelBadge`/`XpMiniBar` já existentes
inline em GameListPage.

1. HEADER TEMÁTICO
   Avatar circular da civ selecionada: busque `profiles.selected_civ`, use
   `CIVILIZATIONS` para `civ.color` e a inicial do nome como texto.
   `w-8 h-8 rounded-full text-sm font-bold text-white flex items-center
   justify-center` com `style={{ backgroundColor: civ.color }}`.
   Ao lado: badge de nível dourado + XP bar animada (já existem — reuse).
   Botão de perfil abre ProfilePage. À direita: botão `EN | PT` desativado
   (`disabled`, `opacity-40`, `cursor-not-allowed`, `title="Em breve — Bloco C1"`)
   e botão Sair discreto. Estética do header: adicione
   `bg-gradient-to-r from-aetas-gold/5 to-transparent` na borda inferior.

2. DESAFIO DIÁRIO AMPLIADO
   Amplie `DailyCard.tsx`: `min-h-28`, fundo `bg-gradient-to-br
   from-aetas-surface to-aetas-raised`, bordas `border border-aetas-gold/30`.
   Countdown em fonte monoespaçada proeminente (não precisa animar dígito
   a dígito — basta atualizar a cada segundo com `setInterval`).
   Badge `✓ Jogado hoje` em verde (`text-emerald-400`) se já jogou.

3. SEÇÕES EMPILHADAS — sem abas
   Remova o sistema de abas (`TabButton`, estado `tab`). Substitua por
   scroll único com três blocos:

   a) Seção "Minha Vez" — `SectionHeader` com `border-l-2 border-aetas-gold
      pl-3 mb-3 text-xs uppercase tracking-wider text-aetas-dim` + contagem
      em badge dourado. Cards com miniatura (item 4).
      Estado vazio: parágrafo simples com texto encorajador temático
      ("Nenhuma civilização aguarda sua decisão…"), sem SVG complexo.

   b) Seção "Aguardando adversário" — mesmo SectionHeader mas `opacity-70`.
      Mesmos cards, sem urgência visual.

   c) Finalizadas — apenas link de texto `"Ver N partidas finalizadas →"`
      que alterna (toggle) uma lista simples visível abaixo, no próprio
      scroll. Sem modal separado.

4. CARDS COM MINIATURA DE MAPA
   Atualize o select em `fetchGames` para incluir `seed` e `map_size` de
   `games`. Atualize a interface `GameRow` com esses dois campos opcionais.

   Cada `GameCard` recebe layout de duas colunas:
   — Esquerda (64×52 px): `<MapPreviewMini width={64} height={52} />` gerado
     com `useMemo(() => generateMap(MAP_SIZES[map_size ?? 'medium'], seed, 2),
     [seed, map_size])`. Se `seed` for `null`: div com
     `style={{ background: 'repeating-linear-gradient(45deg, var(--color-aetas-raised) 0px, var(--color-aetas-panel) 4px, var(--color-aetas-raised) 8px)' }}`
     mesma dimensão.
   — Direita: "Turno X / MAX" · "há Nh" · barra de progresso fina
     (`h-0.5 bg-aetas-gold rounded-full`) · botão `[JOGAR →]`.
   Cards de "Minha Vez" com `border-l-2 border-emerald-500/60`; se turno >
   maxTurns × 0.8, adicionar `animate-pulse` na borda esquerda.
   Troque `rounded-xl` por `rounded-lg` em todos os cards — mais austero.

5. FAB "+ Nova Partida"
   Mantido exatamente como está (já navega para NewGameModal do BX1).

Verificação manual: (a) miniatura renderiza para seeds de small/medium/large;
(b) seed null mostra placeholder sem erro de JS; (c) header mostra avatar
com a cor da civ real do perfil após login; (d) seção "Aguardando" some
quando não há partidas aguardando; (e) toggle de finalizadas abre/fecha.
```

**4.5.BX6 — Deploy na Vercel (lançamento web)** · Sonnet
```
Prepare e publique o Aetas na Vercel para lançamento oficial da versão web:
1. Configure o projeto Vercel apontando para apps/web/ do monorepo (a Vercel
   suporta monorepos — configure o "Root Directory" como apps/web/ e o
   comando de build como `pnpm build`).
2. Variáveis de ambiente: adicione no painel da Vercel as variáveis do
   Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) e quaisquer outras
   que o apps/web/ usa. Documente em docs/DEPLOY_WEB.md quais variáveis são
   necessárias e onde buscá-las no painel do Supabase.
3. Configure o domínio no Vercel como "playaetas" (URL:
   playaetas.vercel.app). Se estiver tomado, use "aetas-game".
4. Configure deploy automático: push na branch `main` → deploy de produção
   automático. Push em outras branches → preview deploy (URL única por PR).
5. Documente os passos manuais que EU preciso fazer: criar conta/projeto na
   Vercel, conectar o repositório GitHub, configurar as variáveis de
   ambiente. Liste o que o Claude Code não pode fazer por mim (autenticação,
   clique em "Deploy", cadastro de variáveis sensíveis).
6. Após o deploy, verifique: (a) a URL abre corretamente, (b) o login OAuth
   funciona em produção (pode precisar adicionar a URL de produção nas
   configurações do Google/Apple OAuth — documente isso também), (c) uma
   partida pode ser criada e jogada end-to-end em produção.
```

✅ **Commit:** "ações de cidade + XP backend + mapa procedural + criação de partida + tela inicial + deploy Vercel".

🛑 **CHECKPOINT PRÉ-LANÇAMENTO WEB.**
Antes de compartilhar a URL com alguém:
1. Crie uma partida solo vs IA usando cada opção de tamanho de mapa.
2. Treine uma unidade e construa um edifício do início ao fim (veja o XP
   aparecer no toast e na barra do header).
3. Jogue o desafio diário e confirme que o XP foi creditado.
4. Abra a URL de produção no celular (não localhost) e confirme que o login
   OAuth funciona sem localhost no redirect URI.
Se tudo isso funcionar em produção, o Aetas está pronto para lançamento web.

---

### Bloco FX — Correções pós-validação (engine + UX)

> Bugs identificados após validação manual com partidas reais em produção.
> Execute na ordem FX1 → FX2 → FX3 → FX4. FX1 e FX2 tocam apenas o motor
> (game-engine); FX3 é UI pura; FX4 é a mudança mais profunda e requer Opus.

**4.5.FX1 — Posições de início variadas** · Sonnet
```
Em `packages/game-engine/src/map.ts`, modifique `findStartPositions` para que
as posições de início variem de acordo com o seed da partida:

1. Adicione o parâmetro `rng: () => number` à assinatura de `findStartPositions`
   (função interna — não exportada). `generateMap` já cria o RNG com o seed;
   passe-o como quarto argumento.

2. Antes do loop de placement, embaralhe a ordem dos índices [0..playerCount-1]
   usando Fisher-Yates com o `rng`. Use o índice embaralhado no cálculo de
   `angle = 2π × shuffledIndex[i] / playerCount`.

3. Adicione um jitter angular: some `(rng() - 0.5) * Math.PI / playerCount`
   ao ângulo de cada jogador antes de calcular `candidate`.

4. Adicione teste em `packages/game-engine/src/map.test.ts`:
   `generateMap(5, 'seed-A', 2).startPositions` deve ser diferente de
   `generateMap(5, 'seed-B', 2).startPositions` (posições, não só terreno).
   Confirme também que `generateMap(5, 'seed-A', 2)` é idempotente (mesmo
   resultado em duas chamadas com o mesmo seed).
```

**4.5.FX2 — Fog of War dinâmico** · Sonnet
```
`updateFogOfWar` existe em `packages/game-engine/src/map.ts` mas nunca é chamado.
O fog congela na posição inicial da partida. Corrija em dois arquivos:

1. `packages/game-engine/src/actions.ts`
   - Importe `updateFogOfWar` de `'./map.js'`.
   - No case `moveUnit` (após aplicar a nova posição da unidade ao estado),
     localize o `fogEntry` do `ownerId` da unidade em `newState.fogOfWar`.
     Calcule as unidades e cidades do jogador no `newState` pós-move e chame:
       const updated = updateFogOfWar(fogEntry, playerUnits, playerCities, state.map.radius)
     Substitua o fogEntry no array `fogOfWar` do estado retornado.
   - Use o estado pós-move (posição já atualizada) para calcular as unidades do jogador.

2. `packages/game-engine/src/turn.ts`
   - Importe `updateFogOfWar` de `'./map.js'`.
   - No Step 6 de `endTurn` (após definir `nextId` e resetar unidades do próximo),
     atualize o fog do próximo jogador antes de retornar o estado:
       const nextFogEntry = working.fogOfWar.find(f => f.playerId === nextId)
       if (nextFogEntry) {
         const nextUnits  = units.filter(u => u.ownerId === nextId)
         const nextCities = nextCities.filter(c => c.ownerId === nextId)
         const updatedFog = updateFogOfWar(nextFogEntry, nextUnits, nextCities, state.map.radius)
         working = { ...working, fogOfWar: working.fogOfWar.map(f => f.playerId === nextId ? updatedFog : f) }
       }
   (Cuidado com shadowing da variável `nextCities` — use nome alternativo.)

Adicione teste: após moveUnit para nova posição, o fog do jogador deve incluir
hexes ao redor da nova posição e NÃO remover a posição antiga de exploredHexes.
```

**4.5.FX3 — Mapa maior + scroll no HexMap** · Sonnet
```
1. `packages/game-engine/src/map.ts`
   Atualize MAP_SIZES:
     export const MAP_SIZES = { small: 5, medium: 7, large: 10 } as const
   (small=91, medium=169, large=331 hexes — adequado para 2–8 jogadores)

2. `apps/web/src/components/HexMap.tsx`
   - Encapsule o <svg> em um <div className="w-full h-full overflow-auto">.
   - O SVG já tem width/height calculados por useHexLayout — com radius 10 o
     SVG terá ~900×800px, e o wrapper com overflow-auto permite scroll natural.
   - Adicione controles de zoom opcionais: um useState<number>(1.0) e dois botões
     (+/-) que ajustam entre 0.6 e 1.4, aplicados como style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }} no SVG wrapper.
   - Garanta que o <svg> já renderizado a 100% do viewport seja o estado padrão
     (zoom=1.0), sem regressão visual para mapas small/medium.

3. `apps/web/src/components/MapPreviewMini.tsx`
   Sem mudança funcional — mas verifique que o preview continua renderizando
   corretamente com radius 10 (passado como `radius` prop). O componente usa o
   mesmo cálculo de hexSize, então deve escalar automaticamente.
```

**4.5.FX4 — Bordas de cidade + rebalancear economia** · **Opus** 🔴 🧠
```
Implemente bordas automáticas de cidade (cada cidade reivindica tiles dentro de
raio 2 pelo critério de proximidade) e rebalanceie os custos de construção.
Mudanças em 4 arquivos — planeje antes de codar.

── economy.ts ──
1. Defina bônus de terreno (Resources por TerrainType) ao topo do arquivo:
     Plains   → { gold: 0, food: 2, production: 0 }
     Forest   → { gold: 0, food: 0, production: 2 }
     Hills    → { gold: 1, food: 0, production: 1 }
     Desert   → { gold: 1, food: 0, production: 0 }
     Mountain/Water → { gold: 0, food: 0, production: 0 }

2. Crie `computeCityTerritoryBonus(city, allCities, tiles, radius=2)`:
   - Filtra tiles dentro de hexesInRadius(city.position, radius).
   - Para cada tile, verifica se `city` é a cidade mais próxima entre todas
     as `allCities` (usa hexDistance). Em caso de empate, o tile pertence
     à cidade com menor `id` (ordem estável).
   - Soma os bônus de terreno de todos os tiles reivindicados.
   - Retorna Resources.

3. Modifique `computeCityProduction(city, allCities, tiles)` — adicione
   `allCities` e `tiles` como parâmetros opcionais (default []). Quando
   fornecidos, some `computeCityTerritoryBonus` ao resultado base ANTES de
   `applyBuildingBonuses`. Isso mantém retrocompatibilidade (testes existentes
   que não passam allCities/tiles continuam funcionando com saída só-base).

4. Modifique `processTurnEconomy(cities, existingResources, tiles?)`:
   - Adicione `tiles` como terceiro parâmetro opcional (default []).
   - Passe `cities` e `tiles` para cada chamada de `computeCityProduction`.

── buildings.ts ──
Rebalancear `productionCost` de cada BuildingDefinition:
  Barracks (Military):  15 → 8
  Wall (Military):      20 → 12
  Market (Commercial):  25 → 10
  Port (Commercial):    35 → 15
  Library (Scientific): 25 → 10
  Temple (Scientific):  25 → 10

── orchestration.ts ──
Na chamada de `processTurnEconomy` em `packages/backend-core/src/orchestration.ts`,
passe `loaded.gameState.map.tiles` como terceiro argumento.

── economy.test.ts ──
Adicione testes de território:
  - Cidade isolada próxima a 2 tiles Plains → territoryBonus.food = 4
  - Duas cidades adjacentes: tile no meio vai para a mais próxima; empate → menor id
  - `computeCityProduction` com tiles de Forest produz mais production do que sem tiles
```

✅ **Commit:** "FX: posições variadas + fog dinâmico + mapa maior + bordas de cidade + rebalancear economia".

🛑 **CHECKPOINT FX — valide antes do Bloco C:**
1. Crie 3 partidas com o mesmo playerCount (2) — as posições de início devem
   ser diferentes nas 3 (verificar visualmente no mapa).
2. Mova uma unidade → o fog deve atualizar imediatamente sem precisar encerrar o turno.
3. Crie uma partida Large → mapa deve ocupar mais espaço que o atual e ter scroll.
4. Crie uma partida com cidade perto de tiles Forest. Após 3 turnos (sem gastar
   produção), deve ter produção suficiente para construir um edifício (≥8–10⚙).
Se todos os 4 passarem, o Bloco C pode ser iniciado.

---

### Bloco GX — Jogabilidade mínima viável (gameplay fixes pós-validação)

> **Contexto:** validação em produção revelou que FX1–FX4 foram commitados mas as
> Edge Functions do Supabase **não foram redeployadas** — logo fog, posições de
> início e custos de edifício continuam usando o código antigo no servidor. Além
> disso, partidas criadas com N adversários IA só geram 2 jogadores, e as posições
> de tropa/cidade nunca variam. O mapa é ruído branco (areia ao lado de mar ao
> lado de montanha) e visualmente pouco atraente.
> **Prioridade:** fog + cidade primeiro (loop de turno), depois IA/nº de jogadores,
> depois mapa (lógica → visual).

**4.5.GX1 — Deploy das Edge Functions + nº de jogadores correto** · Sonnet
```
A maioria dos bugs de fog/custo/posição é porque as Edge Functions do Supabase
nunca foram redeployadas após FX1–FX4. Resolva isso primeiro.

1. Deploye TODAS as Edge Functions:
     supabase functions deploy --all
   (ativa no servidor: FX1 posições por seed, FX2 fog dinâmico, FX3 MAP_SIZES,
   FX4 custos de edifício e bordas de cidade)

2. BUG "vejo só eu + 1 adversário + posições sempre iguais":
   - Em `apps/web/src/pages/NewGamePage.tsx`, localize onde o número de
     adversários é convertido em `playerCount` no payload de create-game.
     Confirme: "2 adversários IA" deve enviar playerCount=3 (você + 2).
   - Em `supabase/functions/create-game/index.ts`, confirme que `playerCount`
     vem do body e é usado TANTO em `generateMap(radius, seed, playerCount)`
     QUANTO no loop que cria a lista `players`. Se algo estiver fixo em 2,
     corrija.
   - Posições iguais: como FX1 só roda no servidor após o deploy do passo 1,
     valide que após o deploy seeds diferentes geram startPositions diferentes.
     Se ainda repetir, verifique se o `seed` enviado pela NewGamePage não está
     fixo/constante.

3. Oponentes IA não jogam: confirme se existe um cron job chamando
   `sweepTimeouts` (ver `supabase/functions/`). Se não existir agendamento,
   documente o passo manual de criar o schedule no painel do Supabase
   (pg_cron ou Scheduled Functions), pois sem ele os turnos de IA nunca avançam.

Teste: criar partida com 3 adversários IA → header mostra 4 jogadores.
Teste: 2 partidas com seeds diferentes → posições de tropa/cidade variam.
```
✅ **Commit:** "fix: deploy FX1-FX4 nas Edge Functions + playerCount correto".

**4.5.GX2 — Validar e corrigir fog + ações de cidade pós-deploy** · Sonnet
```
Após GX1, valide cada comportamento e corrija o que ainda falhar:

a) FOG ao mover: mova uma unidade para longe → o fog deve revelar hexes ao
   redor da nova posição E manter os anteriores em exploredHexes. Se não,
   verifique se `fogOfWar` é realmente persistido em `applyTurn`
   (orchestration.ts → repository → coluna do banco). É possível que o
   campo fogOfWar não esteja na projeção salva/lida do gameState.

b) COLONO/fundação: confirme que `foundCity` funciona ponta-a-ponta
   (selecionar Colono → "Fundar Cidade" → cidade aparece). Trace o handler
   em GameView.tsx se falhar.

c) CONSTRUÇÃO: cidade Commercial com produção acumulada ≥ 10 → abrir
   CityModal → construir Mercado. Se der "insufficient production", logue
   produção atual vs. custo para diagnóstico.

d) TREINO: cidade com produção ≥ custo da unidade → treinar. Confirme que
   o `unitId` gerado é único (uuid).
```
✅ **Commit:** "fix: fog e ações de cidade validados/corrigidos pós-deploy".

**4.5.GX3 — Mapa com biomas coerentes (noise por seed)** · **Opus** 🔴 🧠
```
Substitua a geração aleatória tile-a-tile de `pickTerrain` em
`packages/game-engine/src/map.ts` por geração com coerência espacial.
PLANEJE antes de codar.

REQUISITOS:
- Água concentrada nas bordas do mapa (anel externo), não no centro.
- Montanhas em grupos compactos, nunca isoladas.
- Planícies dominantes no interior, com transições suaves.
- Florestas próximas a planícies; não ladear água diretamente.
- Colinas fazem a transição entre Plains e Mountain.
- Determinismo TOTAL por seed: mesmo seed → mesmo mapa. NÃO usar Math.random;
  usar o mulberry32/createRng já existente em map.ts.
- NÃO adicionar bibliotecas externas — implementar o noise com o RNG atual.

ABORDAGEM SUGERIDA (dois passes de valor por hex):
  1. Elevation: distância normalizada ao centro + ruído suave → define Water
     (baixo/borda) e Mountain (alto, agrupado).
  2. Moisture: segundo campo de ruído → Forest (úmido) vs Plains/Hills (seco).
  Combine elevation×moisture numa tabela de decisão de 5 terrenos.

Testes em map.test.ts:
  - 'água concentrada nas bordas' (proporção de Water no anel externo >> centro)
  - 'sem Mountain isolada' (todo hex Mountain tem ≥1 vizinho Mountain ou Hills)
  - manter os testes existentes de determinismo por seed verdes.
```
✅ **Commit:** "feat: geração de mapa com biomas coerentes baseados em seed".

**4.5.GX4 — Visual do mapa (gradientes, cores, ícones)** · Sonnet
```
Melhore a estética dos hexes em `apps/web/src/components/HexMap.tsx` e
`apps/web/src/assets/terrain-patterns.tsx`.

1. Gradiente sutil por terreno (radialGradient nos <defs>, claro no centro →
   escuro nas bordas do hex).
2. Cores base mais ricas:
   Plains   → verde quente (#7a9e4e)
   Forest   → verde escuro azulado (#1e4d2b)
   Hills    → marrom arenoso (#8b6f47)
   Mountain → cinza azulado + topo claro/neve (#6b7d8f)
   Water    → azul mantendo a animação de onda existente
3. Micro-ícone SVG por terreno (árvore p/ Forest, pico p/ Mountain),
   camada leve e centralizada, no mesmo sistema de TerrainPatterns.
4. Replicar a paleta nova em MapPreviewMini.tsx.
5. Manter o contraste de fog (explored+dim vs. visível) claro.
```
✅ **Commit:** "feat: visual do mapa — gradientes, cores e ícones de terreno".

🛑 **CHECKPOINT GX — valide antes do Bloco C:**
1. Partida com 3 IAs → 4 jogadores no header; após timeout, a IA avança o turno.
2. Mover tropa → fog abre os hexes ao redor da nova posição.
3. Cidade com produção ≥ 10 → construir Mercado com sucesso.
4. Treinar uma unidade a partir de uma cidade Military.
5. Gerar 3 mapas → terrenos geograficamente coerentes (água nas bordas,
   montanhas agrupadas), sem xadrez de areia+floresta+montanha.
6. Mapa visualmente mais atraente que o atual.

---

### Bloco HX — HUD de recursos + fronteiras de território + responsividade

> **Contexto:** três melhorias de jogabilidade identificadas pós-validação GX.
> Execute HX1 → HX2 → HX3. Nenhum deles toca o engine ou o backend — são
> mudanças de UI + API layer na web. Bloco C só começa após o CHECKPOINT HX.

**4.5.HX1 — Resource HUD com income por turno** · Sonnet
```
Adicione uma faixa de recursos permanente em `apps/web/src/pages/GameView.tsx`,
inserida entre o header e o PlayerBar (entre as linhas que renderizam o
`<header>` e o `<PlayerBar>`).

1. FAIXA DE RECURSOS
   Crie um componente inline `ResourceBar` (ou um novo arquivo
   `apps/web/src/components/ResourceBar.tsx`) que recebe:
     - `resources: Resources` — totais acumulados do jogador
     - `income: Resources` — ganho por turno

   Layout: `flex items-center justify-center gap-4 px-3 py-1.5
   bg-aetas-raised border-b border-aetas-border text-xs`.
   Cada recurso: ícone + total em `text-aetas-text font-medium` +
   income em `text-emerald-400` entre parênteses.
   Ícones sugeridos: 🏅 ouro · 🌾 comida · ⚙ produção.
   Exemplo de item: `🏅 <span>24</span> <span class="text-emerald-400">(+3)</span>`

2. CALCULAR O INCOME POR TURNO NO CLIENTE
   Em `GameView.tsx`, importe `computeCityProduction` de `@aetas/game-engine`.
   Derive `income` com `useMemo`:
   ```ts
   const myIncome = useMemo((): Resources => {
     if (!gameState) return { gold: 0, food: 0, production: 0 }
     const myCities = gameState.cities.filter(c => c.ownerId === enginePlayerId)
     return myCities.reduce(
       (acc, city) => {
         const p = computeCityProduction(city, gameState.cities, gameState.map.tiles)
         return { gold: acc.gold + p.gold, food: acc.food + p.food, production: acc.production + p.production }
       },
       { gold: 0, food: 0, production: 0 },
     )
   }, [gameState, enginePlayerId])
   ```

3. PLAYER RESOURCES
   `const myPlayer = gameState.players.find(p => p.id === enginePlayerId)`
   Passe `myPlayer?.resources ?? { gold:0, food:0, production:0 }` como
   `resources` e `myIncome` como `income` para o `ResourceBar`.

4. NÃO quebre o layout existente: a faixa deve ser `flex-shrink-0` para não
   comprimir o mapa. Em mobile (tela ≤ 375px) pode esconder o label de texto e
   mostrar só ícone + número.
```
✅ **Commit:** "feat: HUD de recursos com income por turno".

**4.5.HX2 — Fronteiras de território no mapa** · Sonnet 🧠
```
Renderize os territórios das civilizações como overlays translúcidos coloridos
no mapa hex em `apps/web/src/components/HexMap.tsx`. PLANEJE antes de codar.

LÓGICA DE TERRITÓRIO (client-side, sem importar economy.ts):
Para cada tile visível, verificar se ele está dentro do raio 2 de alguma cidade
e, se sim, pertence à cidade mais próxima. Em caso de empate de distância,
a cidade com menor `id` (ordem lexicográfica) leva. Implementar como:

```ts
// Derive uma vez por render a partir de gameState
const territoryMap = useMemo(() => {
  const map = new Map<string, string>()  // hexKey → ownerId da cidade
  for (const tile of gameState.map.tiles) {
    const key = hexKey(tile.coord)
    let best: { dist: number; cityId: string; ownerId: string } | null = null
    for (const city of gameState.cities) {
      const d = hexDistance(tile.coord, city.position)
      if (d > 2) continue
      if (!best || d < best.dist || (d === best.dist && city.id < best.cityId)) {
        best = { dist: d, cityId: city.id, ownerId: city.ownerId }
      }
    }
    if (best) map.set(key, best.ownerId)
  }
  return map
}, [gameState.cities, gameState.map.tiles])
```

RENDERIZAÇÃO:
No loop de tiles do SVG, após a polygon principal e antes dos overlays de
seleção/ataque/movimento, adicione:
```tsx
{/* Territory overlay — only on currently visible tiles */}
{isVisible && (() => {
  const ownerId = territoryMap.get(key)
  if (!ownerId) return null
  const color = playerColorMap.get(ownerId) ?? '#888'
  return (
    <polygon
      points={points}
      fill={color}
      fillOpacity={0.18}
      stroke={color}
      strokeWidth={0.4}
      strokeOpacity={0.35}
      pointerEvents="none"
    />
  )
})()}
```

OBSERVAÇÕES:
- `playerColorMap` já existe em HexMap (cor da civilização por playerId).
- `hexDistance` e `hexKey` já são importados.
- O `useMemo` deve depender de `gameState.cities` e `gameState.map.tiles` —
  não do objeto `gameState` inteiro (evita re-render desnecessário).
- O overlay deve ficar ABAIXO dos overlays de seleção/ataque/movimento (que
  ficam acima dele na ordem de renderização SVG).
- Tiles `!isVisible` (fog) NÃO recebem overlay — terreno em névoa não revela
  quem controla o território.
```
✅ **Commit:** "feat: fronteiras de território visíveis no mapa".

**4.5.HX3 — Eliminar roundtrip extra após ações** · Sonnet
```
Cada ação em `apps/web/src/pages/GameView.tsx` faz `submitAction` (que já
retorna o GameState atualizado na resposta) e depois chama `fetchGame()`
desnecessariamente — duplicando o delay. Corrija usando o estado retornado.

1. VERIFICAR O TIPO DE submitAction
   Em `apps/web/src/api.ts`, `submitAction` retorna `ApiResult<T>`. Verifique
   se `T` inclui `state: GameState`. Se não incluir, adicione:
   ```ts
   export const submitAction = (gameId: string, action: GameAction) =>
     post<{ state: GameState }>(PATH, { gameId, action })
   ```
   Importe `GameState` de `@aetas/game-engine` no api.ts se necessário.

2. HELPER DE ATUALIZAÇÃO DE ESTADO
   Em `GameView.tsx`, crie um helper que prioriza o estado retornado pela
   Edge Function e só faz fetchGame como fallback:
   ```ts
   const applyOrFetch = useCallback((state?: GameState | null) => {
     if (state) setGameState(state)
     else void fetchGame()
   }, [fetchGame])
   ```

3. SUBSTITUIR AS CHAMADAS
   Para cada handler que faz `void fetchGame()` após `res.ok`:
   ```ts
   // Antes:
   if (res.ok) void fetchGame()
   // Depois:
   if (res.ok) applyOrFetch(res.data?.state)
   ```
   Handlers afetados: handleMoveUnit, handleConstructBuilding, handleTrainUnit,
   handleProposePact, handleBreakPact, handleProposePeace, handleAttackCity,
   handleRespondDiplomacy, handleFoundCity (após setFoundingUnitId/setSelectedUnitId),
   handleEndTurn (além do fetchGame existente).

4. MANTER fetchGame() NOS SEGUINTES CASOS:
   - Handlers de Realtime (.on 'turn_changed', 'dispute_resolved', 'game_over')
   - `handleResolveDispute` (que usa `res.data.state` diretamente mas faz
     fetchGame em caso de erro — manter esse fallback)
   - O botão manual ↺ de refresh
   - `useEffect` de carregamento inicial

5. VERIFICAR pós-mudança: se uma ação de IA é disparada logo após endTurn
   (sweepTimeouts roda dentro do submit-action), o state retornado pode já
   incluir o turno da IA. Teste: jogue contra IA, termine seu turno — o HUD
   e mapa devem atualizar sem precisar pressionar ↺.
```
✅ **Commit:** "perf: eliminar fetchGame redundante — usar estado retornado pela Edge Function".

🛑 **CHECKPOINT HX — valide antes do Bloco C:**
1. HUD de recursos aparece permanentemente entre o header e o PlayerBar.
2. O income por turno (`+N`) bate com o que você acumula após terminar o turno.
3. Ao explorar novos tiles, o overlay de território aparece na cor certa da civilização dona.
4. Fronteiras NÃO aparecem em tiles com fog.
5. Mover uma unidade → o mapa atualiza sem delay visível (sem o "piscar" do fetchGame extra).

---

### Bloco C — Idioma e polimento final

**4.5.C1 — Internacionalização EN/PT (i18n)** · Sonnet 🧠
```
Implemente i18n na web com EN como idioma padrão e PT como segunda opção:
1. Escolha e configure uma biblioteca de i18n leve (ex: i18next com
   react-i18next, ou uma solução manual com contexto React se o bundle
   size importar).
2. Extraia TODAS as strings visíveis ao usuário da web para arquivos de
   tradução: apps/web/src/locales/en.json e apps/web/src/locales/pt.json.
   Isso inclui: textos de UI, mensagens do log narrativo, nomes de eras,
   nomes de especializações, mensagens de erro, textos de onboarding.
3. Implemente o seletor de idioma: um dropdown "EN | PT" no header (visível
   em todas as telas) e na página de Perfil/Settings. A preferência é salva
   no localStorage e sobrepõe a detecção automática do browser.
4. EN é o padrão: se nenhuma preferência estiver salva, use EN.
5. Garanta que trocar o idioma não recarrega a página (troca instantânea
   via contexto React).
```

**4.5.C2 — Onboarding e tutorial inline** · Sonnet
```
Adicione um tutorial interativo para novos jogadores (first-time experience):
1. Na primeira partida de um jogador novo (detectado por ausência de
   histórico no perfil), exiba tooltips sequenciais que guiam pelo jogo:
   "Este é seu Warrior — clique nele", "Estes hexes iluminados são para onde
   ele pode se mover", "Clique aqui para terminar seu turno", etc.
2. O tutorial cobre: selecionar unidade, mover, atacar, abrir modal de
   cidade, terminar turno. NÃO cobre tudo — só o suficiente para o jogador
   entender o loop básico.
3. Botão "Pular Tutorial" sempre visível. Tutorial pode ser reativado em
   Settings/Perfil.
4. Tooltips em EN por padrão, PT se o idioma foi trocado.
```

**4.5.C3 — Polimento mobile-first da web** · Sonnet
```
Audite e corrija a experiência mobile da web (que será usada até o app
nativo ficar pronto):
1. O mapa hex deve ter zoom/pan por pinch e drag no touch — verifique que
   os eventos de toque não conflitam com seleção de unidade.
2. O painel lateral deve colapsar em tela pequena (toggle por botão ou
   swipe) para não cobrir o mapa.
3. Todos os botões e hexes clicáveis devem ter área mínima de toque de 44px.
4. Modal de cidade deve ser rolável em tela pequena sem vazar pra fora da
   viewport.
5. O seletor EN/PT deve ser acessível em mobile sem precisar de hover.
Rode nos DevTools do Chrome no modo mobile (iPhone SE e Pixel 5) e corrija
qualquer coisa que quebre ou seja difícil de tocar.
```

✅ **Commit:** "i18n EN/PT + onboarding + polimento mobile".

🛑 **CHECKPOINT FINAL DA WEB — não pule.**
Jogue uma partida completa usando SOMENTE o celular (modo mobile no
browser). Se o jogo for jogável do início ao fim no mobile sem frustração,
a web está pronta para lançar e você pode seguir para a Fase 5 (Android).
Se travar em qualquer ponto no mobile, corrija antes de partir para os apps
— a base mobile da web vai ser usada por usuários reais enquanto os apps
não chegam.

---

### Bloco D — IA, Nomes e Polimento Visual

**4.5.D1 — IA: movement + loop de consecutivas** · **Opus** 🔴 🧠
```
Dois fixes no engine + backend. Faça planejamento antes de codar.

1. MOVEMENT DA IA — packages/game-engine/src/ai.ts, função decideOpponentTurn:
   Atualmente a IA só ataca adjacentes e passa a vez. Adicione lógica de movement
   ANTES da fase de ataque:
   - Para cada unidade minha com !hasMoved:
     a) Identifique o alvo mais próximo visível: unidade inimiga OU cidade inimiga
        (use o fogOfWar do player para filtrar — a IA só vê o que está visible).
     b) Calcule qual dos hexes adjacentes à unidade está mais perto do alvo
        (hexDistance menor), que não seja water, que não esteja ocupado por outra unidade.
     c) Se encontrou hex válido, emita { type: 'moveUnit', unitId, targetCoord }.
        Valide com validateAction antes de emitir. Aplique no estado de trabalho.
   - Depois do movimento, re-execute a fase de ataque (pode haver adjacentes novos).
   - Se não há nenhum inimigo visível, mova em direção ao centro do mapa (tile mais
     próximo do centro geométrico).
   - Preserve a invariante: no máximo 1 ataque por unidade (hasAttacked).
   - Atualize ai.test.ts: adicione pelo menos 2 testes para movement (move toward
     enemy, move toward center when blind).
   - Rode `pnpm -w run build` e confirme que o backend-core.js foi regenerado.

2. LOOP DE IAs CONSECUTIVAS — supabase/functions/submit-action/index.ts:
   O bloco atual só processa 1 IA por vez. Reescreva para:
   - Após o sweep inicial da primeira IA, re-fetch o game_state do banco.
   - Se o novo currentPlayerId ainda for isAIControlled, faça outro sweepTimeouts.
   - Repita até não-IA ou isFinished, com limite de 10 iterações para segurança.
   Faça `supabase functions deploy submit-action` ao final.
```

✅ **Commit:** `"fix(ai): movement logic + consecutive AI loop in submit-action"`

🛑 **CHECKPOINT D1:** Jogar o Desafio Diário. Após End Turn, o log deve mostrar a IA movendo uma unidade E o turno voltando imediatamente (sem esperar cron). Em jogo com 3 AIs, todas devem jogar sem pausa.

---

**4.5.D2 — Nomes reais dos jogadores** · Sonnet
```
Os nomes dos jogadores aparecem como IDs ('c98675...') porque create-game e
create-daily-game não buscam display_name antes de salvar o game_state.
A tabela user_profiles tem display_name vindo do OAuth (migration 20260621000001).

1. supabase/functions/create-daily-game/index.ts:
   - Antes de montar o gameState, busque o display_name do usuário:
     const { data: upRow } = await svc.from('user_profiles').select('display_name')
       .eq('id', userId).maybeSingle()
     const displayName = upRow?.display_name ?? 'Player'
   - Use displayName em players[0].displayName (remova o hardcoded 'You').

2. supabase/functions/create-game/index.ts:
   - Idem: ao criar o game_state com os jogadores, busque display_name de cada
     human slot (user_id não-nulo) e salve em players[].displayName.
   - Jogadores AI: displayName = civName + ' (AI)'.

3. supabase/functions/join-game/index.ts (se existir — verifique):
   - Quando um usuário entra na partida, atualize game_state.players[].displayName
     para o jogador que acabou de entrar.

4. apps/web/src/components/PlayerBar.tsx:
   - Use player.displayName ?? civ?.name ?? player.id.slice(0, 6) na exibição.

5. apps/web/src/pages/GameView.tsx — header do jogo:
   - Substituir gameId.slice(0, 8) por lista dos nomes dos oponentes,
     ex: "vs Ana · Gregos (AI)", truncada a ~28 chars com '…'.

6. Faça deploy: supabase functions deploy create-daily-game create-game
   (e join-game se foi alterado).
```

✅ **Commit:** `"feat(web+backend): player display names from OAuth profile"`

---

**4.5.D3 — Cards da GameListPage com identidade** · Sonnet
```
Os cards na GameListPage mostram apenas gameId.slice(0,8) como título.
Após o D2, game_state.players[].displayName terá nomes reais. Use-os.

1. apps/web/src/pages/GameListPage.tsx — fetchGames:
   - Adicione game_state ao select:
     .select('game_id, engine_player_id, games(turn_number, current_player_id,
     is_finished, winner_id, max_turns, updated_at, seed, map_size, game_state)')
   - Atualize a interface GameRow para incluir game_state: { players: ... } | null.

2. GameCard sub-componente:
   - Receba players: { id, displayName, civilizationId, isAIControlled }[] do game_state.
   - Título do card: filtrar self (engine_player_id) e mostrar "vs [nomes]",
     ex: "vs Léo · Gregos (AI)". Se displayName for UUID, fallback para civ name.
   - Civs repetidas entre jogadores: adicionar índice ("Egípcios 1", "Egípcios 2")
     detectado comparando civilizationIds duplicados na lista de players.
   - Minimap preview continua como thumbnail à esquerda (não remover MapPreviewMini).

3. Sem migration necessária — game_state já está no banco.
   Nota de performance: lista raramente terá >20 jogos, carregar game_state é OK.
```

✅ **Commit:** `"feat(web): game cards show opponent names + handle duplicate civs"`

---

**4.5.D4 — Polimento visual completo** · Sonnet 🧠
```
Embeleze todos os componentes visíveis antes de ir para o app nativo.
Planeje quais arquivos tocar antes de codar.

1. PLAYERBAR (apps/web/src/components/PlayerBar.tsx):
   - Substituir "1u 1c" por ícones menores: ⚔{uCount} 🏛{cCount} (sem texto "u"/"c").
   - Flag da civ maior e mais proeminente.
   - Civs repetidas: adicionar número subscrito na flag ("🏛¹" vs "🏛²").
   - Player ativo: highlight com border-left colorida na cor da civ, mais visível
     que o ponto piscando atual.
   - Era badge: se já está no header do GameView, remover do PlayerBar para
     ganhar espaço.

2. FRONTEIRAS DO MAPA (apps/web/src/components/HexMap.tsx):
   - Para cada hex com dono visível, itere os 6 vizinhos. Se o vizinho tem
     dono diferente E também é visível: desenhe uma linha na borda compartilhada.
   - A borda compartilhada é definida pelos 2 vértices comuns: calcule via
     hexPolygonPoints(cx, cy, hexSize). Cada hex tem vértices i e (i+1)%6;
     o vizinho na direção d compartilha os vértices d e (d+1)%6.
   - Estilo: strokeWidth=2, cor da civ donante, opacity=0.75, strokeLinecap="round".
   - Mantenha o overlay de território atual (fillOpacity 0.18) — as linhas são adicionais.

3. HEADER DO GAMEVIEW (apps/web/src/pages/GameView.tsx):
   - Após D2: remover o gameId.slice(0,8) — substituído pelos nomes de D2.
   - Layout mais limpo: "← | Turn N/Max | [Era icon] Era | ● SUA VEZ / nome".
   - Botões ⚖️ e ↺: adicionar label de texto visível em sm+ ("Diplomacy", "Refresh").
   - Fundo do header: gradient sutil por era (Ancient = warm terra, Classical = steel
     blue, Medieval = stone gray) em 4–5% opacity, sem impactar legibilidade.

4. RESOURCEBAR (apps/web/src/components/ResourceBar.tsx):
   - Ler o arquivo e avaliar. Ícones maiores, income +N em verde/vermelho mais
     visível, layout mais arejado. Sem remover informação, só melhorar hierarquia.

5. CARDS DA GAMELIST (apps/web/src/pages/GameListPage.tsx):
   - Complemento do D3: color strip lateral na cor da civ do jogador no card,
     progress bar do turno mais visível, timestamp mais legível.
   - Badge "MY TURN": estilo gold pill mais chamativo.

Critério de aceite: abrir o jogo e ter a impressão de produto acabado, não
protótipo. Cada elemento com propósito e hierarquia visual clara.
```

✅ **Commit:** `"feat(web): visual polish — PlayerBar, borders, GameView header, ResourceBar, GameList cards"`

🛑 **CHECKPOINT PRÉ-APP (substitui o CHECKPOINT FINAL anterior):**
Abra o jogo no mobile (DevTools, iPhone SE). Jogue uma partida completa do início ao fim:
1. PlayerBar exibe nomes reais, civs diferenciadas visualmente.
2. Header do jogo mostra "vs [nome]", não um UUID.
3. Fronteiras do território estão nítidas no mapa.
4. IA move suas unidades após End Turn e o turno volta imediatamente.
5. Cards da lista identificam claramente o adversário.
Se tudo isso estiver OK, a web está pronta e você pode partir para o Android.

---

## BLOCO E — Motor, IA completa e economia

---

**4.5.E1 — Diplomacia completa na IA oponente** · Sonnet

```
Bug confirmado: `decideOpponentTurn` em packages/game-engine/src/ai.ts nunca chama
`planDiplomaticResponses` nem `planDiplomaticInitiatives` — por isso propostas de
pacto ficam eternamente pendentes. As duas funções já existem e são usadas pelo
`decideSubstituteTurn`; basta incorporá-las ao oponente.

1. Em `decideOpponentTurn` (ai.ts ~linha 286), ajuste a ordem das fases para:
   defensive → diplomacyResponses → movement → attackLoop → diplomacyInitiatives → endTurn

   Troque:
     const defensive = planDefensiveResponses(state, playerId, now)
     const movement  = planMovement(defensive.state, playerId, now)
     let s = movement.state
     const actions = [...defensive.actions, ...movement.actions]
     // ... combat loop ...
     return [...actions, END_TURN]

   Por:
     const defensive  = planDefensiveResponses(state, playerId, now)
     const diplomatic = planDiplomaticResponses(defensive.state, playerId, now)
     const movement   = planMovement(diplomatic.state, playerId, now)
     let s = movement.state
     const actions = [...defensive.actions, ...diplomatic.actions, ...movement.actions]
     // ... combat loop (sobre s) ...
     const initiatives = planDiplomaticInitiatives(s, playerId, now)
     return [...actions, ...initiatives.actions, END_TURN]

2. Adicione ao ai.test.ts um teste que verifica a resposta diplomática:
   - Crie um game_state onde player p1 tem uma `diplomaticProposal` pendente de p0 para
     p1 (proposePact). Chame `decideOpponentTurn(state, p1.id, now)`.
   - Espera: o array de ações contém `{ type: 'respondToDiplomacy', accept: true }`.
   - Verifique que o teste falha ANTES da mudança e passa DEPOIS (TDD leve).

3. Rode `pnpm --filter @aetas/game-engine test` — toda a suíte deve passar.
   Não é necessário rebuild do backend-core nem deploy — o ai.ts é já bundlado.
   MAS: após os testes, rode `pnpm --filter @aetas/backend-core bundle` e deploy
   `supabase functions deploy submit-action` para que a mudança vá a produção.
```

✅ **Commit:** `"fix(ai): opponent AI now responds to and initiates diplomacy"`

---

**4.5.E2 — IA treina unidades, constrói edifícios e ataca cidades** · **Opus** 🔴 🧠

```
A IA oponente nunca usa trainUnit, constructBuilding nem attackCity. Adicione três
novas fases a `decideOpponentTurn` em packages/game-engine/src/ai.ts.
Planeje antes de codar: leia BUILDING_CATALOG e UNIT_CATALOG para conhecer
custos e pré-requisitos.

REGRAS DE OURO (não quebre nenhuma):
- Toda ação emitida deve passar validateAction antes de ser acumulada.
- A função permanece pura e determinística (sem RNG, sem Date.now, ordem por id).
- Não mute o estado de entrada — use o padrão fold (working state s).

FASE: planUnitTraining(s, playerId, now)
  Objetivo: treinar um warrior por turno se o recurso de produção for suficiente
  E a IA tiver menos unidades vivas do que um teto (ex.: metade do maxTurns, mínimo 3).
  - Itere as cidades da IA ordenadas por id.
  - Para cada cidade, tente { type: 'trainUnit', cityId, unitType: 'warrior', unitId: gerado via hexKey+now+cityId }.
    ⚠ unitId deve ser único e determinístico; use `\`u-\${cityId.slice(0,4)}-\${s.turnNumber}\`` ou similar.
  - validateAction → applyAction → acumule. Pare após treinar 1 unidade por turno
    (não treine em todas as cidades de uma vez — evita snowball).
  - Não treine settlers (fora de escopo desta fase).

FASE: planBuildingConstruction(s, playerId, now)
  Objetivo: construir o edifício de menor custo disponível que ainda não existe na cidade.
  - Leia BUILDING_CATALOG para saber BuildingType, productionCost e requiredEra.
  - Prioridade simples: o edifício disponível (era <= gameState.era) de menor custo
    que a cidade ainda não possui (city.buildings ?? []).
  - Itere cidades por id; tente { type: 'constructBuilding', cityId, buildingType } →
    validateAction → applyAction. Construa no máximo 1 edifício por cidade por turno.

FASE: planCityAttack(s, playerId, now)
  Objetivo: atacar cidades inimigas adjacentes quando vantajoso.
  - Para cada unidade minha não eliminada (por id), verifique cidades inimigas a
    distance=1. Se city.hp <= city.maxHp * 0.4 OU a IA tiver >= 2 unidades adjacentes,
    emita { type: 'attackCity', unitId, cityId } → validateAction → applyAction.
  - Isso acontece DEPOIS do combate de unidades no loop atual.

ORDEM FINAL das fases em decideOpponentTurn:
  defensive → diplomaticResponses → movement → combatLoop → cityAttack → unitTraining
  → buildingConstruction → diplomaticInitiatives → endTurn

TESTES:
  - planUnitTraining: estado com produção suficiente → espera trainUnit no array.
  - planBuildingConstruction: cidade sem edifícios, produção suficiente → espera
    constructBuilding com o edifício de menor custo.
  - planCityAttack: unidade minha adjacente a cidade inimiga com HP baixo → espera
    attackCity.
  - Rode pnpm --filter @aetas/game-engine test — toda a suíte verde.

Ao final: pnpm --filter @aetas/backend-core bundle &&
          supabase functions deploy submit-action
```

✅ **Commit:** `"feat(ai): opponent AI trains units, builds and attacks cities"`

🛑 **CHECKPOINT E2:** Inicie um jogo solo vs 1 IA. Após 3–5 End Turns:
- A IA deve ter treinado pelo menos 1 warrior adicional (PlayerBar mostrará ⚔2+).
- Se a IA capturar uma cidade sua, a conquista deve aparecer no log.
- Nenhum erro 500 nos Edge Functions.

---

**4.5.E3 — Manutenção de unidades em ouro + rebalanceio de economia** · **Opus** 🔴 🧠

```
Problema: ouro e alimento têm pouco valor; só produção importa. A causa raiz é que
ouro não tem sink (unit maintenance está comentado em economy.ts mas nunca implementado)
e o income de produção é baixo demais para uma partida de 10–20 turnos.

Planeje antes de codar. Leia:
  - packages/game-engine/src/economy.ts (processTurnEconomy, applyGrowth, BASE_*)
  - packages/game-engine/src/types.ts (Unit, Player)
  - packages/game-engine/src/actions.ts (trainUnit cost, endTurn)
  - supabase/functions/create-daily-game/index.ts e create-game/index.ts (recursos iniciais)

MUDANÇA 1 — Manutenção de unidades (ouro):
  Em economy.ts, adicione uma constante e função:
    export const UNIT_MAINTENANCE_GOLD = 1  // gold por unidade viva por turno

  Em processTurnEconomy (ou onde o endTurn compute o income), após somar o income
  de cidades, subtraia: player.resources.gold -= unitCount * UNIT_MAINTENANCE_GOLD
  onde unitCount = unidades vivas pertencentes ao jogador.

  Consequência de ouro negativo (escolha simples e sem punição excessiva):
  Se gold ficar < 0 após a dedução, cada unidade recebe -1 de defesa neste turno
  (aplique via um flag temporário `isUnderMaintenance?: boolean` no Unit, limpo no
  início do próximo turno). Não dissolva unidades — é punitivo demais para v1.

MUDANÇA 2 — Rebalanceio de custos e income base:
  Objetivo: o jogador deve conseguir treinar seu primeiro warrior adicional em ~3–4 turnos.
  Com recursos iniciais = 10 production e income ~1–2/turno, um warrior a 20 leva 10+ turnos.
  Ajuste conservador recomendado (confirme com testes antes de aceitar):
    - Warrior productionCost: 20 → 10  (em UNIT_CATALOG, packages/game-engine/src/units.ts)
    - BASE_PRODUCTION_PER_POP: 1 → 1.5 (arredonda: pop=1 commercial = 1, military = 2)
    - BASE_GOLD_PER_POP: 1 → 1.5 (para cobrir maintenance de 2 warriors = 2 gold/turno)
  Se UNIT_CATALOG ou os valores estiverem em local diferente, ajuste lá.

MUDANÇA 3 — UI: ResourceBar mostra manutenção:
  Em apps/web/src/components/ResourceBar.tsx, adicione uma quarta linha "manutenção"
  se unitCount > 0:
    🗡 { unitCount } unidades · -{unitCount * UNIT_MAINTENANCE_GOLD}g/turno
  O componente precisa receber unitCount como prop; passe-o de GameView.tsx
  onde myPlayer já está disponível.
  Exiba com cor vermelha se gold < unitCount * UNIT_MAINTENANCE_GOLD (stress indicator).

MUDANÇA 4 — Testes:
  - economy.test.ts (ou ai.test.ts): endTurn com 2 unidades deve deduzir 2 gold.
  - Unidade com ouro negativo deve ter isUnderMaintenance = true.
  - processTurnEconomy: o income de produção com pop=1 deve ser >= 1 (não 0.75 arredondado).

Rode pnpm --filter @aetas/game-engine test — toda a suíte verde.
Não é necessário deploy de Edge Functions (economy é client-side no engine).
Rebuild: pnpm --filter @aetas/backend-core bundle && supabase functions deploy submit-action
```

✅ **Commit:** `"feat(engine): unit gold maintenance + economy rebalance (warrior cost 20→10, income +50%)"`

🛑 **CHECKPOINT E3:** Jogue 5 turnos numa partida solo:
- ResourceBar deve mostrar linha de manutenção com custo em ouro.
- Seu ouro deve cair conforme você tem mais unidades.
- Você deve conseguir treinar o segundo warrior antes do turno 5.
- Alimento deve crescer a população visivelmente (city.population sobe após ~8 turnos).
- IA deve se comportar de forma ameaçadora: treinar, construir, atacar.

---

**4.5.E4 — Compartilhamento melhorado no fim de partida** · Sonnet

```
Melhore o buildShareText e o handleShare em
apps/web/src/components/GameOverScreen.tsx.

TEXTO GERADO (buildShareText):
  Linha 1: título com turno — ex: "🏛 Aetas · Turno 12/20"
  Linha 2+: placar por jogador ordenado por rank, usando a flag da civ +
  emoji de medalha + nome + pontos — ex:
    "🏆 🇮🇹 Mongóis 57pts"
    "🥈 ⚡ Gregos 0pts"
  Última linha: "playaetas.vercel.app"

Detalhes:
  - civFlag() já existe no arquivo e retorna a flag da civ — use-a.
  - gameState.turnNumber / gameState.maxTurns já existem no GameState.
  - Não inclua breakdown Terr./Pop./Dev. — o texto ficaria longo demais
    para WhatsApp/Telegram; guarde isso para "View History" futuro.

SHARE HANDLER (handleShare):
  Tente navigator.share({ text }) primeiro (funciona em mobile Chrome/Safari
  e abre a sheet nativa). Se navigator.share não existir ou lançar erro
  (desktop), faça fallback para navigator.clipboard.writeText(text).
  Após clipboard copy bem-sucedido, mostre feedback visual: troque o texto
  do botão para "✓ Copiado!" por 2 segundos (useState + setTimeout).

I18N:
  - en.json: gameover.share → "Share 📋", gameover.copied → "✓ Copied!"
  - pt.json: gameover.share → "Compartilhar 📋", gameover.copied → "✓ Copiado!"
  (não altere outras chaves de gameover)

Não precisa de testes unitários — a função é pura e trivial de inspecionar
manualmente. Confirme visualmente que o texto gerado está bem formatado.
```

✅ **Commit:** `"feat(web): share message com flags/turno/URL + native share API"`

---

**4.5.E5 — Abandonar partida em andamento** · Sonnet 🧠

```
Adicione a funcionalidade de abandonar uma partida em andamento. Planeje
antes de codar: identifique os arquivos tocados e a ordem de modificações.

── 1. EDGE FUNCTION: supabase/functions/abandon-game/index.ts ──

Inputs (JSON body): { gameId: string }
Auth: extrai userId do JWT (supabase.auth.getUser()). Retorna 401 se não logado.

Lógica:
  a) Busca a row em `games` + `game_players` onde game_id=gameId e user_id=userId.
     Retorna 403 se o usuário não é jogador da partida.
     Retorna 400 se a partida já está finalizada (is_finished=true).

  b) Determina o engine_player_id do caller via game_players.

  c) Lê game_state (JSON) da coluna games.game_state.

  d) PARTIDA SOLO (todos os outros players em game_state.players têm
     isAIControlled=true OR somente 1 humano no jogo):
       UPDATE games SET is_finished=true, winner_id=null,
         updated_at=now() WHERE id=gameId
       Retorna { abandoned: true, multiplayer: false }

  e) PARTIDA MULTIPLAYER (≥2 humanos no jogo):
       - Marca o player do caller como isEliminated=true em game_state.players
       - Se currentPlayerId === engine_player_id do caller:
           Avança para o próximo não-eliminado (mesma lógica de nextPlayerId
           do endTurn em turn.ts — busca o próximo na turnOrder que não esteja
           eliminado)
       - Conta jogadores não-eliminados restantes:
           · Se 0 restam (edge case): is_finished=true, winner_id=null
           · Se 1 resta: is_finished=true, winner_id=<id do restante>
           · Se ≥2 restam: apenas salva o game_state atualizado
       UPDATE games SET game_state=<novo>, is_finished=..., winner_id=...,
         current_player_id=<novo se avançou>, updated_at=now() WHERE id=gameId
       Retorna { abandoned: true, multiplayer: true, gameOver: boolean }

  Manipule game_state diretamente como JSON — não passe pelo engine (abandon
  não é uma ação validável, é um evento externo).

── 2. DEPLOY ──
  supabase functions deploy abandon-game

── 3. FRONTEND: apps/web/src/pages/GameListPage.tsx ──

Nos cards de partidas ATIVAS (is_finished=false), adicione um botão
de opções "⋯" no canto superior direito do card. Ao clicar, mostra um
menu simples (div absoluto com overlay, ou segundo estado do card) com a
opção "Abandonar partida 🏳".

Ao clicar em "Abandonar partida":
  - Mostra um modal de confirmação com dois textos distintos:
    · Solo: "Tem certeza? A partida será encerrada."
    · Multiplayer: "Tem certeza? Você será eliminado e o jogo continuará
      sem você."
  - Determina solo/multi verificando se game_state.players tem ≥2 com
    isAIControlled=false.
  - Botão "Confirmar" chama:
      supabase.functions.invoke('abandon-game', { body: { gameId } })
  - Sucesso: remove o card da lista local (setState filtrando o gameId)
    sem refetch.
  - Erro: mostra mensagem de erro inline no modal.

I18N (en.json + pt.json):
  - "gamelist.abandon": "Abandon game 🏳" / "Abandonar partida 🏳"
  - "gamelist.abandonConfirmSolo": "Are you sure? The game will end." /
    "Tem certeza? A partida será encerrada."
  - "gamelist.abandonConfirmMulti": "Are you sure? You'll be eliminated
    and the game continues without you." / "Tem certeza? Você será
    eliminado e o jogo continuará sem você."
  - "gamelist.abandonConfirmBtn": "Confirm" / "Confirmar"
  - "gamelist.abandonCancel": "Cancel" / "Cancelar"

Confirme que: clicar em "Abandonar" numa partida solo a remove da lista;
numa partida multiplayer (se existir), o modal mostra o aviso de eliminação.
```

✅ **Commit:** `"feat(web): abandonar partida em andamento (solo + multiplayer)"`

🛑 **CHECKPOINT E4/E5:** Valide manualmente:
- Share: o texto copiado tem flags de civ, placar e URL; no celular abre a sheet nativa.
- Abandonar: partida solo some da lista após confirmação; testar multiplayer se possível.
- Nenhuma regressão na tela de game over (botões Back to Lobby / View History intactos).

---

**4.5.E6 — Balanceamento de economia + eliminação automática + defesa de cidades** · **Opus** 🔴 🧠

```
Planeje antes de codar — este prompt toca 3 arquivos do engine em paralelo.
Identifique a ordem correta de modificações e os riscos de regressão antes
de escrever qualquer linha.

Contexto do problema reportado:
  - Com 3 cavaleiros mongóis, o jogador conquista todas as cidades em poucos
    turnos sem resistência. Cavaleiro (attack=18) vs city nível 1 (def=3)
    resulta em 15 dano por turno, matando a cidade (hp=10) em 1 hit.
  - Quando todas as cidades de um adversário são conquistadas, o jogo não
    encerra — isEliminated nunca é definido por conquista de cidade.
  - Food e gold não influenciam o treinamento de unidades, então só produção
    importa.

MUDANÇA 1 — Eliminação automática por conquista de cidade (actions.ts)
  Na função applyAction para o caso 'attackCity', após a lógica que captura
  a cidade (newHp <= 0): verifique se o oldOwner (ex-dono da cidade) ainda
  possui alguma cidade em state.cities. Se não possuir nenhuma, marque o
  jogador correspondente em state.players como isEliminated = true.
  O endTurn já verifica activeNow.length <= 1 e encerra o jogo com winner —
  não é necessário duplicar essa lógica.

MUDANÇA 2 — City HP e defesa escalados por nível (actions.ts)
  Substitua o valor fixo de maxHp (10) e a fórmula de defesa da cidade por:
    cityMaxHp(level)  = 10 + (level - 1) * 5   // nível 1=10, 2=15, 3=20
    cityDef(level)    = 3 + city.level           // era: 2 + city.level
  Use cityMaxHp() onde o maxHp de cidade for referenciado (conquista, cura,
  display). Se maxHp for um campo do objeto City, recalcule ao aplicar
  levelUp também.
  Objetivo: cavaleiro (18) vs nível 1 (def=4): 14 dano. Ainda conquista em
  1 turno nível 1, mas nível 2 (def=5, hp=15) requer 2 ataques de cavaleiro.

MUDANÇA 3 — Manutenção 2g/unidade (economy.ts)
  UNIT_MAINTENANCE_GOLD = 2 (era 1). Três cavaleiros = 6g/turno.
  Confirme que os testes existentes de manutenção usam a constante
  (não valor hardcoded) — se sim, passam automaticamente; se não, ajuste.

MUDANÇA 4 — Treinar unidade custa food + gold (actions.ts)
  Em validateTrainUnit, adicione duas novas verificações antes de permitir
  o treino:
    foodCost = Math.ceil(unit.productionCost / 2)
    goldCost = Math.ceil(unit.productionCost / 3)
  Retorne erro apropriado se player.resources.food < foodCost ou
  player.resources.gold < goldCost.
  Em applyTrainUnit, deduza food e gold imediatamente quando o treino começa
  (não quando completa), para evitar que o jogador acumule e gaste na hora.
  Exemplos de custo com os valores atuais:
    Guerreiro (prod=10): food=5, gold=4
    Cavaleiro (prod=60): food=30, gold=20

MUDANÇA 5 — Cap de unidades por população total (actions.ts)
  Em validateTrainUnit, adicione verificação de capacidade populacional:
    totalPop = sum de city.population para todas as cidades do jogador
    currentUnits = units.filter(u => u.ownerId === playerId).length
  Se currentUnits >= totalPop, retorne erro "insufficient_population".
  Isso força o jogador a crescer cidades (acumulando food) antes de ter um
  exército grande.

MUDANÇA 6 — IA ataca cidades com threshold mais agressivo (ai.ts)
  Em planCityAttack, mude a condição de ataque de:
    hp <= maxHp * 0.4 OU adjMine >= 2
  Para:
    hp <= maxHp * 0.7 OU adjMine >= 1
  Isso faz a IA atacar cidades com menos de 70% de vida, ou qualquer cidade
  adjacente com pelo menos 1 unidade disponível (sem precisar de 2).

TESTES:
  Adicione testes em actions.test.ts (ou arquivo dedicado):
  - trainUnit falha quando food insuficiente
  - trainUnit falha quando gold insuficiente
  - trainUnit falha quando currentUnits >= totalPop
  - trainUnit deduz food e gold do estado ao ser aplicado
  - attackCity com captura da última cidade marca isEliminated=true no owner
  - attackCity numa cidade nível 2 com cavaleiro não captura em 1 hit
    (nível 2: def=5, hp=15; cavaleiro: attack=18; dano=13; hp restante=2)

Regenere o backend-core.js após todas as mudanças:
  pnpm --filter @aetas/backend-core bundle

Valide com pnpm --filter @aetas/game-engine test antes de commitar.
```

✅ **Commit:** `"feat(engine): auto-eliminação + city HP escalado + food/gold para treinar + cap por pop + manutenção 2g"`

🛑 **CHECKPOINT E6:** Jogue uma partida solo vs 2 IAs, dificuldade mediana:
- Não consegue treinar 3 cavaleiros no início sem ter food e gold acumulados
- Cavaleiro não conquista cidade de nível 2 em 1 hit (leva 2 ataques)
- Quando você conquista a última cidade de um adversário, ele é eliminado
  imediatamente e o jogo encerra se sobrar só você
- IA ataca suas cidades quando tem unidades adjacentes (mesmo sem 2 unidades)
- Manutenção: 3 cavaleiros = 6g/turno; veja o ícone vermelho se seu ouro for insuficiente

---

**4.5.E7 — Edifícios custam gold + ação Fortify City** · Sonnet 🧠

```
Planeje antes de codar — este prompt adiciona uma nova ação ao engine e
expõe ela na UI.

MUDANÇA 1 — Buildings custam gold (buildings.ts + actions.ts)
  Em buildings.ts, adicione goldCost a cada edifício do catálogo.
  Proporção sugerida (ajuste se necessário):
    goldCost ≈ Math.round(productionCost * 0.5)
  Em validateBuildBuilding: adicione verificação de player.resources.gold
    >= building.goldCost.
  Em applyBuildBuilding: deduza building.goldCost de player.resources.gold
    imediatamente ao iniciar a construção.

MUDANÇA 2 — Nova ação "fortifyCity" (types.ts + actions.ts + UI)
  Adicione o type FortifyCity ao union de SubmittableAction em types.ts:
    { type: 'fortifyCity'; cityId: string; goldAmount: number }

  validateFortifyCity:
    - Caller deve ser dono da cidade
    - goldAmount deve ser >= 5 e <= player.resources.gold
    - city.hp deve ser < cityMaxHp(city.level) (já no máximo = não faz sentido)

  applyFortifyCity:
    - Deduza goldAmount do ouro do jogador
    - Aumente city.hp em Math.floor(goldAmount / 5), com cap em cityMaxHp

  Taxa de conversão: 5 gold = +1 HP de cidade. Exemplo: 20 gold = +4 HP.

  UI em apps/web/src/pages/GameView.tsx ou componente de CityPanel:
    - Quando o jogador seleciona uma cidade própria que não está em hp máximo,
      mostre um botão "Fortify 🏰" com input de gold (mínimo 5).
    - Submeta como action: { type: 'fortifyCity', cityId, goldAmount }.
    - Feedback: mostre o HP atualizado na barra da cidade após confirmação.

  I18N: adicione chave "action.fortify" (en/pt).

Regenere backend-core.js após as mudanças.
Confirme que pnpm --filter @aetas/game-engine test não regride.
```

✅ **Commit:** `"feat(engine): buildings custam gold + ação fortifyCity"`

🛑 **CHECKPOINT E6+E7:** Jogue uma partida com foco em economia:
- Construir um edifício requer gold além de produção
- Cidade sitiada pode ser reforçada com gold antes do próximo ataque da IA
- Todos os recursos (food, gold, production) têm uso claro e visível

---

**4.5.E8 — City level-up por população + territórios + gate de edifício** · Sonnet 🧠

```
Planeje antes de codar — este prompt toca economy.ts, actions.ts e CityModal.tsx.
Identifique a ordem (engine primeiro, UI depois) e os pontos de regressão antes
de escrever qualquer linha.

CONTEXTO:
  city.level nunca sobe de 1. Já existem no engine: cityMaxHp(level),
  cityDefense(level), LEVEL_BONUS_PER_LEVEL=0.2, e
  computeCityTerritoryBonus(..., radius) aceitando raio variável — tudo pronto
  para ser ativado assim que o level mudar.

MUDANÇA 1 — Level-up automático por população (economy.ts, applyGrowth)
  Após applyGrowth calcular o novo population da cidade, aplicar:

    function popToLevel(pop: number): number {
      if (pop >= 4) return 3
      if (pop >= 2) return 2
      return 1
    }

  Se popToLevel(grown.population) > grown.level:
    - newLevel = popToLevel(grown.population)
    - newMaxHp = cityMaxHp(newLevel)
    - hp ganha a diferença:
        hp = Math.min(newMaxHp,
          (grown.hp ?? cityMaxHp(grown.level)) + (newMaxHp - cityMaxHp(grown.level)))
    - Retornar cidade com level, maxHp e hp atualizados.
  O level NUNCA diminui (só cresce).

  Justificativa dos thresholds 2/4 (não 3/6):
    Com FOOD_PER_POPULATION_GROWTH=20 e cidades Military (food×0.75), pop 2
    é atingida por volta do turno 12-15 e pop 4 por volta do turno 18-22.
    Com maxTurns=20, isso torna o sistema observável — threshold 3/6 nunca
    seria atingido numa partida padrão.

MUDANÇA 2 — 2º edifício da especialização requer nível 2 (actions.ts, case 'constructBuilding')
  Após checar especialização correta e que o building não está construído nem
  em construção:
    const builtForSpec = (city.buildings ?? []).filter(b =>
      getBuildingDef(b).specialization === buildingDef.specialization
    )
    if (builtForSpec.length >= 1 && city.level < 2) {
      return { valid: false, reason: 'city level too low' }
    }
  Exemplo: Quartel (1º Military) construível em nível 1; Muralha (2º Military)
  só em nível 2+ (pop ≥ 2).

MUDANÇA 3 — Território expande para raio 3 no nível 3 (economy.ts, computeCityProduction)
  Na chamada de computeCityTerritoryBonus, passar:
    const territoryRadius = city.level >= 3 ? 3 : 2
  em vez do radius default 2. Cidade nível 3 reivindica tiles em raio 3,
  gerando mais recursos de terreno.

MUDANÇA 4 — UI: barra de progresso de nível (apps/web/src/components/CityModal.tsx)
  Entre o stats grid (linha ~131) e a seção de Resources (linha ~137), adicionar
  bloco condicional quando isMyCity:
  a) Se city.level < 3: barra de progresso
       level 1 → "Pop {city.population}/2 → Nível 2"
       level 2 → "Pop {city.population}/4 → Nível 3"
       Barra: width = min(100, city.population / threshold * 100)%, cor aetas-gold.
  b) Se city.level === 3: "🏛 Nível Máximo" em gold.

  No bloco de buildings já existente: se city.level < 2 && já existe 1 building
  da especialização construído, renderizar o card do 2º building desabilitado
  (opacity-50, cursor-not-allowed) com "🔒 Requer Nível 2" no lugar dos botões.

  I18N (en/pt): chaves city.levelProgress, city.maxLevel, city.requiresLevel2.

TESTES (economy.test.ts / actions.test.ts):
  - applyGrowth: pop 1 → 2 → level 2, maxHp 15, hp +5.
  - applyGrowth: pop 3 → 4 → level 3, maxHp 20.
  - applyGrowth: cidade no nível máximo não regride.
  - constructBuilding: 2º building da especialização rejeitado se level < 2.
  - constructBuilding: 2º building aceito com level >= 2.
  - computeCityProduction: cidade nível 3 reivindica território de raio 3
    (mais tiles que nível 2 na mesma posição).

Regenere e valide:
  pnpm --filter @aetas/backend-core bundle
  pnpm --filter @aetas/game-engine test    (não aumentar as 3 falhas do baseline)
  pnpm --filter @aetas/web build           (TypeScript limpo)
```

✅ **Commit:** `"feat(engine+ui): city level-up por população + territórios + gate de edifício"`

🛑 **CHECKPOINT E8:**
- Commercial city: após ~12 turnos o StatBox "Level" deve passar de 1 para 2
- Barra de progresso mostra pop atual / threshold do próximo nível
- Quartel construível em nível 1; Muralha mostra 🔒 até nível 2
- Cidade nível 3 (pop 4) reivindica tiles mais distantes (income de território maior)
- +20% recursos por nível funciona automaticamente via LEVEL_BONUS_PER_LEVEL

---

## BLOCO UI — Redesign Visual Romano (UI-T1 → T3)

> Estes 3 prompts transformam o visual do app de "SaaS dark mode" para "strategy
> game romano". Nenhuma regra de jogo é alterada. Executar em sequência; cada
> um é um commit isolado e revertível.
>
> **Referências visuais:** menu principal (imagem 3), tela de partida (imagem 2),
> modal de cidade (imagem 1) — usadas como moodboard estético, não cópia exata.
> Labels permanecem em inglês/português (sem latinização de texto).

---

**UI-T1 — Fundação: tokens + componentes romanos reutilizáveis** · Sonnet 🧠

```
Planeje antes de codar — este prompt cria a base de estilo que os prompts
UI-T2 e UI-T3 vão consumir.

CONTEXTO VISUAL:
  Referência: jogo de estratégia romano com paleta warm-dark (marrom âmbar
  profundo), bordas duplas em aetas-gold/20, tipografia Cinzel em displays.
  Cinzel já está importada em index.css. Os tokens existentes são bons — o
  objetivo é pequeno ajuste de calor e adição de novos tons.

MUDANÇA 1 — tokens.css: ajuste de calor + novos tokens
  Nos tokens existentes:
    aetas-bg:      #0e0c09 → #110d07   (ligeiramente mais âmbar)
    aetas-surface: #17140f → #1c1509
    aetas-raised:  #211d16 → #271a0d
    aetas-panel:   #2b261e → #312010
    aetas-border:  #38301f → #3d2910
    aetas-border-strong: #4d4230 → #52350f

  Novos tokens (adicionar após os existentes):
    --color-aetas-stone:    #bfaa87   /* mármore/pedra, fundo de stat boxes */
    --color-aetas-bronze:   #7a4f1e   /* bronze escuro, variante de fundo de botão */
    --color-aetas-parchment:#c8a552   /* pergaminho dourado — bordas decorativas */

  Em tailwind.config (se existir) OU tokens.css: garantir que `font-display`
  mapeia para `Cinzel, Georgia, serif`.

MUDANÇA 2 — SealButton.tsx (novo componente)
  Crie apps/web/src/components/ui/SealButton.tsx.
  Props: variant ('gold' | 'red'), size ('sm' | 'md' | 'lg'), onClick, disabled,
         children, className.
  Design:
    - Formato circular (border-radius 9999px)
    - Gold: gradiente radial do centro #e8c97a para fora #8f6b20; borda dupla
      1px solid aetas-gold/60 com outline 1px solid aetas-gold/20
    - Red: mesmo padrão com #c94a4a centro e #7a1a1a borda
    - Sombra: shadow-lg com cor da variante a 40% de opacidade
    - Tamanhos: sm = w-10 h-10 text-xs, md = w-14 h-14 text-sm,
                lg = w-24 h-24 text-xl font-display font-semibold
    - Estado disabled: opacity-40 cursor-not-allowed
    - Hover/active: brightness-110 scale-[1.03]
  Exportar como default e como named export.

MUDANÇA 3 — AetasLogo.tsx (novo componente SVG)
  Crie apps/web/src/components/ui/AetasLogo.tsx.
  É uma medalha/moeda circular em SVG inline (48×48):
    - Círculo externo: stroke aetas-gold, fill none, stroke-width 2
    - Círculo interno (menor, separado por 3px): mesmo stroke, opacity 0.5
    - Anel de louros simplificado entre os dois círculos: série de ~16 elipses
      pequenas inclinadas alternando para esquerda/direita em stroke aetas-gold
    - Centro: letra "A" estilizada em Cinzel OU escudo romano simples (retângulo
      + semicírculo no topo) em fill aetas-gold/70
  Aceitar prop `size` (default 48). Usar className aetas-gold para stroke/fill.

MUDANÇA 4 — RomanDivider.tsx (novo componente)
  Crie apps/web/src/components/ui/RomanDivider.tsx.
  SVG inline: linha horizontal de largura total com ornamento central.
    - Linha: dois traços horizontais (left 0→40%, right 60→100%) stroke
      aetas-gold/30, stroke-width 0.5
    - Centro: diamante SVG (losango 8×8px) em fill aetas-gold/50
    - Opcionalmente: 2 pontos menores flanqueando o diamante
  Props: className.

VALIDAÇÃO:
  pnpm --filter @aetas/web build   (TypeScript limpo, sem erros)
  Verificar que os novos tokens não quebram nenhuma classe existente no build.
```

✅ **Commit:** `"feat(ui-t1): theme foundation — tokens + SealButton + AetasLogo + RomanDivider"`

🛑 **CHECKPOINT UI-T1:** Abrir o app no browser e confirmar que o tom de fundo ficou
ligeiramente mais âmbar (não deve parecer verde ou frio). Os 3 novos componentes
podem ser temporariamente renderizados numa rota de teste ou inspecionados via
import no DevTools para confirmar que TypeScript não reclamou.

---

**UI-T2 — GameListPage: menu romano completo** · Sonnet 🧠

```
Planeje antes de codar — este prompt redesenha o menu principal inteiro.
Toca GameListPage.tsx, DailyCard.tsx (se existir separado), e possivelmente
GameCard.tsx/GameListItem.tsx.

CONTEXTO:
  O menu atual é "dark SaaS". A referência visual mostra:
    - Logo em medalha dourada no canto superior esquerdo
    - Barra de título com linha dourada separadora abaixo
    - Card de Daily Challenge com moldura de pedra (bordas retas + detalhe
      duplo dourado), badge de vitória no canto, ícones em bronze
    - Seção "MY TURN" com número em badge + ornamento decorativo central
    - Cards de jogo com thumbnail em clip-path hexagonal e moldura
    - Botão "+ New Game" como lacre circular heroico (SealButton lg) fixo
      no canto inferior direito
    - Background: silhueta SVG do Coliseu em opacity 8–12% cobrindo o 1/3
      inferior da tela

ANTES DE CODAR: ler GameListPage.tsx inteiro + quaisquer subcomponentes de
card de jogo para mapear o que é componente separado.

MUDANÇA 1 — Header: AetasLogo + título Cinzel + separador
  - Substituir CivAvatar+h1 por: AetasLogo (size 40) seguido de
    <span className="font-display text-2xl font-semibold text-aetas-gold
    tracking-widest">AETAS</span>
  - Abaixo do header: linha divisória full-width em border-aetas-gold/20
    (substituir ou enriquecer o border-b existente)
  - Opcional: thin gradient bar em aetas-gold/30 sob o header (height 1px)

MUDANÇA 2 — Paleta geral da página
  - bg-aetas-bg → manter (token já ajustado no T1)
  - Cantos: substituir rounded-xl/2xl por rounded-sm em todos os cards
    principais (Daily Challenge, game cards) — deixar rounded-full apenas
    para avatares e SealButton
  - Bordas: cards principais recebem borda dupla CSS:
      border: 1px solid var(--color-aetas-border);
      outline: 1px solid var(--color-aetas-gold) / 12%;
      outline-offset: -3px;
    (implementar via classe Tailwind customizada ou style inline)

MUDANÇA 3 — Card Daily Challenge
  - Remover rounded-xl → rounded-sm
  - Aplicar borda dupla (ver acima) + accent top: 3px solid aetas-parchment
    no topo do card (borda superior mais grossa e mais clara)
  - Background do card: bg-aetas-panel (já correto), mas adicionar subtle
    background linear-gradient from aetas-gold/5 to transparent no header
    interno
  - Ícone de troféu atual (emoji 🏆 ou lucide): substituir por SVG inline
    simples — círculo dourado com letra "D" ou coroa de louros minimalista,
    stroke aetas-gold, fill none, stroke-width 1.5
  - Badge "Victory" / "Played today": se existir, posicionar no canto superior
    direito como bandeira vertical (retângulo crimson com "Victory" em Cinzel
    texto branco, inclinado -2deg)

MUDANÇA 4 — Seção "MY TURN" e cards de jogo
  - Header da seção: <RomanDivider /> acima + texto "MY TURN" em font-display
    uppercase tracking-widest text-aetas-gold/80 text-xs + número de turno em
    SealButton variant gold size sm (read-only, não clicável)
  - Cards de jogo:
    a) Thumbnail do mapa: trocar container quadrado por hexágono via clip-path:
       clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)
       manter o mesmo conteúdo de preview dentro
    b) Borda do card: mesmo padrão de borda dupla do Daily Challenge
    c) Botão "Play →": substituir pelo SealButton variant gold size sm com
       texto "▶" ou "→"

MUDANÇA 5 — Botão New Game (FAB)
  - Substituir o FAB atual por SealButton variant gold size lg
  - Posição: fixed bottom-6 right-6 (ou right-4 em mobile)
  - Texto: "+  New Game" em font-display
  - Sombra heroica: shadow-2xl shadow-aetas-gold/30

MUDANÇA 6 — Background Colosseum SVG
  - No container principal, adicionar como filho absolute (pointer-events-none):
    SVG da silhueta do Coliseu (série de arcos semicirculares em camadas —
    3 linhas de arcos decrescentes simulando os andares do Coliseu) na cor
    aetas-text/8 opacity, posicionado bottom-0 right-0 ou centralizado,
    width ~80% da tela, height ~30vh
  - A silhueta deve ser construída com paths simples: cada andar é uma série
    de rect+circle (arco) repetida. Não precisa ser fotorrealista — apenas
    reconhecível como arquitectura romana.

VALIDAÇÃO:
  pnpm --filter @aetas/web build
  Verificar em modo mobile (375px) e desktop que nenhum card transborda.
```

✅ **Commit:** `"feat(ui-t2): GameListPage redesign — roman theme, hex clips, seal FAB"`

🛑 **CHECKPOINT UI-T2:**
- Header mostra AetasLogo + "AETAS" em Cinzel dourado
- Daily Challenge card com bordas retas e acento dourado no topo
- Cards de partida com thumbnail em formato hexagonal
- Botão New Game é o SealButton dourado circular heroico no canto inferior
- Silhueta do Coliseu visível mas sutil no fundo (não deve competir com conteúdo)
- Testar no celular: SealButton cabe sem cortar

---

**UI-T3 — CityModal + GameView chrome: painéis romanos** · Sonnet 🧠

```
Planeje antes de codar — este prompt redesenha o modal de cidade e a barra
de UI do GameView (topo + painel lateral direito). NÃO altera a lógica de
jogo, o mapa de hexágonos, nem os labels de texto.

CONTEXTO:
  CityModal atual: bottom sheet arredondado, botões retangulares Build/Train,
  stat boxes simples.
  Referência visual: painel de pedra com cabeçalho em cartela decorativa,
  stat boxes em mármore (fundo claro, texto escuro), botões Build/Train como
  selos circulares (dourado/vermelho), seção de recursos com ícones de moeda.
  GameView atual: barra de recursos simples, botão "End Turn" retangular.
  Referência: barra com ícones de moeda, botão "End Turn" como painel romano.

ANTES DE CODAR: ler CityModal.tsx inteiro + ResourceBar.tsx + GameView.tsx
linhas 700-800 (área dos botões End Turn / painel lateral).

--- CityModal ---

MUDANÇA 1 — Header do modal: cartela decorativa
  - Manter estrutura (nome da cidade + dono + botão fechar)
  - Fundo do header: bg-aetas-panel com border-b border-aetas-gold/30
  - Título da cidade: font-display text-lg text-aetas-gold font-semibold
    tracking-wide (text-center se couber)
  - Subtítulo (civ name): text-aetas-muted text-xs uppercase tracking-widest
  - Botão fechar: SealButton variant red size sm com "✕" (substituir o
    rounded-full manual atual)
  - Linha decorativa sob o header: <RomanDivider /> (importar de ui/)

MUDANÇA 2 — Stat boxes (Level, Population, Food)
  - Container de cada box: bg-aetas-stone/20 border border-aetas-stone/30
    rounded-sm (não rounded-lg)
  - Label: text-aetas-dim uppercase tracking-widest text-[10px]
  - Valor: text-aetas-gold font-display font-semibold text-xl
  - Fundo contrastante claro (stone/20) cria efeito "mármore" contra o
    fundo escuro do modal

MUDANÇA 3 — Seção de recursos do jogador (Res Publicae)
  - Label "Player Resources": substituir por <RomanDivider /> + texto
    "RES PUBLICAE" em font-display text-[10px] uppercase tracking-widest
    centralizado (mas ainda em inglês: se i18n já tem 'city.playerResources',
    manter a chave — só estilizar o rótulo)
  - Cada pill de recurso: fundo bg-aetas-raised rounded-sm + ícone SVG
    circular (moeda bronze). Os 3 ícones:
      Gold icon: SVG círculo + "G" em Cinzel OU perfil de Júlio César
        simplificado (óvalo horizontal + retângulo menor = busto de perfil)
        stroke aetas-gold, fill none
      Food icon: SVG cesto trançado simples (retângulo com linhas internas
        diagonais cruzadas) em stroke aetas-gold/70
      Production icon: SVG bigorna (retângulo trapezoid) em stroke aetas-gold/70
    Tamanho dos ícones: 20×20px, stroke-width 1.5

MUDANÇA 4 — Botões Build e Train → SealButton
  - Substituir todos os <button> de "Build" no bloco de edifícios disponíveis
    por <SealButton variant="gold" size="sm">Build</SealButton>
  - Substituir todos os <button> de "Train" no bloco de unidades
    por <SealButton variant="red" size="sm">Train</SealButton>
  - Ajustar layout do card de edifício/unidade para acomodar o formato circular
    (o SealButton sm tem w-10 h-10; se o espaço for apertado, usar size="sm"
    e remover o custo de produção do mesmo row — mover para linha separada)

MUDANÇA 5 — Level progress bar: estilo romano
  - A barra existente (E8): substituir cor de bg pela bg-aetas-bronze/40 para
    o trilho, e bg-aetas-gold para o fill — já deve estar com bg-aetas-gold,
    confirmar
  - Container da barra: border border-aetas-border rounded-sm (não rounded-full)
  - Texto "Pop X/Y → Nível Z": font-display text-[10px] text-aetas-gold/80

--- GameView ---

MUDANÇA 6 — ResourceBar.tsx: ícones de moeda
  - Para cada recurso (Gold, Food, Production, Maintenance):
    Substituir emoji/ícone atual por SVG inline 16×16 com stroke aetas-gold/70.
    Gold: círculo com "G" interno; Food: folha/espiga; Production: engrenagem
    (ou bigorna como no CityModal); Maintenance: escudo/espada cruzadas.
    stroke-width 1.5, fill none.
  - Fundo da barra: bg-aetas-raised → bg-aetas-panel com border-b
    border-aetas-gold/20 (ligeiramente mais visível)

MUDANÇA 7 — Botão End Turn no GameView
  - Localizar o botão principal "End Turn" (no painel lateral ou FAB)
  - Substituir por painel decorativo:
      <div className="border border-aetas-gold/40 bg-aetas-panel rounded-sm
        px-4 py-2 font-display text-aetas-gold tracking-widest uppercase
        text-center cursor-pointer hover:bg-aetas-raised transition-colors">
        End Turn
      </div>
  - Versão mobile (se for o botão grande): SealButton variant gold size lg
    com texto "END TURN" font-display

VALIDAÇÃO:
  pnpm --filter @aetas/web build
  Abrir uma partida real no browser e verificar:
    - CityModal abre com header romano e botões Build/Train circulares
    - ResourceBar com ícones SVG legíveis em mobile
    - End Turn button com estilo romano
```

✅ **Commit:** `"feat(ui-t3): CityModal + GameView chrome — roman panels, seal buttons, SVG icons"`

🛑 **CHECKPOINT UI-T3:**
- Modal de cidade: header com Cinzel dourado, stat boxes com fundo pedra
- Botões Build (dourado circular) e Train (vermelho circular) visíveis e clicáveis
- ResourceBar com ícones SVG ao invés de emojis
- End Turn estilizado como painel romano
- Layout não quebra em celular (375px) nem no modal de cidade scrollável
- Testar Build e Train reais: as ações ainda funcionam (SealButton deve disparar
  os mesmos callbacks — só visual mudou)

---

## BLOCO UI-V — Aproximação Visual às Referências (UI-V1 → V3)

> Estes prompts fecham o gap entre os esboços de referência e o estado pós-T3.
> Dependem de assets PNG/WebP gerados manualmente antes de cada prompt.
> Ordem: UI-V1 → V2 → V3. Não pule V1 sem o asset pronto.

---

**UI-V1 — GameView: fundo de imagem romana + END TURN circular** · Sonnet 🧠

> ⚠️ PRÉ-REQUISITO MANUAL antes de colar este prompt:
> Salve a imagem gerada (Retro Print, Coliseu à esquerda + Arco à direita,
> céu laranja/vermelho, foreground escuro azul-índigo) em
> `apps/web/public/assets/game-bg.webp` (resolução 1536×1024px ou superior).
> Confirme que o arquivo existe antes de iniciar.
>
> Se precisar regerar: Copilot Pro Image Creator, estilo "Impressão Retrô",
> paleta linha 1 col 3 (bege/âmbar/azul escuro/crimson). Prompt:
> "Cinematic Roman panorama, Colosseum on the far LEFT edge, Triumphal Arch
>  on the far RIGHT edge, warm amber/orange sunset sky in the center,
>  very dark blue-black foreground at the bottom, city silhouettes in
>  middle distance. Retro Print halftone style. No text. 16:9 landscape."

```
Planeje antes de codar — este prompt adiciona imagem de fundo ao mapa e
converte o botão END TURN para SealButton circular no desktop.

ANTES DE CODAR: ler GameView.tsx (div do mapa, linhas ~718-730) e
ActionSheet.tsx (sidebar desktop, linhas ~141-175) inteiros.

MUDANÇA 1 — Fundo do mapa com imagem (GameView.tsx):
  Localizar a div `className="relative flex-1 min-h-0 bg-aetas-bg"` que
  contém o HexMap. Modificar para:
    - Remover bg-aetas-bg do className
    - Adicionar style={{ backgroundImage: 'url(/assets/game-bg.webp)',
        backgroundSize: 'cover', backgroundPosition: 'center center' }}
    - Adicionar como primeiro filho (z-0) um overlay escuro para manter
      contraste com os hexágonos:
        <div className="absolute inset-0 bg-aetas-bg/60 pointer-events-none z-0" />
    - Garantir que HexMap e demais filhos tenham position relativa (z-1 ou
      relative) para aparecer sobre o overlay

MUDANÇA 2 — END TURN desktop como SealButton lg (ActionSheet.tsx):
  Localizar o <button> do sidebar desktop (className w-full py-3 rounded-sm
  font-display...). Substituir pelo padrão circular:
    <div className="flex justify-center py-2">
      <SealButton
        variant="gold"
        size="lg"
        onClick={onEndTurn}
        disabled={!isMyTurn}
      >
        <span className="font-display text-center leading-tight
          text-[10px] uppercase tracking-widest">
          END<br/>TURN
        </span>
      </SealButton>
    </div>
  Quando !isMyTurn, o SealButton já aplica opacity-40 via prop disabled.
  Adicionar import { SealButton } from './ui/SealButton' se ainda não existe.
  Manter o texto de "waiting" abaixo do botão como <p> separado:
    {!isMyTurn && (
      <p className="text-center text-aetas-dim text-xs">
        {t('action.waitingTurn')}
      </p>
    )}
  O mobile (bottom sheet) mantém o estilo retangular que já existe.

VALIDAÇÃO:
  pnpm --filter @aetas/web build
  Abrir partida no browser:
  - Mapa deve ter fundo visual (não preto sólido)
  - Overlay escuro deve manter hexágonos legíveis
  - END TURN circular dourado visível no sidebar desktop
  - Mobile: bottom sheet não alterado
```

✅ **Commit:** `"feat(ui-v1): roman background image + circular END TURN button"`

🛑 **CHECKPOINT UI-V1:** Verificar em mobile que o overlay não escurece demais
o mapa (ajustar bg-aetas-bg/60 para /50 se necessário — a imagem game-bg.webp
tem foreground muito escuro, então /60 é o ponto de partida).
Confirmar que END TURN ainda dispara a ação de fim de turno.

---

**UI-V2 — GameListPage: imagem de cena romana** · Sonnet

> ⚠️ PRÉ-REQUISITO MANUAL antes de colar este prompt:
> Salve a imagem gerada (Retro Print, fundo escuro ouro/azul com Coliseu,
> aqueduto, arco e estandarte com Águia romana) em
> `apps/web/public/assets/menu-bg.webp` (resolução 1536×1024px ou superior).
> Confirme que o arquivo existe antes de iniciar.
>
> Se precisar regerar: Copilot pro Image Creator, estilo "Impressão Retrô",
> paleta linha 1 col 3. Prompt original:
> "A cinematic atmospheric background illustration for a strategy game UI
>  main screen, 16:9. Colosseum, aqueduct, triumphal arches. Low-key epic
>  lighting, rich golds, deep bronzes, dark browns. Golden-amber fog.
>  Roman Aquila eagle on parchment in corner. No text, no UI elements."

```
Substituir o ColosseumSilhouette SVG geométrico por imagem real de cena
romana no GameListPage.

ANTES DE CODAR: ler GameListPage.tsx — localizar a div com
pointer-events-none fixed que contém <ColosseumSilhouette />.

MUDANÇA 1 — Trocar SVG geométrico por imagem:
  Substituir o bloco:
    <div className="pointer-events-none fixed inset-x-0 bottom-0 h-[30vh]...">
      <ColosseumSilhouette />
    </div>
  por:
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true">
      <img
        src="/assets/menu-bg.webp"
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-bottom"
        style={{ opacity: 0.18 }}
      />
      {/* Gradient para escurecer o topo e preservar legibilidade do header */}
      <div className="absolute inset-0 bg-gradient-to-b
        from-aetas-bg via-aetas-bg/70 to-aetas-bg/30" />
    </div>
  Remover a função ColosseumSilhouette() do final do arquivo.

MUDANÇA 2 — Ajuste de contraste do conteúdo:
  A imagem de fundo pode reduzir contraste de texto. Verificar:
  - GameCards: adicionar bg-aetas-surface/80 se necessário (já têm bg-aetas-surface)
  - DailyCard: idem
  Se o texto ficar ilegível, aumentar opacity do gradient overlay de /70 para /90.

VALIDAÇÃO:
  pnpm --filter @aetas/web build
  No menu principal:
  - Imagem de fundo romana visível mas não dominando o texto
  - Cards e textos legíveis sobre o fundo
  - Header "AETAS" com boa separação visual do background
  - Fade gradual da imagem no topo (header area é mais escura)
```

✅ **Commit:** `"feat(ui-v2): roman scene background image for game menu"`

---

**UI-V3 — DailyCard stone frame + score pills romanos + Play→ pill** · Sonnet 🧠

```
Planeje antes de codar — este prompt refina 3 elementos visuais no menu:
a moldura stone do DailyCard, os score pills como moedas de bronze, e o
botão Play → como pílula de texto ao invés de SealButton circular.

ANTES DE CODAR: ler DailyCard.tsx inteiro e GameListPage.tsx (componente
GameCard, linhas ~287-444 do estado pós-T2).

--- DailyCard.tsx ---

MUDANÇA 1 — Frame de pedra com ornamentos de canto:
  No container principal do card (a div com rounded-sm e inline style),
  adicionar 4 ornamentos SVG nos cantos via posicionamento absoluto:
    {/* Corner ornaments — thin gold L-shapes */}
    {['top-0 left-0', 'top-0 right-0 rotate-90', 'bottom-0 right-0 rotate-180',
      'bottom-0 left-0 -rotate-90'].map((pos, i) => (
      <svg key={i} className={`absolute ${pos} w-4 h-4`} viewBox="0 0 16 16"
        fill="none" stroke="var(--color-aetas-parchment)" strokeWidth="1.5">
        <path d="M1 15 L1 1 L15 1" />
      </svg>
    ))}
  O container já tem position relative — apenas adicionar overflow-hidden
  se os cantos aparecerem fora dos bounds.

  Também reforçar o box-shadow do card para dar profundidade de pedra:
    style={{
      ...estilos existentes,
      boxShadow: 'inset 0 1px 0 rgba(201,168,76,0.15), 0 4px 24px rgba(0,0,0,0.6)'
    }}

MUDANÇA 2 — Score pills como moedas de bronze (só quando daily.isFinished):
  Substituir os 3 <ScorePill> existentes por nova versão com moeda circular:
  
  function CoinPill({ icon, label, value }: { icon: JSX.Element; label: string; value: number }) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: 'radial-gradient(circle at 35% 35%, #a87828 0%, #5a3a0a 100%)',
            border: '2px solid rgba(201,168,76,0.50)',
            boxShadow: 'inset 0 1px 0 rgba(232,201,122,0.25)',
          }}>
          {icon}
        </div>
        <span className="font-display text-aetas-gold font-semibold text-base leading-none">{value}</span>
        <span className="text-aetas-dim text-[10px] uppercase tracking-wider">{label}</span>
      </div>
    )
  }

  Ícones SVG 20×20 para os 3 pills (stroke aetas-text/80, strokeWidth 1.5):
    - Territory: <path d="M10 2 L17 6 L17 14 L10 18 L3 14 L3 6 Z"/> (hexágono)
    - Population: <circle cx="10" cy="7" r="3"/> + <path d="M4 17 Q10 12 16 17"/>
    - Development: <path d="M4 16 L4 4 L12 4 L16 8 L16 16 Z"/> <path d="M12 4 L12 8 L16 8"/>

  Reorganizar o layout do score section para flex com gap-4 centralizado.
  O total "57 pts" fica à direita como antes.

--- GameListPage.tsx ---

MUDANÇA 3 — Reverter Play → para pílula de texto:
  No componente GameCard, substituir:
    <SealButton variant="gold" size="sm" onClick={onEnter} className="mt-2">▶</SealButton>
  por:
    <button
      onClick={onEnter}
      className="mt-2 px-3 py-1.5 rounded-sm bg-aetas-gold text-aetas-bg
        text-xs font-semibold hover:brightness-110 transition-colors"
    >
      Play →
    </button>
  O SealButton fica exclusivo para: New Game FAB + Section count badge.

VALIDAÇÃO:
  pnpm --filter @aetas/web build
  No menu:
  - DailyCard com ornamentos de canto dourados visíveis nos 4 cantos
  - Score pills circulares douradas quando daily finalizado
  - Botão "Play →" retangular (não circular) nos game cards
  - Layout em 375px: pills não transbordam o card
```

✅ **Commit:** `"feat(ui-v3): DailyCard stone frame + bronze coin pills + Play pill button"`

🛑 **CHECKPOINT UI-V1→V3:** Validar nas duas telas principais:
- Menu: cena romana visível ao fundo, cards legíveis, Daily Challenge com moldura e pills
- Jogo: fundo de imagem com overlay adequado, END TURN circular dourado no desktop
- Mobile (375px): sem overflow, botão End Turn mobile inalterado
- Funcionalidade: Build, Train, Play, End Turn ainda disparam as ações corretas

---

## BLOCO BAL — Balanceamento & Gameplay

> Executar após CHECKPOINT UI-V1→V3. Todos os prompts BAL-1 e BAL-2 tocam o engine — rodar `pnpm test` após cada um antes de avançar.

---

### BAL-1 — Auto-guerra + Bloqueio territorial · **Opus** 🔴 🧠

```
Implementar duas novas regras de engine em `packages/game-engine/src/actions.ts`:

REGRA 1 — Auto-declaração de guerra ao atacar:
Em `validateAction` para os tipos `attackUnit` e `attackCity`:
- Verificar se o jogador já está em guerra com o dono do alvo.
- Se NÃO está → auto-aplicar `applyAction({ type: 'declareWar', targetPlayerId })`
  sobre o estado antes de validar/aplicar o ataque. O ataque ainda prossegue normalmente.
- Se já está em guerra → sem mudança.
- Atenção: `applyAction` pode precisar ser chamado em cadeia; verificar se há
  side-effects no `validateAction` que dependem de um estado sem guerra declarada.

REGRA 2 — Bloqueio de movimento em território inimigo:
Em `validateAction` para `moveUnit`:
- Território de um player = todos os tiles cuja cidade mais próxima pertence a esse player.
  Replicar a lógica de `apps/web/src/components/HexMap.tsx` linhas 239–251
  (Voronoi por hexDistance). `hexDistance` já está exportado de
  `packages/game-engine/src/map.ts`.
- Se o tile de destino pertence a outro player E o jogador não tem pacto ativo
  com ele → retornar `{ valid: false, reason: 'enemy territory' }`.
- Aliados = players com PactStatus.Active bilateral com o jogador.

Atualizar testes em `packages/game-engine/src/actions.test.ts`:
- atacar sem guerra prévia → guerra declarada, ataque aplicado
- mover para tile inimigo sem pacto → rejeitado 'enemy territory'
- mover para tile aliado (pacto ativo) → aceito

pnpm test
```

✅ **Commit:** `"feat(bal-1): auto-declare war on attack + territory movement block"`

---

### BAL-2 — Nerfe de especiais + Penalidade diplomática · **Opus** 🔴

```
PARTE 1 — Nerfe de unidades especiais em `packages/game-engine/src/units.ts`:
O Berserker (atk 24) é ~56% mais forte que o Knight base de outras civs,
considerando o bônus Viking de +15% combat. Manter o flavor, cortar a
vantagem absoluta para ≤ 20% vs. a unidade que substitui:

- Berserker: attack 24 → 20, HP 14 → 12
- Cavaleiro Mongol: se ataque > 15 (Cavalry base tem 12), trazer para ≤ 15
- Carro de Guerra Egípcio: não deve ter mais que +2 attack vs. Cavalry base
- Regra geral: nenhum especial pode ter soma (atk + def + HP) > 35% acima
  do substituto base

PARTE 2 — Penalidade diplomática por guerra em `packages/game-engine/src/ai.ts`:
- No processamento de IA: detectar se um player declarou guerra nos últimos
  5 turnos (verificar o log de ações ou campo equivalente no GameState).
- Player marcado como "warmonger": a IA recusa propostas de pacto vindas dele
  e prioriza propor pacto com outros players (coalizão simples contra o agressor).
- Manter toda a lógica existente de IA intacta; adicionar apenas este bloco
  de verificação de warmonger.

pnpm test
```

✅ **Commit:** `"feat(bal-2): nerf special units + AI warmonger penalty"`

---

### BAL-3 — Quatro novas civilizações · Sonnet 🧠

```
Adicionar 4 novas civilizações em `packages/game-engine/src/civilizations.ts`
e suas unidades especiais em `packages/game-engine/src/units.ts`.

───────────────────────────────────────────────
PERSAS (Era: ancient)
- id: 'persians'  color: '#9B59B6' (roxo imperial)
- Trait: Rota Real — +20% renda de ouro por turno; propostas de pacto
  custam 50% menos ouro para o jogador Persa
- Especial: Imortal (immortal) — substitui Warrior
  Stats: attack 9, defense 6, HP 12, movement 2. Production cost: 15
  (mesma defesa elevada, attack similar ao Guerreiro base)

───────────────────────────────────────────────
ASTECAS (Era: classical)
- id: 'aztecs'  color: '#27AE60' (verde jade)
- Trait: Expansão Ritual — cada cidade capturada concede +5 production
  permanente ao player Asteca (adicionar campo `conquestBonusProduction`
  no player e somá-lo ao income de production a cada turno)
- Especial: Águia Guerreira (eagle_warrior) — substitui Cavalry
  Stats: attack 13, defense 4, HP 9, movement 4. Production cost: 38
  (mais ágil, menos tanque que Cavalry base)

───────────────────────────────────────────────
JAPONESES (Era: medieval)
- id: 'japanese'  color: '#E74C3C' (vermelho lacquer)
- Trait: Bushido — +15% combat para todas as unidades japonesas
  (mesmo padrão de Vikings; verificar helper de bônus em ai.ts/actions.ts)
- Especial: Samurai (samurai) — substitui Knight
  Stats: attack 20, defense 9, HP 14, movement 2. Production cost: 65
  Diferencial: ao ser atacado, devolve 25% do dano recebido ao atacante
  (counterattack). Implementar em `packages/game-engine/src/combat.ts`
  — se estrutura não suportar counterattack, usar stats superiores simples
  e marcar TODO para fase futura.

───────────────────────────────────────────────
OTOMANOS (Era: medieval)
- id: 'ottomans'  color: '#E67E22' (laranja sultão)
- Trait: Mestre de Cerco — Catapultas custam 30% menos production
  (aplicar desconto em validateAction → trainUnit para unitType 'catapult')
- Especial: Janízaro (janissary) — substitui Besteiro/Crossbowman
  Stats: attack 16, defense 5, HP 12, movement 2. Production cost: 50

───────────────────────────────────────────────
Para cada civ: preencher name, id, era, specialty, specialtyDescription,
color e o campo bio se existir em GameListPage.

Atualizar `packages/game-engine/src/civilizations.test.ts` com as 4 novas civs.
pnpm test
```

✅ **Commit:** `"feat(bal-3): add Persians, Aztecs, Japanese, Ottomans + special units"`

---

### BAL-4 — Streak de desafios diários · Sonnet 🧠

```
Implementar contador de streak (dias consecutivos) para o Daily Challenge.

PASSO 1 — DB (Supabase):
Verificar se existe tabela `profiles` (padrão Supabase). Se sim, adicionar:
  daily_streak INT DEFAULT 0
  last_daily_date DATE
Se não existir, criar migration em `supabase/migrations/` com:
  CREATE TABLE user_stats (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    daily_streak INT DEFAULT 0,
    last_daily_date DATE
  );
  + Row Level Security: usuário lê/edita apenas os próprios dados.

PASSO 2 — Lógica em `apps/web/src/api.ts` ou diretamente em DailyCard.tsx:
Ao detectar que o daily ficou `is_finished = true` (polling ou após End Turn):
- Buscar `last_daily_date` do usuário
- Se last_daily_date == today − 1 dia → streak++   (consecutivo)
- Se last_daily_date == today → nenhuma mudança    (já contou hoje)
- Se gap > 1 dia ou NULL → streak = 1              (reinicia ou primeiro dia)
- Atualizar last_daily_date = today no DB

PASSO 3 — UI em `apps/web/src/components/DailyCard.tsx`:
- Buscar streak no useEffect de carregamento do daily
- Exibir badge `🔥 N` ao lado do título "Daily Challenge" quando streak ≥ 2
- Streak 0 ou 1: não exibir badge (não punir quem começa)
- Incluir streak na share message se ≥ 3: linha extra `🔥 Streak: N dias`

pnpm --filter @aetas/web build
```

✅ **Commit:** `"feat(bal-4): daily streak counter + 🔥 badge in DailyCard"`

---

### BAL-5 — Mensagem de compartilhamento · Sonnet

```
Atualizar `buildShareText()` em `apps/web/src/components/DailyCard.tsx`.

Formato atual:
  Aetas Daily — [data]
  [resultado] | [pts]
  🏙️ [terr]  👥 [pop]  🔬 [dev]
  ([turno X/Y])

Novo formato:
  🏛️ Aetas Daily — [data formatada]
  [emoji resultado] [texto resultado] · [total] pts
  🏙️[terr]  👥[pop]  🔬[dev]  · Turno [X]/[Y]
  🔗 playaetas.vercel.app

Regras:
- emoji resultado: 🏆 vitória / ❌ derrota / 🤝 empate
- Linha de URL é literal (não internacionalizada)
- Se streak ≥ 3: inserir linha `🔥 Streak: N dias` antes da URL
- Testar `navigator.clipboard.writeText` em iOS — se bloqueado fora de
  gesture handler, adicionar fallback via Web Share API:
  `if (navigator.share) navigator.share({ text })` antes do clipboard

pnpm --filter @aetas/web build
```

✅ **Commit:** `"feat(bal-5): improved share message + web URL"`

---

🛑 **CHECKPOINT BAL:** Validar em partida real (médio, 3–4 civs):
- Atacar unidade inimiga sem pacto/guerra → log mostra guerra declarada, ataque ocorre
- Tentar mover para tile colorido de outro player sem pacto → movimento bloqueado
- Berserker ainda é ameaça mas não vence sozinho 2 civs em 20 turnos
- Após player declarar guerra, IA rejeita pactos e tende a coligar contra ele
- Seletor de civ mostra as 4 novas (Persa, Asteca, Japonês, Otomano) com bios
- Daily: após 2 dias consecutivos aparece 🔥 N no card
- Share: mensagem inclui `🔗 playaetas.vercel.app` e streak se ≥ 3

> **Eras pendente:** Adicionar Renascimento/Industrial ficou fora deste bloco.

---

## BLOCO ENT — Entretenimento & Profundidade

Origem: ciclo `/playbook-architect` (auditoria pós-BAL). Diagnóstico: o jogo
está tecnicamente pronto para a web, mas é **previsível** — placar oculto até
o fim (zero tensão no meio), snowball sem freio, vitória única por pontos, IA
sem personalidade e nenhuma mecânica-assinatura. Este bloco ataca as 5
alavancas de diversão, ordenadas por risco/fundação e payoff imediato.

**Decisões travadas nesta sessão** (via AskUserQuestions):
- Vitória: **dominação militar + placar ao vivo**
- Anti-snowball: **custo crescente de expansão**
- IA: **personalidade por civ** (Agressor / Construtor / Diplomata)
- Mecânica-assinatura: **Maravilhas do Mundo** E **Eventos Mundiais** (ambas)

**Regra de ouro reforçada:** toda regra nova vive em `packages/game-engine`.
UI só renderiza e envia intenção. Rodar `pnpm --filter @aetas/game-engine test`
após cada prompt de motor.

---

### ENT-1 — Placar ao vivo · Sonnet

```
Revelar o ranking de pontuação DURANTE a partida (hoje só aparece no fim).

O motor já expõe tudo: `rankPlayers(state)` em
`packages/game-engine/src/scoring.ts` já devolve território/população/
desenvolvimento/total por jogador. NÃO mudar o motor.

No cliente web:
- Em `apps/web/src/components/ScoreModal.tsx` (ou o modal aberto pelo badge
  👥 no header do GameView): mostrar a lista rankeada de TODOS os jogadores
  visíveis, ordenada por total desc, com medalha para o 1º.
- Marcar a linha do jogador local (destaque dourado).
- Para jogadores ainda não contatados (fog), ocultar o nome real e mostrar
  "??? " — não vazar informação que a névoa esconde. Usar o mesmo critério de
  contato que a diplomacia usa (`haveMadeContact`/exploredHexes).
- Adicionar um mini-indicador no header: posição do jogador (ex: "2º/4").

pnpm --filter @aetas/web build
```

✅ **Commit:** `"feat(ent-1): live in-game scoreboard with fog-aware ranking"`

---

### ENT-2 — Vitória por Dominação · **Opus** 🔴 🧠

```
Adicionar uma SEGUNDA condição de vitória: dominação militar. Se um jogador
fica sendo o único não-eliminado (todos os outros perderam suas cidades),
a partida encerra IMEDIATAMENTE com ele como vencedor — sem esperar maxTurns.

Contexto do motor:
- `packages/game-engine/src/turn.ts` já chama `eliminatePlayersWithNoCities`
  e tem o hook `determineWinner` (de `scoring.ts`) para o fim por maxTurns.
- `packages/game-engine/src/scoring.ts` tem `determineWinner(state)`.

Implementar em `turn.ts` (é máquina de estados — cuidado com edge cases):
- Após resolver eliminações no fim de um turno, checar `activePlayers(state)`.
  Se restar exatamente 1 jogador ativo → definir `state.winner = esseId`,
  `state.isFinished = true`, encerrar já.
- Empate por eliminação mútua no mesmo passo (raro, mas possível se um combate
  por timeout elimina o penúltimo E o último simultaneamente): resolver por
  maior pontuação com `determineWinner`; se ainda empatar, `winner = null`.
- Vitória por dominação tem precedência sobre a de maxTurns.

Testes novos em `turn.test.ts`:
- 3 jogadores, 2 perdem a última cidade no mesmo turno → o 3º vence na hora.
- Eliminação NÃO encerra se ainda há ≥2 ativos.
- Dominação no turno 5 de uma partida de 20 turnos encerra em 5.

pnpm --filter @aetas/game-engine test
```

✅ **Commit:** `"feat(ent-2): military domination victory (last civ standing)"`

🛑 **CHECKPOINT ENT-A:** Jogar 1 partida no médio conquistando as duas IAs →
a partida deve encerrar no momento da última captura, com tela de vitória; o
placar ao vivo (ENT-1) deve bater com o resultado final.

---

### ENT-3 — Custo crescente de expansão · Sonnet 🧠

```
Frear o snowball: cada cidade adicional torna a PRÓXIMA expansão mais cara.
Objetivo de design — expandir deve ser uma decisão, não um automatismo; quem
já lidera paga mais caro para crescer.

Regra (definir no motor, `packages/game-engine`):
- O custo de produção do Colono (Settler) escala com o nº de cidades que o
  jogador JÁ possui: custo_efetivo = custo_base * (1 + 0.5 * nCidades).
  Ex.: base 20 → 1ª expansão (1 cidade) = 30, 2ª (2 cidades) = 40, etc.
- Aplicar em `validateAction` e `applyAction` do case `trainUnit`, no mesmo
  ponto onde o BAL-3 já calcula `effectiveCost` para o desconto Otomano de
  Catapulta. Seguir exatamente esse padrão (não duplicar lógica).
- IMPORTANTE: o custo escalado vale só para o Settler. Não afetar outras
  unidades. Combinar com o desconto Otomano se algum dia colidir (não colide:
  Otomano é Catapulta).
- Expor o custo efetivo para a UI: a `CityModal` já mostra ⚙🌾💰 por unidade
  (BAL-anteriores). Garantir que o número exibido para o Colono seja o
  escalado, não o base — senão o jogador vê "insufficient production" sem
  entender.

Testes em `actions.test.ts`:
- Jogador com 1 cidade: Settler custa base*1.5.
- Jogador com 3 cidades: Settler custa base*2.5.
- Warrior/Knight NÃO são afetados.

pnpm --filter @aetas/game-engine test && pnpm --filter @aetas/web build
```

✅ **Commit:** `"feat(ent-3): rising settler cost per owned city (anti-snowball)"`

---

### ENT-4 — Personalidade de IA por civ · **Opus** 🔴 🧠

```
Dar identidade às IAs: hoje toda civ joga igual. Criar 3 arquétipos que
modulam os PESOS das decisões que a IA já toma (não inventar ações novas).

Contexto: `packages/game-engine/src/ai.ts` já decide combate (com viés
pessimista de +2 defesa), treino de unidades, expansão e diplomacia
(warmonger tracking do BAL-2). A personalidade só ajusta thresholds/pesos.

Arquétipos e mapeamento por civ:
- AGRESSOR (vikings, mongols, aztecs, japanese): ataca com margem menor de
  segurança; treina mais unidades militares; propõe menos pactos; declara
  guerra mais cedo.
- CONSTRUTOR (romans, china, egyptians, ottomans): prioriza edifícios e
  expansão; ataca só com folga grande; defende bem; neutro em diplomacia.
- DIPLOMATA (greeks, persians): propõe pactos proativamente; evita guerra;
  foca economia; só ataca quem já é warmonger/inimigo declarado.

Implementação:
- Uma função `civPersonality(civId): 'aggressor'|'builder'|'diplomat'` (mapa).
- Um objeto de PESOS por arquétipo (ex.: `attackSafetyMargin`,
  `militaryTrainBias`, `pactPropensity`, `expansionBias`). Aplicar esses
  pesos nos pontos de decisão EXISTENTES do ai.ts — não criar caminhos novos.
- Manter DETERMINISMO: nada de RNG. Mesma entrada → mesma saída (a suíte
  depende disso). Personalidade é função pura do civId.

Testes em `ai.test.ts`:
- Mesma situação de combate marginal: Agressor ataca, Construtor não.
- Diplomata propõe pacto a um vizinho neutro; Agressor não.
- Determinismo: rodar 2x a mesma decisão → resultado idêntico.

pnpm --filter @aetas/game-engine test

# 🔻 Mudou o motor → regenerar bundle e deployar o backend (senão não vai ao ar):
pnpm --filter @aetas/backend-core bundle
npx supabase functions deploy
```

✅ **Commit:** `"feat(ent-4): per-civ AI personalities (aggressor/builder/diplomat)"`

🛑 **CHECKPOINT ENT-B:** Jogar 2 partidas com civs de IA diferentes → Vikings/
Mongóis devem pressionar militarmente; Gregos/Persas devem propor pactos e
evitar guerra. As civs precisam "sentir" diferentes.

---

### ENT-5 — Maravilhas do Mundo · **Opus** 🔴 🧠 (motor) + Sonnet (UI)

```
PARTE A (motor · Opus) — Adicionar Maravilhas: construções ÚNICAS globais.
Apenas UM jogador no mundo pode ter cada maravilha; a primeira construção
trava a maravilha para todos os outros. Efeito forte + pontos de placar.

Novo arquivo `packages/game-engine/src/wonders.ts`:
- ~6 maravilhas com id, nome, era requerida, custo de produção (alto: 80-150),
  efeito e bônus de pontuação. Sugestões (ajustar no design):
  - Grande Biblioteca (classical): +2 pesquisa de era/turno na cidade.
  - Coliseu (classical): +10 pontos de desenvolvimento fixos.
  - Grande Muralha (medieval): +5 defesa em TODAS as cidades do dono.
  - Jardins Suspensos (ancient): +30% comida em todas as cidades do dono.
  - Grande Farol (ancient): +1 movimento a unidades navais/costeiras (ou +1
    visão global se naval não existir — checar).
  - Sun Tzu / Academia Militar (medieval): -25% custo de treino militar.
- Catálogo em Map (padrão de `civilizations.ts`) + helpers de lookup.
- Estado: adicionar `wonders: BuiltWonder[]` em GameState (types.ts), cada um
  com wonderId, ownerId, cityId, builtAtTurn.
- Nova ação `buildWonder` (ou estender constructBuilding) com validação:
  maravilha ainda não construída por NINGUÉM (trava global), era alcançada,
  produção suficiente, cidade do jogador. applyAction deduz custo e registra.
- Integrar bônus em `scoring.ts` (pontos) e nos agregadores de economia/
  combate conforme o efeito (reusar o padrão dos aggregators de civ).
- Testes em `wonders.test.ts`: unicidade global (2º jogador é bloqueado),
  efeito aplicado, pontos no placar.

PARTE B (UI · Sonnet, prompt separado) — Na `CityModal`, aba/lista de
Maravilhas disponíveis: mostrar as não-construídas com custo e efeito; marcar
as já tomadas por outro jogador como "Construída por [civ]" (bloqueada);
botão Construir com o padrão pill existente. Ícone especial no mapa/cidade
que possui uma maravilha.

pnpm --filter @aetas/game-engine test

# 🔻 PARTE A mudou o motor → regenerar bundle e deployar o backend:
pnpm --filter @aetas/backend-core bundle
npx supabase functions deploy
```

✅ **Commit (A):** `"feat(ent-5a): World Wonders system (globally unique builds)"`
✅ **Commit (B):** `"feat(ent-5b): Wonders UI in CityModal + map marker"`

🛑 **CHECKPOINT ENT-C:** Construir uma maravilha numa partida; numa segunda
partida verificar que, quando a IA a constrói primeiro, o jogador vê
"bloqueada"; os pontos entram no placar ao vivo.

---

### ENT-6 — Eventos Mundiais · **Opus** 🔴 🧠

```
Adicionar surpresa e variabilidade: eventos que disparam ao longo da partida.
CRÍTICO — devem ser DETERMINÍSTICOS pela seed, para o desafio diário continuar
comparável entre jogadores (mesma seed = mesmos eventos nos mesmos turnos).

Novo arquivo `packages/game-engine/src/events.ts`:
- Reusar o PRNG seedado que `map.ts` já usa na geração procedural (localizar
  a função — provável mulberry32/splitmix). NÃO usar Math.random.
- Derivar a semente de cada turno de forma determinística:
  `rngForTurn(state.map.seed, state.turnNumber)`.
- ~3 tipos de evento (v1):
  - BÁRBAROS: spawn de unidade neutra hostil perto de uma cidade aleatória
    (hostil a todos; a IA já sabe reagir a ameaças adjacentes).
  - PRAGA: uma cidade aleatória perde 1 de população (mín. 1).
  - ERA DOURADA: um jogador (ou todos, decidir) ganha +20% de renda por 2-3
    turnos.
- Frequência baixa e previsível (ex.: chance por turno a partir do turno 5;
  ajustar por playtesting). Resolver os eventos como um passo em `turn.ts`
  (no fim do turno, antes de passar a vez), retornando um log do que ocorreu.
- Expor o log para a UI notificar (banner/toast "☄️ Bárbaros surgiram perto
  de [cidade]!"). Sem regra nova no cliente — só exibição.
- Testes em `events.test.ts`: MESMA seed + turno → MESMO evento (determinismo,
  é o requisito mais importante); praga nunca zera população; bárbaro nasce em
  hex válido (terreno não-água, dentro do mapa).

pnpm --filter @aetas/game-engine test

# 🔻 Mudou o motor → regenerar bundle e deployar o backend:
pnpm --filter @aetas/backend-core bundle
npx supabase functions deploy
```

✅ **Commit:** `"feat(ent-6): deterministic world events (barbarians/plague/golden age)"`

---

🛑 **CHECKPOINT ENT-FINAL:** Rodar o desafio diário DUAS vezes com a mesma
data/seed → os eventos, o mapa e as posições iniciais devem ser idênticos
(comparabilidade do diário preservada). Jogar uma partida completa usando
todas as mecânicas novas: placar ao vivo, dominação, custo de expansão
crescente, IAs com personalidades distintas, uma maravilha construída e ao
menos um evento disparado. Confirmar que nenhuma delas quebra o loop ou o
equilíbrio a ponto de tornar a partida trivial ou impossível.

> Após o CHECKPOINT ENT-FINAL, retomar a **FASE 5 (Android)** — a web ganha
> este bloco de profundidade antes de duplicar a UI em Kotlin.

---

## FASE 5 — Android nativo (Kotlin + Jetpack Compose)

**Arquitetura thin-client:** o motor de jogo roda 100% no servidor (Edge
Functions); o app Android é um cliente de apresentação que (1) autentica o
usuário via Google OAuth, (2) lê `game_state` do Supabase, (3) renderiza em
Jetpack Compose e (4) envia ações ao `submit-action` Edge Function.
Nenhuma regra de jogo é re-implementada no Android.

---

### PRÉ-REQUISITOS MANUAIS — faça você mesmo antes de iniciar os prompts

> ⚠️ Este checklist é executado por você, não pelo Claude Code.
> Confirme cada item antes de prosseguir para o prompt 5.1.

**1. Instalar Android Studio**
- Baixe a versão mais recente em: https://developer.android.com/studio
- Execute o instalador com as opções padrão (inclui JDK 17 embutido)
- Na primeira abertura, siga o "Android Studio Setup Wizard" até o fim
- Via **SDK Manager** (File → Settings → Android SDK ou ícone de engrenagem):
  - Aba "SDK Platforms": marque **Android 8.0 (API 26)** (mínimo) e **Android 15 (API 35)** (target)
  - Aba "SDK Tools": confirme que "Android Emulator" e "Android SDK Build-Tools" estão marcados

**2. Criar emulador (ou usar celular físico)**
- Opção A — Emulador: **Device Manager** (barra lateral) → "Create Virtual Device"
  → Pixel 8 → selecione API 35 (x86_64) → Finish → clique ▶ para iniciar
- Opção B — Celular físico (mais fiel ao comportamento real):
  1. Configurações → Sobre o telefone → toque 7× em "Número da versão" → ativa Opções do Desenvolvedor
  2. Configurações → Opções do Desenvolvedor → Depuração USB → ativar
  3. Conecte o USB e aceite a permissão "Permitir depuração USB" no celular
  4. No Android Studio o dispositivo aparece no seletor de run (triângulo ▶)

**3. Criar projeto Firebase (gratuito)**
- Acesse: https://console.firebase.google.com → "Adicionar projeto" → nome "Aetas"
- No painel do projeto: "Adicionar app" → ícone Android 🤖
  - Package name: `com.aetas.app` (anote: será o `applicationId` do Gradle)
  - Baixe o **google-services.json** — você colocará em `apps/android/app/`
- Ative o Firebase App Distribution: menu lateral Build → App Distribution → "Começar"

**4. Copiar variáveis do Supabase**
- Painel Supabase → Settings → API: copie `Project URL` e `anon public key`
- Guarde-as para usar como variáveis de build no passo 5.1

---

**5.1 — Scaffold do módulo Android + configuração thin-client** · Sonnet 🧠

```
Crie apps/android/ como módulo Gradle nativo (Kotlin DSL). Arquitetura
thin-client: toda lógica de jogo fica nas Edge Functions; o app renderiza
GameState e submete ações via Supabase Kotlin SDK.

ESTRUTURA:
  apps/android/
    app/
      build.gradle.kts
      google-services.json     (no .gitignore — dev coloca manualmente)
      src/main/
        AndroidManifest.xml
        java/com/aetas/app/
          AetasApplication.kt  (Hilt Application)
          MainActivity.kt      (NavHost: Auth → GameList → Game)
          ui/
            auth/   (AuthScreen.kt, AuthViewModel.kt)
            list/   (GameListScreen.kt, GameListViewModel.kt)
            game/   (GameScreen.kt, GameViewModel.kt)
          data/
            SupabaseClient.kt  (singleton com URL/Key via BuildConfig)
            GameRepository.kt  (fetch game_state + submit-action)
          model/
            GameSession.kt     (data class: id, gameState: JsonObject, updatedAt)
    build.gradle.kts
    settings.gradle.kts
    gradle.properties
    local.properties           (no .gitignore — contém SUPABASE_URL e ANON_KEY)

DEPENDÊNCIAS principais (build.gradle.kts do app):
  - io.github.jan-tennert.supabase:postgrest-kt
  - io.github.jan-tennert.supabase:auth-kt
  - io.github.jan-tennert.supabase:realtime-kt
  - io.github.jan-tennert.supabase:compose-auth-ui
  - androidx.compose.ui:ui + material3
  - androidx.navigation:navigation-compose
  - com.google.dagger:hilt-android + hilt-compiler

SUPABASE_URL e SUPABASE_ANON_KEY: lidos de local.properties via gradle e
injetados como BuildConfig.SUPABASE_URL / SUPABASE_ANON_KEY. Adicione
local.properties ao .gitignore.

Confirme que `./gradlew :app:assembleDebug` compila sem erros.
```

✅ **Commit:** `"feat(android): scaffold Kotlin/Compose thin-client"`

---

**5.2 — Autenticação Google via Supabase Kotlin** · Sonnet

```
Em apps/android/, implemente a tela de login com Google OAuth.

1. SupabaseClient.kt: inicialize com BuildConfig.SUPABASE_URL e ANON_KEY.
   Instale plugins: Auth, Postgrest, Realtime.

2. AuthScreen.kt (Compose): botão "Entrar com Google" centralizado.
   Use o composable GoogleButton do supabase compose-auth-ui, ou construa
   manualmente com um OutlinedButton + ícone do Google (Material Icons).
   Enquanto carrega: CircularProgressIndicator.

3. AuthViewModel.kt:
     supabase.auth.signInWith(Google)
   Após sucesso: navegue para GameListScreen via navController.

4. Persista a sessão: configure o SessionManager do supabase-kt para usar
   SharedPreferences (sessão sobrevive a restart do app).

5. MainActivity.kt: ao abrir, verifique supabase.auth.currentSessionOrNull()
   — se válida, vá direto para GameListScreen sem mostrar AuthScreen.

6. TopAppBar da GameListScreen: ícone de logout (ExitToApp) → chama
   supabase.auth.signOut() e retorna para AuthScreen.

Confirme: (a) clique no botão abre picker de conta Google, (b) após escolher
a conta a sessão é salva e o app vai para GameListScreen, (c) reabrir o app
mantém o login sem pedir credenciais novamente.
```

✅ **Commit:** `"feat(android): Google OAuth via Supabase Auth Kotlin"`

---

**5.3 — GameListScreen (lista de partidas ativas)** · Sonnet

```
Implemente a tela de lista de partidas em apps/android/.

GameRepository.kt — fetchMyGames():
  - Consulte a view/tabela `game_sessions` no Supabase com .from("game_sessions")
    .select("id, game_state, updated_at").
  - Filtre no cliente: game_state.players deve conter o userId do usuário logado
    (supabase.auth.currentUserOrNull()?.id).
  - Exponha como Flow<List<GameSession>> usando Realtime subscription na tabela
    game_sessions (filtre por id dos jogos do usuário).

GameListViewModel.kt:
  - StateFlow<GameListUiState> (Loading | Success(games) | Error).
  - Colete o Flow do repository e exponha ao composable.

GameListScreen.kt:
  - LazyColumn de cards. Cada card mostra:
    · "vs [nomes dos oponentes]" — extraia de game_state.players (filtre o próprio userId)
    · Chip "Seu turno" (verde) ou "Vez de [nome]" — compare currentPlayerId com myId
    · Timestamp relativo da última atualização (ex: "há 2h")
  - Swipe-to-refresh (PullToRefreshBox do Material 3).
  - FAB "+" para novo jogo (stub: navega para CreateGameScreen futura).
  - Ao clicar num card: navegar para GameScreen(gameId).

Confirme: partidas do usuário aparecem, atualizam via Realtime sem reload
manual, e toque num card navega corretamente.
```

✅ **Commit:** `"feat(android): GameListScreen com Realtime"`

---

**5.4 — GameScreen: HexMap em Canvas, ResourceBar e ações** · **Opus** 🔴 🧠

```
Implemente a tela principal de jogo. A peça mais complexa: mapa hex
interativo desenhado em Compose Canvas. Planeje antes de codar.

Leia antes de escrever qualquer linha:
  - apps/web/src/components/HexMap.tsx (toda a matemática hex já está lá)
  - packages/game-engine/src/map.ts (hexKey, hexDistance)
  - O GameState JSON: map.tiles, units, cities, players, currentPlayerId, era

COMPONENTE HexMap (@Composable + Canvas):
  Matemática pointy-top hex (idêntica à web):
    fun hexToPixel(q: Int, r: Int, size: Float): Offset {
      return Offset(
        x = size * (sqrt(3f) * q + sqrt(3f) / 2f * r),
        y = size * (3f / 2f * r)
      )
    }
  Para cada tile: desenhe um Path hexagonal (6 pontos).
  Cores: Plains=verde escuro, Forest=verde, Hills=marrom, Mountain=cinza, Water=azul.
  Unidades: círculo colorido com inicial do tipo (W=warrior, etc).
  Cidades: quadrado no centro do hex + minibarra de HP abaixo.
  Toque em hex: seleciona (estado local selectedHex).
  Segundo toque em hex adjacente com unidade selecionada → chama submitAction(moveUnit).
  Pan e zoom: Modifier.transformable(rememberTransformableState { scale, offset, _ -> ... }).

RESOURCEBAR (topo, Row):
  🏅{gold} 🌾{food} ⚙{production} 🗡{unitCount}·-{maintenance}g
  Texto de manutenção em vermelho se gold < maintenance.

PLAYERBAR (rodapé, LazyRow):
  Chip por jogador: cor da civ + displayName + ícones ⚔/🏛.
  Borda esquerda colorida no jogador ativo.

AÇÕES:
  - "Fim de Turno" Button no canto inferior direito, habilitado apenas quando
    currentPlayerId == myId (supabase.auth.currentUserOrNull()?.id).
  - submitAction(action: Map<String, Any>):
      supabase.functions.invoke("submit-action",
        body = mapOf("gameId" to gameId, "action" to action))
  - Após sucesso, o Realtime subscription atualiza o GameState automaticamente.

GameViewModel.kt:
  - StateFlow<GameUiState> com o gameState atual e selectedHex.
  - loadGame(gameId): busca game_state inicial + subscribe Realtime.
  - submitAction(action): chama Edge Function, trata erro com snackbar.

Confirme: você consegue mover unidade, encerrar turno, a IA responde e o
estado atualiza no app em tempo real.
```

✅ **Commit:** `"feat(android): GameScreen HexMap Canvas + ResourceBar + ações"`

🛑 **CHECKPOINT 5.4:** Jogue uma partida solo vs IA no emulador ou celular físico:
- Login Google funciona
- HexMap renderiza corretamente (tiles coloridos, unidades, cidades)
- Mover unidade e encerrar turno funcionam
- A IA responde no próximo End Turn
- Sem crash em 5 turnos consecutivos

---

**5.5 — Distribuição via Firebase App Distribution (sem conta Google Play)** · Sonnet

```
Configure o Firebase App Distribution para distribuir o APK de testes
gratuitamente, sem precisar da conta de dev do Google Play.

1. Em apps/android/app/build.gradle.kts, adicione o plugin Firebase:
     id("com.google.firebase.appdistribution") version "5.0.0"
   Na seção buildTypes > release:
     firebaseAppDistribution {
       artifactType = "APK"
       releaseNotes = "Build de teste — Aetas"
       testers = "seuemail@gmail.com"  // substitua pelo seu e-mail
     }

2. No build.gradle.kts raiz (plugins block):
     id("com.google.firebase.appdistribution") version "5.0.0" apply false

3. Para distribuir, rode no terminal (na raiz do monorepo):
     cd apps/android
     ./gradlew :app:assembleRelease appDistributionUploadRelease
   Você receberá um e-mail com link de instalação.
   (Para App Distribution, o APK de release não precisa de keystore configurado
   ainda — o Firebase aceita APK não-assinado para testes internos.)

4. Crie docs/DISTRIBUTE_ANDROID.md com instruções completas:
   - Como gerar o APK de teste (comando acima)
   - Como adicionar testadores no Firebase Console (App Distribution → Testadores)
   - Como o testador instala: clica no link do e-mail, instala o app Firebase
     no celular, e a partir daí recebe atualizações automáticas
   - Diferença entre App Distribution (testes, gratuito) e Google Play (produção, pago)
   - Quando faz sentido migrar: quando você tiver >10 testadores ou quiser
     distribuição pública

Confirme: você recebe o e-mail do Firebase e consegue instalar o APK
no celular clicando no link.
```

✅ **Commit:** `"feat(android): Firebase App Distribution configurado"`

🛑 **CHECKPOINT 5.5 — ANDROID FUNCIONAL (via App Distribution):**
Instale o APK via link do Firebase no seu celular físico (não emulador).
Confirme:
- Login Google funciona no APK de release (não só debug)
- Lista de partidas carrega via Supabase
- HexMap e ações funcionam sem crash
- Realtime updates chegam sem refresh manual
Só avance para a Fase 6 (Google Play) quando este checkpoint passar.

---

## FASE 6 — Publicação no Google Play

Esta fase requer a conta de desenvolvedor Google Play (US$25, taxa única,
em play.google.com/console). Você pode atrasar indefinidamente enquanto
distribui via Firebase App Distribution (Fase 5.5).

---

**6.0 — Política de Privacidade via GitHub Pages** · Haiku

```
Gere docs/privacy-policy.html com política de privacidade adequada para
o Aetas, considerando:
  - Coleta: nome e e-mail via Google OAuth (identificação do jogador)
  - Armazenamento: estado de jogo no Supabase (Postgres — confirme a região
    no painel Supabase Settings → Infrastructure → Region)
  - Não coleta: localização, contatos, câmera, microfone
  - Terceiros: Google Sign-In (sujeito à política do Google)
  - Retenção: dados excluídos mediante solicitação via e-mail de suporte

A política deve:
  - Ser em português (adicione seção em inglês ao final)
  - Ter seções claras: "Dados coletados", "Como usamos", "Terceiros",
    "Seus direitos (LGPD — Lei 13.709/2018)", "Contato"
  - Incluir e-mail de suporte: [substitua pelo seu e-mail]
  - Ser HTML standalone (sem dependências externas) para hospedar no GitHub Pages

Crie também docs/SETUP_GITHUB_PAGES.md com o passo a passo:
  1. No repositório GitHub: Settings → Pages → Source: "Deploy from branch"
     → Branch: main → Folder: /docs → Save
  2. Aguarde 1–2 min; a URL será:
     https://[seuusuario].github.io/aetas/privacy-policy.html
  3. Confirme que a URL abre e o conteúdo aparece
  4. Guarde esta URL — será obrigatória no Google Play Console (passo 6.3)
     e também pode ser usada no App Store Connect (Fase 8)
```

✅ **Commit:** `"docs: privacy policy HTML + GitHub Pages setup guide"`

---

**6.1 — Conta de dev + Keystore + build de produção (.aab)** · Sonnet

```
Configure o build de produção Android para submissão ao Google Play.

PRÉ-REQUISITO HUMANO (faça antes de rodar este prompt):
  - Crie a conta em play.google.com/console e pague US$25.
  - Crie o app no Console: "Criar aplicativo" → nome "Aetas" → Jogo → Português.

1. Geração do keystore — rode você mesmo no terminal (Claude não gera chaves):
     keytool -genkey -v -keystore aetas-release.jks \
       -alias aetas -keyalg RSA -keysize 2048 -validity 10000
   CRÍTICO: guarde aetas-release.jks e as senhas num gerenciador de senhas.
   Perder o keystore = impossível atualizar o app no Google Play para sempre.
   Adicione aetas-release.jks ao .gitignore imediatamente.

2. Crie apps/android/keystore.properties (também no .gitignore):
     storeFile=../../aetas-release.jks
     storePassword=SUA_SENHA_KEYSTORE
     keyAlias=aetas
     keyPassword=SUA_SENHA_KEY

3. Em apps/android/app/build.gradle.kts, configure a assinatura de release:
     signingConfigs {
       create("release") {
         val props = Properties()
         props.load(rootProject.file("keystore.properties").inputStream())
         storeFile = file(props["storeFile"] as String)
         storePassword = props["storePassword"] as String
         keyAlias = props["keyAlias"] as String
         keyPassword = props["keyPassword"] as String
       }
     }
     buildTypes {
       release { signingConfig = signingConfigs.getByName("release") }
     }

4. Gere o .aab assinado:
     ./gradlew :app:bundleRelease
   Confirme que aparece em: app/build/outputs/bundle/release/app-release.aab

5. Crie docs/BUILD_ANDROID.md com o passo a passo completo para um dev fresh:
   geração do keystore, configuração do local.properties, comando de build,
   e onde encontrar o .aab gerado.
```

✅ **Commit:** `"feat(android): build de produção + keystore configurado"`

---

**6.2 — CI/CD Android via GitHub Actions** · Sonnet 🧠

```
Crie .github/workflows/android-release.yml: workflow que gera o .aab
assinado automaticamente.

Trigger: workflow_dispatch (manual) OU push para branch release/android.

Etapas:
  1. actions/checkout
  2. actions/setup-java: distribution=temurin, java-version=17
  3. Restaurar keystore a partir do secret KEYSTORE_BASE64:
       echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 -d > aetas-release.jks
  4. Criar keystore.properties com os valores dos secrets
  5. Criar local.properties com SUPABASE_URL e SUPABASE_ANON_KEY
  6. ./gradlew :app:bundleRelease
  7. actions/upload-artifact: path=apps/android/app/build/outputs/bundle/release/

Secrets necessários (documente no workflow E em docs/BUILD_ANDROID.md):
  KEYSTORE_BASE64       — base64 do .jks: base64 -i aetas-release.jks (macOS/Linux)
                          Ou no PowerShell: [Convert]::ToBase64String([IO.File]::ReadAllBytes("aetas-release.jks"))
  KEYSTORE_PASSWORD     — senha do keystore
  KEY_ALIAS             — alias da chave (aetas)
  KEY_PASSWORD          — senha da chave
  SUPABASE_URL          — URL do projeto Supabase
  SUPABASE_ANON_KEY     — anon key do Supabase

Não configure upload automático para o Play Console neste prompt — o .aab
gerado pelo CI será submetido manualmente via drag-and-drop no Play Console.
```

✅ **Commit:** `"ci: GitHub Actions para build .aab Android de produção"`

---

**6.3 — Checklist de submissão ao Google Play Console** · Sonnet

```
Gere docs/PUBLISH_ANDROID.md com o checklist completo de publicação no
Google Play, estruturado em 5 seções:

1. TESTES INTERNOS PRIMEIRO (sem revisão da Google, instantâneo):
   - Play Console → Testes → Testes internos → Criar release → Upload do .aab
   - Adicione seu e-mail como testador interno
   - Instale via link do Play Console (não APK) e confirme que funciona
   - Só promova para produção após validar completamente aqui

2. METADADOS DA LOJA:
   - Título: "Aetas" (max 30 chars)
   - Descrição curta: max 80 chars — ex: "Civ-like assíncrono. Construa impérios, domine eras."
   - Descrição longa: max 4000 chars (use GAME_DESIGN.md como base)
   - Screenshots: mínimo 2, tamanho 16:9 ou 9:16 (Ctrl+S no emulador Android Studio)
   - Ícone: 512×512px PNG sem transparência
   - Feature graphic: 1024×500px (use Canva ou GIMP)

3. POLÍTICA DE PRIVACIDADE:
   - Cole a URL do GitHub Pages gerada na Fase 6.0

4. CLASSIFICAÇÃO ETÁRIA:
   - Questionário IARC dentro do Play Console (~5 min)
   - Aetas não tem violência realista, conteúdo adulto ou compras in-app
   - Classificação esperada: Livre ou 12+

5. MOTIVOS COMUNS DE REJEIÇÃO (jogos multiplayer + login social):
   - App não funciona no emulador (teste em API 26, 30 e 35)
   - Política de privacidade inacessível, expirada ou não cobre dados coletados
   - Permissões declaradas no AndroidManifest sem uso real no app
   - Crash na inicialização (teste com Google Play Pre-launch report)
   - Login social sem fluxo de "skip" visível (o Google exige alternativa ao OAuth)

Inclua também: como usar squoosh.app para redimensionar imagens
gratuitamente no browser.
```

✅ **Commit:** `"docs: PUBLISH_ANDROID.md + checklist Google Play"`

🛑 **CHECKPOINT DE PUBLICAÇÃO ANDROID — não pule.**
Antes de promover para produção: publique no canal de **testes internos** do
Play Console. Instale no seu celular via Play Store (não APK). Confirme:
- OAuth com Google funciona no build de produção (diferente do debug)
- Realtime Supabase funciona (updates chegam via WebSocket)
- Sem crash em 5 turnos consecutivos
- Política de privacidade acessível pelo link cadastrado
(não só no emulador), e que as notificações Realtime chegam. Só aí promova
para produção.

---

## FASE 7 — iOS nativo (Swift/SwiftUI)

**Requer macOS.** Xcode só compila iOS em macOS — restrição de plataforma
da Apple sem contorno no Windows. Opções quando estiver pronto:
- **Mac físico** (comprar, pedir emprestado) — melhor experiência de debug.
- **Codemagic** (cloud CI com runner macOS) — build e assinatura remotos,
  sem Mac. Detalhado na Fase 8.
- **MacStadium / MacinCloud** (acesso remoto via VNC) — semelhante ao Mac
  local, custo mensal.

Execute esta fase quando tiver acesso a um Mac. A numeração 7 reflete a
ordem real de execução: Android (5) → Google Play (6) → **iOS (7)**.

---

**7.1 — Scaffold e autenticação iOS** · Sonnet

```
Crie apps/ios/ como projeto Swift/SwiftUI com Supabase Auth.
Configure Google Sign-In + Apple Sign-In (obrigatório pela Apple quando
qualquer outro OAuth existe). Tela de lista de partidas conectada ao
Supabase via supabase-swift. Siga docs/GLOSSARY.md para nomenclatura.
```

**7.2 — Mapa hex e telas de jogo iOS** · Sonnet 🧠

```
Reimplemente o HexMap em SwiftUI Canvas (mesma matemática pointy-top da web:
hex_to_pixel com sqrt(3)*q para x e 3/2*r para y). Telas equivalentes à
Fase 4 web: ResourceBar, PlayerBar, ações (moveUnit, endTurn). A lógica
fica sempre nas Edge Functions — o client iOS nunca decide um resultado.
Leia apps/web/src/components/HexMap.tsx para a matemática de referência.
```

**7.3 — Distribuição via TestFlight** · Sonnet

```
Configure a assinatura de release (Provisioning Profile + certificado de
distribuição) e o upload para App Store Connect via Transporter ou xcrun altool.
Adicione pelo menos 1 testador interno no TestFlight e confirme que o build
chega. Documente o processo em docs/PUBLISH_IOS.md.
```

✅ **Commit:** `"feat(ios): scaffold Swift/SwiftUI + auth + telas principais"`

🛑 **CHECKPOINT iOS:** Jogue uma partida completa via TestFlight no iPhone
antes de submeter para a App Store.

---

## FASE 8 — Publicação na App Store (iOS)

Requer conta Apple Developer (US$99/ano) e resolve o build remoto via
Codemagic — sem Mac físico necessário para o pipeline de CI.

**PRÉ-REQUISITOS MANUAIS:**
- Crie a conta em developer.apple.com e assine o contrato de desenvolvedor
- No App Store Connect: crie o app "Aetas" com bundle ID `com.aetas.app`
- Crie certificados de distribuição e provisioning profiles via portal web
  da Apple (o Codemagic tem guia passo a passo para fazer sem Mac)
- Política de privacidade: use a mesma URL do GitHub Pages (Fase 6.0)
- Screenshots: use o simulador iOS no Codemagic ou squoosh.app para redimensionar

**8.1 — Build de produção iOS** · Sonnet

```
Em apps/ios/, configure Info.plist para a App Store:
- Remova TODA permissão não usada (câmera, localização, microfone — o Aetas
  não usa nenhuma; a Apple rejeita declarações sem uso)
- Configure CFBundleShortVersionString e CFBundleVersion para o CI incrementar
- Valide que o app não usa APIs privadas da Apple
- Documente em docs/PUBLISH_IOS.md cada campo configurado e o motivo
```

**8.2 — Pipeline CI/CD iOS via Codemagic** · Sonnet 🧠

```
Crie codemagic.yaml na raiz do repositório:
- Instância: mac_mini_m2
- Trigger: workflow_dispatch ou push para release/ios
- Etapas: instalar deps Swift, compilar, assinar via Codemagic Code Signing
  (credenciais no painel Codemagic — não no repo), exportar .ipa, upload ao
  App Store Connect via altool
- Variáveis necessárias: APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_KEY_ID,
  APP_STORE_CONNECT_PRIVATE_KEY + credenciais de assinatura
- Inclua XCTest antes do build de produção
```

**8.3 — Checklist de submissão App Store** · Sonnet

```
Expanda docs/PUBLISH_IOS.md com:
- Verificar build no TestFlight (pode demorar 15-30 min após upload)
- Testar Sign in with Apple E Sign in with Google no build de produção
  (Apple exige Sign in with Apple quando qualquer outro OAuth existe)
- Preencher metadados: título, subtítulo, keywords (11 palavras), URL de
  privacidade, classificação etária, screenshots obrigatórios
- Motivos comuns de rejeição: permissões não declaradas, crash no launch,
  funcionalidade quebrada sem internet, falta de Sign in with Apple
- Planejar 1-7 dias úteis de revisão por atualização
```

🛑 **CHECKPOINT DE PUBLICAÇÃO iOS:** Distribua via TestFlight para 2-3
dispositivos reais. Confirme OAuth (ambos provedores), Realtime Supabase e
zero crash. A revisão da Apple é cara de reprovar — teste bem antes.

✅ **Commit:** `"pipeline iOS (Codemagic) + docs App Store"`

---

**T.1 — Slash command de teste** · Haiku
```
Crie .claude/commands/testar.md: roda pnpm --filter @aetas/game-engine test
e exibe o resumo de passes/failures.
```

**T.2 — Subagent revisor de concorrência** 🔴
```
Crie .claude/agents/revisor-concorrencia.md: subagent Opus que revisa
mudanças em turn.ts, combat.ts e nas Edge Functions de orquestração,
procurando condições de corrida e estados inconsistentes — os pontos mais
caros de errar neste projeto.
```

---

### Lembrete final

**Ordem completa de execução:**
```
0 → 1 ✅ → 1.5 ✅ → 2 ✅ → 3 ✅ → 4 ✅ → 4.5 (A/B/C/D/E) ✅
→ 5 (Android) → 6 (Google Play) → 7 (iOS, quando tiver Mac) → 8 (App Store)
```

**Estado atual:** Fases 0–4 + Bloco 4.5 E1–E8 + UI-T1/T2/T3 commitados e deployados. Engine balanceado, cidades com level-up, visual romano base entregue.
**Próximo:** BLOCO BAL ✅ concluído (BAL-1 a BAL-5). Agora BLOCO ENT →
ENT-1 (placar ao vivo · Sonnet) → ENT-2 (vitória por dominação · **Opus** 🔴) →
🛑 CHECKPOINT ENT-A → ENT-3 (custo crescente de expansão · Sonnet) →
ENT-4 (personalidade de IA por civ · **Opus** 🔴) → 🛑 CHECKPOINT ENT-B →
ENT-5 (Maravilhas do Mundo · **Opus** 🔴 motor + Sonnet UI) → 🛑 CHECKPOINT ENT-C →
ENT-6 (Eventos Mundiais determinísticos · **Opus** 🔴) → 🛑 CHECKPOINT ENT-FINAL →
Fase 5 Android
(comece pelos PRÉ-REQUISITOS MANUAIS de cada UI-V, depois pelos da Fase 5).

**Quatro regras que não mudam:**
1. **AskUserQuestions é obrigatório** antes de decisão de design não coberta.
2. **Sonnet 5 é o padrão.** Opus 4.8 só nos prompts 🔴; Haiku 4.5 em docs;
   Fable 5 só como escalação de exceção (bug de concorrência encravado).
3. **Mudou o `game-engine`? Regenere o bundle e deploye as Edge Functions**
   (`pnpm --filter @aetas/backend-core bundle && npx supabase functions deploy`)
   — senão a regra nova roda só nos testes, nunca em produção.
4. **Checkpoints não são opcionais** — cada um existe porque o custo de um
   bug descoberto tarde é multiplicado pelo número de UIs a corrigir.

**Lembretes práticos de publicação:**
- **Keystore Android:** guarde fora do repo — perder = não atualizar mais.
- **Política de privacidade (GitHub Pages):** gere antes de abrir a conta Play.
- **App Distribution (Firebase):** distribua sem custo enquanto valida o app.
- **iOS sem Mac:** use Codemagic (Fase 8) — build e assinatura na nuvem.
- **App Store:** revisão leva 1–7 dias úteis; planeje com margem.

