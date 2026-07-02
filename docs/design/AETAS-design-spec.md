# AETAS — Especificação de UI (Home · Cidade · Novo Jogo)

Guia para implementar as 3 telas aprovadas no repositório `aetas`.
Tom: **épico/imperial, estilo Civilization V**. Mobile-first, adaptável a web/desktop.

Anexe as imagens de referência junto deste doc:
- `aetas-2a-home.png` — Home / lobby
- `aetas-2d-city.png` — Painel da cidade
- `aetas-2e-newgame.png` — Novo jogo / seleção de líder

---

## 1. Design tokens (defina uma vez, use em todo lugar)

```
/* Cores — fundo */
--bg-void:        #0d0a05;   /* fundo base do app */
--bg-panel:       #15100a;   /* cartões / painéis */
--bg-panel-2:     #171105;   /* cartão ativo */
--bg-raise:       #1c1409;   /* chips, botões secundários */
--bg-amber-grad:  radial-gradient(80% 120% at 50% 0%, #3a2a12, #160f06); /* headers */

/* Cores — ouro (marca / ações) */
--gold:           #d8b45a;
--gold-bright:    #ecc766;   /* títulos, números */
--gold-hi:        #f0d488;   /* topo de gradientes */
--gold-deep:      #9a6f28;
--gold-btn:       linear-gradient(180deg, #e8c874, #c99a3e); /* botão primário */

/* Cores — semânticas */
--ink:            #1a130a;   /* texto sobre ouro */
--text:           #e8ddc5;   /* texto principal */
--text-dim:       #8a7d63;   /* legendas */
--text-label:     #c9895a;   /* rótulos de seção (terracota) */
--positive:       #6f8f4a;   /* ganhos +gold/+food */
--danger:         #b02b28;   /* guerra / fechar / perigo */
--streak:         #e8a13a;   /* streak / fogo */

/* Recursos */
--res-gold:  radial-gradient(circle at 38% 32%, #f0d488, #c99a3e);
--res-food:  #5b8f3a;
--res-prod:  #b07a34;

/* Borda / linha */
--line:      rgba(201,169,78,.18);
--line-strong: rgba(201,169,78,.35);

/* Raio */
--r-sm: 8px;  --r-md: 11px;  --r-lg: 14px;  --r-pill: 20px;

/* Sombra de brilho (botão dourado) */
--glow: 0 4px 14px rgba(216,180,90,.3);
```

### Tipografia
- **Títulos / marca:** `Cinzel` (600–800), sempre com `letter-spacing` (.03em em nomes, .14em no wordmark AETAS). Uso: AETAS, "Capital", "Cleopatra", nomes de tela.
- **UI / números / corpo:** `Barlow` (400–700). Todos os labels, botões, valores de recurso.
- **Sabor / itálico:** `EB Garamond` italic — subtítulos poéticos ("The Nile Queen", "Empires by Mail"). Opcional.
- Escala mobile: título de tela 24–28px, número de recurso 17–18px, corpo 12–13px, label de seção 11px `letter-spacing:.2em` UPPERCASE.

### Motivos visuais recorrentes
- Divisor de losango `◆` e "◆ ◆ ◆" entre linhas douradas finas.
- Cantos ornamentais em L (2px sólido ouro) nos cartões de destaque (daily challenge, ability).
- Textura sutil de pergaminho: `repeating-linear-gradient(90deg, rgba(201,169,78,.04) 0 1px, transparent 1px 9px)` como overlay `pointer-events:none`.
- Crista/emblema em SVG (ver §5).

---

## 2. Componentes base (reutilizáveis nas 3 telas)

**Button primário** — `background: var(--gold-btn); color: var(--ink); font-weight:700; border-radius: var(--r-md); box-shadow: var(--glow);` padding 12–16px, centralizado.

**Button secundário** — `background: var(--bg-raise); border:1px solid var(--line-strong); color: var(--gold-bright);`

**Section label** — `font: 700 11px Barlow; letter-spacing:.2em; text-transform:uppercase; color: var(--text-dim);`

**ResourceChip** `{icon, value, delta?}` — ícone 16–22px (gold=círculo, food/prod=quadrado r5), valor em `--gold-bright` bold, delta em `--positive` menor. Ver cores em `--res-*`.

**ProgressBar** — trilho `#2a1f0d` h5–6 r4; preenchimento `linear-gradient(90deg,#c99a3e,#e8c874)`.

**Tabs** (pílula) — contêiner `--bg-panel` com `border:1px solid --line` p4 r10; aba ativa = `--gold-btn` + `--ink`; inativa = texto `--text-dim`.

**Card** — `background: var(--bg-panel); border:1px solid rgba(201,169,78,.2); border-radius: var(--r-md);`. Variante "ativo" ganha `border-left:3px solid var(--gold)`.

Estados de edifício (cores de borda/fundo):
- Disponível: borda ouro `.2`, fundo `--bg-panel`.
- Construindo: borda `rgba(216,180,90,.4)`, fundo `--bg-amber-grad`, com ProgressBar.
- Construído: borda `rgba(111,143,74,.25)`, fundo `rgba(111,143,74,.07)`, selo "✓ Built" em `--positive`.

---

## 3. Tela A — Home / Lobby  (ref: `aetas-2a-home.png`)

Estrutura (top→bottom):
1. **Header**: wordmark "AETAS" (Cinzel 800, .14em) à esquerda; à direita bloco de perfil — nome do jogador (Barlow 700), subtítulo "CONSUL · LVL 7" (--text-dim), e crista SVG do jogador (36×40).
2. **Daily Challenge** (cartão destaque): cantos ornamentais em L; overlay de pergaminho; header com `◆` + "Daily Challenge" + pílula de streak "🔥 5-day" (`--streak`, fundo `rgba(232,161,58,.14)`); linha "Same map for all · Resets in HH:MM:SS"; botão primário "Play Challenge →".
3. **Tabs**: `My Turn · N` (ativa) / `Their Turn · N` / `Finished`.
4. **Lista de jogos** (aba My Turn): GameCard = thumbnail hex-mini (48–52px, mosaico de hexágonos coloridos) + título "vs {oponente} · {civ}" + "Turn X/Y · {tempo}" + ProgressBar + botão "Play →". Empilhar múltiplos com gap 11px.
5. **Link** "View N finished games →".
6. **FAB** (canto inferior direito): círculo 76px `--res-gold`, "+ NEW GAME", animação `glowpulse` (pulso de brilho 3.5s).

Dados: `player{name,title,level,crestId}`, `dailyChallenge{resetAt,streak}`, `games[]{opponent,civ,turn,maxTurn,lastMoveAt,phase}`.
Comportamento: tab troca a lista; badge de contagem por tab; FAB → fluxo Novo Jogo.

---

## 4. Tela B — Cidade  (ref: `aetas-2d-city.png`)

Estrutura:
1. **Header de crista** (`--bg-amber-grad`): crista SVG da civilização (44px) + rótulo "EGÍPCIOS · YOU · LVL 2" (--text-label) + nome "Capital" (Cinzel 800, 25px). Botão fechar `×` (círculo vermelho `--danger`) no canto sup. direito.
2. **Strip de recursos** (barra própria, `--bg-panel` com borda inferior): Gold / Food / Production, cada um ResourceChip com delta por turno (+8, +23, +10).
3. **Linha dupla**: card de **Especialização** ("Commercial", ícone, "+50% Gold", fundo verde-oliva translúcido) + card de **Nível** (Pop 2/4 → L3 com ProgressBar).
4. **Tabs**: `🏛 Buildings` / `⚔ Units`.
5. **Lista** (aba Buildings): building rows nos 3 estados (§2) — ex.: Mercado *building 1t* (progress), Porto disponível (custo ⚙15 ◎8 + botão Build), Celeiro construído (✓).

Dados: `city{name,civ,level,pop,popMax,specialization}`, `resources{gold,food,prod,+deltas}`, `buildings[]{name,icon,cost,effect,state:'available'|'building'|'built',turnsLeft?}`, `units[]`.
Comportamento: aba alterna buildings/units; botão Build debita recursos e move item p/ estado "building"; fila mostra turnsLeft com ProgressBar.

---

## 5. Tela C — Novo Jogo / Líder  (ref: `aetas-2e-newgame.png`)

Estrutura:
1. **Hero do líder** (~250px, `--bg-amber-grad` + textura diagonal): botão voltar `←` (canto sup. esq.); crista/emblema grande do líder centralizado (SVG ~86px); rótulo "CHOOSE YOUR LEADER" (--text-label); nome "Cleopatra" (Cinzel 800, 32px); civ "Egypt" (Garamond italic). Gradiente escuro na base p/ legibilidade.
   > *Substituir o emblema SVG por retrato real do líder quando disponível — o layout já reserva o espaço.*
2. **Unique Ability card**: cantos ornamentais em L; "◆ UNIQUE ABILITY · {nome}"; descrição do bônus com números-chave em `--gold-bright` (ex.: "+1 Gold per trade route. River cities gain **+2 Food**").
3. **Seletor de líderes**: fileira de tiles quadrados (aspect 1:1); selecionado com `border:1.5px solid --gold` + fundo `--bg-raise`; demais opacidade .6.
4. **Settings inline** (linhas com divisor): Opponents `3 AI ›` / Map `Medium ›` / Turn limit `20 ›`.
5. **CTA primário**: "Begin Reign →" (botão dourado grande).

Dados: `leaders[]{name,civ,epithet,ability{name,desc},traits?}`, `settings{opponents,mapSize,turnLimit}`.
Comportamento: trocar líder atualiza hero + ability em tempo real; cada linha de setting abre picker; "Begin Reign" cria a partida.

---

## 6. Crista/emblema em SVG (placeholder no estilo do jogo)

Escudo alado dourado — troque o miolo por símbolo de cada civ. `id` do gradiente deve ser único por instância.

```html
<svg width="44" height="49" viewBox="0 0 52 58">
  <defs>
    <linearGradient id="crest" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f0d488"/>
      <stop offset="1" stop-color="#9a6f28"/>
    </linearGradient>
  </defs>
  <!-- escudo -->
  <path d="M26 2 L48 10 V30 C48 44 38 52 26 56 C14 52 4 44 4 30 V10 Z"
        fill="#1a1206" stroke="url(#crest)" stroke-width="2.5"/>
  <!-- miolo: sol alado (Egito). Troque por civ -->
  <circle cx="26" cy="23" r="6.5" fill="url(#crest)"/>
  <path d="M19.5 23 Q11 17 4.5 21 Q12 24 19.5 26 Z" fill="url(#crest)"/>
  <path d="M32.5 23 Q41 17 47.5 21 Q40 24 32.5 26 Z" fill="url(#crest)"/>
  <path d="M26 33 v9 M22.5 38 h7" stroke="url(#crest)" stroke-width="2.4"
        fill="none" stroke-linecap="round"/>
</svg>
```

Emblema de estrela (perfil do jogador): escudo + `path` de estrela de 5 pontas em `url(#crest)`.

---

## 7. Notas de implementação
- **Mobile-first**: telas desenhadas em 360×772. Em web/desktop, centralize a coluna em ~420px máx. e use o espaço lateral para mapa/painéis.
- **Alvos de toque** ≥ 44px. Botões e chips já respeitam.
- **Acessibilidade**: contraste ouro sobre `--bg-void` ok; não use ouro claro sobre ouro. Números importantes sempre em `--gold-bright`.
- **Animações**: só `glowpulse` no FAB e transições de tab (200ms). Nada de gradientes chamativos fora da paleta.
- **Emoji** (🏛⚓🌾💰⚔🔥) são placeholders de ícone — substitua por ícones vetoriais consistentes (line icons dourados) na produção.
- Reaproveite os tokens do §1 como variáveis do seu sistema (CSS vars / theme object) para manter as 3 telas coerentes.

### Prompt sugerido para o Claude Code
> "Implemente a tela {Home/Cidade/Novo Jogo} do AETAS seguindo `AETAS-design-spec.md` e a imagem `aetas-{2a/2d/2e}.png`. Use os design tokens do §1 como variáveis de tema. Mobile-first (360px), responsivo até desktop. Componentize ResourceChip, Card, Tabs, Button e a crista SVG. Mantenha dados mockados na estrutura descrita em cada tela."
