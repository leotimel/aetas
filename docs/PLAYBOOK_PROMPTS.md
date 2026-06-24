# Playbook de prompts — Aetas

Sequência de prompts para o **Claude Code**, seguindo a ordem de risco
decrescente travada na arquitetura: motor + backend → cliente de debug →
web jogável → Android → iOS.
Anexe `GAME_DESIGN.md` e `ARCHITECTURE.md` na primeira mensagem.

**Estado atual (nesta revisão):** Fases 0–4 e 4.5 Blocos A/B completas. Motor, backend, debug-client e toda a web jogável implementados (design system, sprites, texturas, movimento, combate, diplomacia, eras, pontuação, fim de partida).
O próximo bloco é o **Bloco B-Extra** — execute nesta ordem: BX4 → BX5 → BX1 → BX2 → BX3 → BX6. Precedido de 🛑 CHECKPOINT DE JOGABILIDADE com 2 contas reais.
Só após BX6 (deploy Vercel) e o Bloco C seguir para Android (Fase 5).

## Como usar este playbook

- **Um prompt por vez.** Revise o diff antes do próximo.
- **🤔 AskUserQuestions é regra:** qualquer decisão de design, UX ou
  arquitetura não coberta neste playbook DEVE ser resolvida via perguntas
  ao usuário antes de codar — nunca assuma. Se o Claude Code iniciar uma
  sessão nova, pergunte antes de partir para código.
- **Modelo sugerido em cada prompt** (regra): comece em **Sonnet 4.6**
  (daily driver); troque para **Opus 4.8** só em prompts marcados 🔴
  (estado distribuído, concorrência, algoritmos complexos). Nunca troque
  o projeto inteiro de modelo — troque o prompt específico.
- **Rode os testes** (`npx vitest run` no `game-engine`) depois de cada
  mudança em regras de jogo.
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

## FASE 5 — Android nativo (Kotlin)

**Nota:** dado que você não tem Mac (ver bloco no início da Fase 5), execute
esta fase ANTES da Fase 5 na prática — Android não tem a restrição de
plataforma do iOS. A numeração das fases ficou como estava no documento
original só para não quebrar as referências cruzadas; siga a ordem real:
Fase 0 → 1 → 1.5 → 2 → 3 → 4 → **6 (Android)** → 5 (iOS, quando houver Mac).

**6.1 a 6.3 — Espelham a Fase 5**
```
Repita a Fase 5 em Kotlin/Jetpack Compose, usando o SDK Supabase para
Kotlin, seguindo o mesmo GLOSSARY.md.
```

✅ **Commit:** "Android completo".

---

## FASE 6 — Publicação no Google Play

Pode ser executada logo após a Fase 6. Não requer Mac. Requer apenas uma
conta de desenvolvedor no Google Play Console (US$ 25, taxa única).

**Pré-requisitos manuais (faça você mesmo antes dos prompts):**
- Crie a conta em play.google.com/console e pague a taxa de US$ 25.
- Crie uma política de privacidade (pode ser uma página simples em GitHub
  Pages ou no próprio site do jogo) — o Google exige o link.
- Prepare screenshots do app Android (mínimo 2, tamanho 16:9 ou 9:16),
  ícone 512×512px e um feature graphic 1024×500px.

**7.1 — Configuração de build de produção Android** · Sonnet
```
Em apps/android/, configure o build de produção para o Google Play:
- Gere e documente o processo de criação do keystore de assinatura (arquivo
  .jks) com keytool. IMPORTANTE: inclua instruções claras de que esta chave
  deve ser guardada em local seguro — perder o keystore impede atualizações
  futuras do app. Nunca commite o keystore no repositório.
- Configure o arquivo keystore.properties (no .gitignore) e o build.gradle
  para ler as credenciais de assinatura de variáveis de ambiente.
- Gere um build .aab (Android App Bundle) assinado com `./gradlew
  bundleRelease`. Valide que o .aab é gerado em app/build/outputs/bundle/.
- Adicione ao README da pasta android/ as instruções passo a passo de como
  um dev fresh gera o .aab de produção sem perder nada.
```

**7.2 — Pipeline CI/CD Android (GitHub Actions)** · Sonnet 🧠
```
Crie .github/workflows/android-release.yml: um workflow que dispara
manualmente (workflow_dispatch) ou em push para a branch `release/android`.
O workflow deve: instalar Java e o SDK Android, ler as credenciais do
keystore via GitHub Secrets (KEYSTORE_BASE64, KEYSTORE_PASSWORD,
KEY_ALIAS, KEY_PASSWORD), gerar o .aab assinado, e fazer upload como
artifact do GitHub Actions. Não configure upload automático para o Play
Console ainda — só gerar o .aab via CI já é suficiente para a primeira
submissão manual. Documente quais secrets precisam ser cadastrados no
repositório do GitHub (com os nomes exatos).
```

**7.3 — Checklist de submissão manual** · Sonnet
```
Gere um arquivo docs/PUBLISH_ANDROID.md com o checklist completo de
submissão para o Google Play Console:
- Criar o app no Console (nome, categoria, classificação etária).
- Upload do .aab gerado pelo CI no canal de testes internos primeiro.
- Preencher os metadados da loja (título, descrição curta, descrição longa
  — tudo em português, com versão em inglês se quiser distribuição global).
- Upload de screenshots e feature graphic.
- Configurar política de privacidade (link obrigatório).
- Revisar e publicar no canal de produção.
Liste também os motivos mais comuns de rejeição no Google Play e como
evitá-los para um jogo multiplayer com login social.
```

🛑 **CHECKPOINT DE PUBLICAÇÃO ANDROID — não pule.**
Antes de submeter para produção: publique no canal de **testes internos** do
Play Console (você consegue testar com até 100 e-mails cadastrados sem
revisão da Google). Instale no seu próprio Android, jogue uma partida
completa, confirme que o OAuth com Google funciona no build de produção
(não só no emulador), e que as notificações Realtime chegam. Só aí promova
para produção.

✅ **Commit:** "pipeline Android + docs de publicação".

---

## FASE 7 — iOS nativo (Swift/SwiftUI)

**Nota: você não tem Mac.** Xcode (necessário para compilar, testar e
depurar iOS) só roda em macOS — isso não tem contorno via Claude Code, é uma
restrição de plataforma da Apple. As opções reais, do mais simples ao mais
caro:

1. **Adiar a Fase 5** até ter acesso a um Mac (comprar usado, pedir
   emprestado, etc.) — a opção mais simples, e razoável dado que Android
   (Fase 6) não tem essa restrição e pode vir antes.
2. **Mac na nuvem** (ex: MacStadium, GitHub Actions com runner macOS,
   Codemagic, ou serviços similares de "Mac em nuvem") — paga por uso/
   assinatura, permite compilar e rodar testes via CI sem possuir o
   hardware, mas a experiência de debug interativo (breakpoints, simulador
   ao vivo) é mais limitada que local.
3. **MacinCloud ou similar** (acesso remoto a um Mac físico via VNC) — mais
   parecido com ter o Mac de verdade, custo mensal.

**Recomendação para este projeto:** inverta a ordem — faça **Android
primeiro (Fase 6 → vira Fase 5)**, já que Kotlin/Android Studio rodam em
Windows/Linux sem restrição. Deixe iOS por último, e decida o caminho (Mac
próprio, nuvem, ou adiar) com mais folga, sem bloquear o progresso do projeto
agora.

Os prompts abaixo continuam organizados como "Fase 5 = iOS", mas trate como
**a fase que vem depois do Android**, não antes, dado o bloqueio.

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

## FASE 8 — Publicação na App Store (iOS)

Esta fase requer uma conta de desenvolvedor Apple (US$ 99/ano) e resolve o
problema do Mac via pipeline de CI na nuvem (Codemagic). Você não precisa
de um Mac físico para submeter o app — o build e a assinatura rodam nos
servidores do Codemagic.

**Pré-requisitos manuais (faça você mesmo antes dos prompts):**
- Crie a conta em developer.apple.com e assine o contrato de desenvolvedor.
- No App Store Connect (appstoreconnect.apple.com), crie o app com o nome
  "Aetas" e o bundle ID (ex: `com.seudominio.aetas`).
- Crie os certificados de distribuição e provisioning profiles no portal de
  desenvolvedor Apple — o Codemagic tem um guia específico pra fazer isso
  sem Mac, usando o portal web da Apple diretamente.
- Prepare screenshots no tamanho exato do iPhone mais recente (o App Store
  Connect especifica os tamanhos aceitos — use um simulador online ou o
  próprio Codemagic pra gerar).
- Crie a política de privacidade (mesma URL usada no Android serve).

**8.1 — Configuração de build de produção iOS** · Sonnet
```
Em apps/ios/, configure o build de produção para a App Store:
- Ajuste o Info.plist com as permissões corretas (o jogo usa câmera?
  localização? se não, remova qualquer permissão não utilizada — a Apple
  rejeita apps que declaram permissões sem justificativa).
- Configure o Bundle ID e a versão (CFBundleShortVersionString e
  CFBundleVersion) de forma que o CI possa incrementar automaticamente.
- Documente em docs/PUBLISH_IOS.md o que cada campo do Info.plist significa
  e por que foi configurado assim.
- Valide que o app não usa nenhuma API privada da Apple (a revisão rejeita
  automaticamente por uso de APIs não-públicas).
```

**8.2 — Pipeline CI/CD iOS via Codemagic** · Sonnet 🧠
```
Crie codemagic.yaml na raiz do repositório configurando o pipeline de build
iOS para o Codemagic:
- Instância: mac_mini_m2 (ou equivalente disponível no Codemagic).
- Trigger: manual ou push para `release/ios`.
- Etapas: instalar dependências Swift, compilar o app, assinar com os
  certificados da Apple (via Codemagic Code Signing — as credenciais ficam
  no painel do Codemagic, não no repositório), exportar o .ipa, e fazer
  upload automático para o App Store Connect via altool/xcrun.
- Documente quais variáveis de ambiente precisam ser cadastradas no
  Codemagic (APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_KEY_ID,
  APP_STORE_CONNECT_PRIVATE_KEY, e as credenciais de assinatura).
Inclua no codemagic.yaml o passo de teste unitário (XCTest) antes do build
de produção — não submeta para a App Store sem ao menos os testes básicos
passando no CI.
```

**8.3 — Checklist de submissão manual** · Sonnet
```
Expanda docs/PUBLISH_IOS.md com o checklist completo de submissão:
- Verificar no App Store Connect que o build subido pelo Codemagic aparece
  na seção "TestFlight" (pode demorar 15-30 min após o upload).
- Testar via TestFlight em pelo menos 1 dispositivo real antes de submeter
  para revisão — confirmar que o Sign in with Apple funciona no build de
  produção, e que o Sign in with Google também (o Aetas tem ambos, e a
  Apple exige Sign in with Apple se qualquer outro provedor social existe).
- Preencher os metadados no App Store Connect: título, subtítulo, descrição,
  keywords (11 palavras-chave), URL de suporte, URL de privacidade,
  classificação etária, screenshots obrigatórios.
- Submeter para revisão e documentar as respostas comuns de rejeição para
  jogos multiplayer (permissões, GameKit, etc.) e como resolvê-las.
- Notar que cada atualização futura passa por revisão novamente — planejar
  releases com margem de 3-7 dias úteis para a revisão da Apple.
```

🛑 **CHECKPOINT DE PUBLICAÇÃO iOS — não pule.**
Antes de submeter para revisão da Apple: distribua via TestFlight para pelo
menos 2-3 pessoas (você mesmo em dispositivos diferentes conta). Jogue uma
partida multiplayer completa via TestFlight, confirme OAuth funcionando,
notificações chegando, e que nenhuma tela mostra crash ou estado inválido.
A revisão da Apple é a mais cara de reprovar — um ciclo de rejeição + correção
+ nova submissão pode levar 1-2 semanas. Vale testar bem antes.

✅ **Commit:** "pipeline iOS (Codemagic) + docs de publicação".

---



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

Este é o projeto mais ambicioso dos quatro — três UIs completas sobre um
motor compartilhado, com multiplayer assíncrono persistente.

**Ordem completa de execução:**
```
0 → 1 ✅ → 1.5 → 2 ✅ → 3 ✅ → 4 ✅
→ 4.5 (A → B → B-Extra → C)
→ 5 (Android) → 6 (Google Play) → 7 (iOS) → 8 (App Store)
```

**Estado atual:** Fase 4.5 Bloco B implementado (incluindo B6).
**Próximo:** Bloco B-Extra (BX1→BX6) → lançamento web `playaetas.vercel.app`
→ Bloco C → Android.

**Três regras que não mudam:**
1. **AskUserQuestions é obrigatório** antes de qualquer decisão de design
   não coberta neste playbook — nunca assuma, sempre pergunte.
2. **Sonnet 4.6 é o padrão.** Troque para Opus 4.8 SOMENTE nos prompts
   marcados 🔴 — nunca no projeto inteiro.
3. **Checkpoints não são opcionais** — cada um existe porque o custo de
   um bug descoberto depois é multiplicado pelo número de UIs a corrigir.

**Checkpoints da Fase 4.5, em ordem:**
- 🛑 Checkpoint Visual (após Bloco A)
- 🛑 Checkpoint de Jogabilidade (após Bloco B)
- 🛑 **Checkpoint Pré-Lançamento Web** (após Bloco B-Extra) — mais
  importante antes de qualquer usuário real tocar no jogo.
- 🛑 Checkpoint Final da Web (após Bloco C)

**Lembretes práticos de publicação:**
- **Web:** lance em `playaetas.vercel.app`, valide com usuários reais,
  compre domínio só se valer a pena (`aetas.game` ou `playaetas.app`).
- **Android:** guarde o keystore fora do repo — perder = não atualizar mais.
- **iOS sem Mac:** use Codemagic (Fase 8) — build e assinatura na nuvem.
- **App Store:** cada atualização passa por revisão (1-7 dias úteis).

