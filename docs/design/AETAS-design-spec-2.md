# AETAS — Especificação de UI · Iteração 2 (Tela de jogo · Topo da cidade · Novo jogo)

Complementa `AETAS-design-spec.md` (tokens e componentes base continuam valendo).
Tom: **épico/imperial, estilo Civilization V**. Mobile-first.

Imagens de referência (anexar ao prompt):
- `aetas-3a-game.png` — Tela de jogo (só o HUD ao redor do mapa)
- `aetas-3c-city-top.png` — Topo da cidade com retrato de líder
- `aetas-3d-newgame.png` — Novo jogo (líder + medidores de traços)

> Reutilize os **design tokens do §1** do doc anterior (cores, tipografia Cinzel/Barlow/EB Garamond, raios, glow). Abaixo só o que é novo ou muda.

---

## A. Tela de jogo — HUD ao redor do mapa  (ref: `aetas-3a-game.png`)

> **Escopo: NÃO inclui o mapa hexagonal em si.** Apenas os elementos de interface ao redor: barra superior, barra de recursos, bottom sheet de ações. O mapa continua como está no seu app.

Layout: **mapa em tela cheia (fundo)** com HUD sobreposto — barra flutuante no topo, bottom sheet embaixo. Efeito "glass": `background: rgba(13,10,5,.6); backdrop-filter: blur(8px)`.

### A.1 Barra superior (flutuante, glass)
Três elementos numa linha:
1. **Voltar** — botão quadrado 34px, glass, seta `←` dourada.
2. **Selo YOUR TURN** (protagonista) — pílula central glass com borda `rgba(216,180,90,.5)` e leve glow (`box-shadow: 0 0 18px rgba(216,180,90,.18)`); ponto pulsante `#e8c874` + "YOUR TURN" em **Cinzel 800, .1em** + "· T3" (turno) discreto. Quando não for a vez do jogador: texto "WAITING" em `--text-dim`, sem glow.
3. **Menu único** (⋯) — botão 34px glass que agrupa o que antes eram ícones soltos (rank #2/2, jogadores, diplomacia, undo). **Badge vermelho** (`--danger`) no canto superior direito com a contagem de pendências de diplomacia (ex.: `1`). Abrir → menu/drawer com: Ranking, Jogadores, Diplomacia, Desfazer.

Abaixo da barra, **strip de recursos simplificado**: 3 pills glass, cada uma = ícone + valor (`--gold-hi`, bold) + ganho por turno em verde `#7bbf6a` menor. Sem rótulos textuais, sem penalidades no meio (mova alertas de saldo negativo para dentro do menu ou para o log).

### A.2 Bottom sheet de ações (arrastável)
Container: `border-radius: 18px 18px 0 0`, borda superior dourada, `box-shadow: 0 -12px 30px rgba(0,0,0,.5)`. Handle (barrinha 40×4 arredondada) no topo, centralizada — arrastável para expandir/recolher.

Ordem de conteúdo (topo → base):
1. **Alerta de diplomacia pendente** (destacado) — só aparece quando há proposta. Card com borda `rgba(216,180,90,.5)` + glow suave. Linha: ícone ⚖ + nome da civ (`--gold-bright`) + "propõem {tipo de pacto}" + tag `PENDENTE` (`--streak`). Dois botões: **Aceitar** (verde `linear-gradient(180deg,#2f7d54,#1f6440)`, texto claro) e **Recusar** (secundário). Se houver várias propostas, empilhar.
2. **Estado / ações da unidade**:
   - *Sem unidade selecionada* → **empty state** com borda tracejada: ícone 👆 + "Toque numa unidade para agir" + subtexto "mover · atacar · fortificar". (substitui o antigo texto seco "Select a unit on the map to act")
   - *Com unidade selecionada* → grade de ações (ver A.3).
3. **END TURN** — botão dourado grande, **sempre fixo e acessível** aqui (não rolar para fora). Cinzel 800, com o duplo-realce (`inset` claro + glow).
4. **LOG** — recolhível: cabeçalho "LOG" + linha divisória + chevron `▾`. Expandido, lista as ações do turno (mais recente no topo); recolhido por padrão.

### A.3 Ações da unidade selecionada (grade)  — usado quando há unidade ativa
Grade de 4 botões iguais (coluna de ícone + label), cada um `flex:1`:
- **Mover** — seta →, dourado (`--bg-raise` + borda ouro).
- **Atacar** — espadas, **vermelho** (`linear-gradient(180deg,#3a1614,#26100e)`, borda `rgba(176,43,40,.5)`, texto `#e0776e`).
- **Fortificar** — escudo, dourado.
- **Pular** — play/skip, apagado (`--text-dim`) quando é ação neutra.
Ações indisponíveis (ex.: sem alvo para atacar) ficam desabilitadas com opacidade .4.
Opcional: banner da unidade sobre o mapa (glass) com nome + HP/Mov/ATK/DEF ao selecionar.

**Estados/dados:** `turn{isYours, index}`, `resources[]{icon,value,perTurn}`, `pendingDiplomacy[]{civ,proposal}`, `selectedUnit?{name,hp,maxHp,move,atk,def,canAttack,canFortify}`, `log[]`.

---

## B. Topo da cidade — retrato de líder  (ref: `aetas-3c-city-top.png`)

> **Só o cabeçalho muda.** Barra de recursos, especialização, abas e listas continuam como no app atual.

Header novo, altura ~110px:
1. **Fundo temático por civ** — gradiente escuro + **wash de cor da civ** no canto superior esquerdo: `radial-gradient(70% 100% at 12% 0%, {civColor 28%}, transparent 55%)`, sobreposto por textura de pergaminho. (Persas = roxo `#9a5ce0`.)
2. **Medalhão de retrato do líder** (60px) — círculo com **moldura dourada em conic-gradient** (`conic-gradient(#c9a44e,#8a6a26,#f0d488,#8a6a26,#c9a44e)`, padding 2.5px) envolvendo o retrato. Ver §D para o sistema de retratos.
3. **Bloco de texto**:
   - Linha de civ: mini-hexágono na cor da civ + "PERSAS · LVL 1" (na cor clara da civ, ex. `#c9a6f0`).
   - **Nome do líder** — Cinzel 800, 24px, `--gold-hi` (ex.: "Ciro, o Grande"). *Este é o protagonista.*
   - Subtítulo em EB Garamond italic: "Capital · sua sede de poder".
4. **Botão fechar** `×` (círculo vermelho) no canto superior direito, como hoje.
5. **Barra de nível** abaixo: chip "LEVEL 1" + progress bar + "Pop 1/2 → 2".

**Dados:** `civ{name, color, colorLight, level}`, `leader{name, portraitId}`, `city{name, level, pop, popMax}`.

---

## C. Novo jogo — líder + medidores  (ref: `aetas-3d-newgame.png`)

Mantém a estrutura atual do seu app (não reinventar). Ordem:
1. Voltar `←` + textura diagonal de pergaminho no topo.
2. **Crista da civ** centralizada (~86px), na cor da civ (Astecas = teal `#3cc4a0`). Ver §D — pode ser crista OU retrato em medalhão.
3. "CHOOSE YOUR LEADER" (label terracota, .28em) → **Nome** (Cinzel 800, 34px) → descrição em EB Garamond italic.
4. **Unique Ability card** com os **4 cantos ornamentais em L** dourados (como já está): "◆ UNIQUE ABILITY · {NOME}" + efeito com número-chave em `--gold-hi` + "★ {unidade única}".
5. **NOVO — Medidores de traços**: linha com 3 barras curtas rotuladas **MILITAR / ECON. / EXPANSÃO**, valor 1–5 e cor por eixo (militar vermelho `#e0776e`, economia ouro `#e8c874`, expansão teal `#3cc4a0`). É o único acréscimo em relação ao print.
6. **Fileira de escudos** de civ (Persas/Astecas/Japoneses/Otomanos) — escudo na cor da civ + emblema; selecionado com borda `--gold` 1.5px.
7. **Linhas de setting**: OPPONENTS `1 AI ›` / MAP `Medium ›` / TURN LIMIT `Short ›` (labels terracota .12em, valor claro + chevron).
8. **Begin Reign →** (botão dourado grande, Cinzel 800).

**Dados:** `leaders[]{name, civ, color, epithet, ability{name,effect,unit}, traits{military,economy,expansion}, portraitId}`, `settings{opponents, mapSize, turnLimit}`.

---

## D. Sistema de retrato / emblema de líder por civilização

Cada civ tem **cor**, **emblema** e **retrato**. Use a cor como accent em toda a UI daquela civ (header da cidade, escudo, medidores, seleção).

| Civ | Cor accent | Cor clara (texto) | Emblema | Líder histórico (exemplo) |
|-----|-----------|-------------------|---------|---------------------------|
| Persas | `#9a5ce0` | `#c9a6f0` | Leão/faravahar | Ciro, o Grande |
| Astecas | `#3cc4a0` | `#7cf0d0` | Águia guerreira | Moctezuma |
| Japoneses | `#e05a9a` | `#f0a6c9` | Torii ⛩ | Oda Nobunaga |
| Otomanos | `#8ac04a` | `#c9e0a6` | Crescente ☾ | Solimão |

> Adicione as demais civs seguindo o mesmo padrão (cor + emblema + líder).

### D.1 Duas peças reutilizáveis

**`<CivCrest>`** — escudo na cor da civ, para a fileira de seleção e ícones pequenos. SVG do escudo (path já no doc anterior), `stroke = civColor`, `fill` escuro derivado da cor, emblema no miolo.

**`<LeaderPortrait size>`** — medalhão redondo com moldura dourada (conic-gradient) e o **retrato** dentro. Estrutura:

```html
<div style="position:relative;width:60px;height:60px">
  <div style="position:absolute;inset:0;border-radius:50%;padding:2.5px;
              background:conic-gradient(#c9a44e,#8a6a26,#f0d488,#8a6a26,#c9a44e)">
    <div style="width:100%;height:100%;border-radius:50%;overflow:hidden;
                background:radial-gradient(circle at 50% 25%, {civColor}, {civColorDark})">
      <!-- IMG do líder OU silhueta placeholder -->
      <img src="/leaders/{portraitId}.png" style="width:100%;height:100%;object-fit:cover">
    </div>
  </div>
</div>
```

### D.2 Placeholder no estilo (enquanto não há arte real)
Silhueta de busto + adorno da civ, em SVG, dentro do medalhão. O layout **já reserva o espaço** — quando tiver retratos reais (ilustração/pintura de cada líder), basta trocar o `<img src>` mantendo a moldura. Recomendo retratos ~256×256, enquadramento do busto, luz vindo de cima, fundo na cor da civ.

### D.3 Onde o retrato aparece
- **Topo da cidade** (60px) — retrato do líder da SUA civ.
- **Novo jogo** (86–96px, centralizado) — retrato/crista do líder em foco no carrossel.
- Opcional: mini-retrato (28px) nos cards de partida da Home ("vs {líder}") e nos alertas de diplomacia.

---

## E. Prompt sugerido para o Claude Code
> "Implemente {A: o HUD da tela de jogo ao redor do mapa / B: o novo topo da tela de cidade / C: os medidores de traços na tela de novo jogo} seguindo `AETAS-design-spec-2.md` e a imagem `aetas-{3a/3c/3d}.png`. Reuse os design tokens do doc anterior. Para A, NÃO altere o mapa — só barra superior, strip de recursos e bottom sheet. Crie os componentes reutilizáveis `LeaderPortrait` e `CivCrest` (§D) parametrizados por civ (cor + emblema + portraitId). Mantenha dados mockados na estrutura descrita."
