# AETAS — Especificação de UI · Iteração 3 (Tela de Perfil)

Complementa `AETAS-design-spec.md` e `AETAS-design-spec-2.md` (tokens, tipografia e componentes base continuam valendo — reaproveite as variáveis já definidas).

Imagem de referência: `aetas-4b-profile.png` (tela inteira, do header até o grid de civilizações).

---

## Visão geral da tela

Reorganização da tela de Profile existente, mantendo Back / EN·PT / Logout no header, mas com o visual em linha com o resto do app (Cinzel, ouro, painéis escuros ornamentados). Ordem das seções (topo → base):

1. Header
2. Cartão de Nível/Rank
3. Conquistas (nova seção, placeholder)
4. Campaign Progress (trilha de níveis)
5. Tutorial
6. Civilizations (grid de cards)

---

## 1. Header

Três zonas:
- **Esquerda:** `← Back` (seta dourada + texto `--text-label`/`--text`).
- **Centro:** `◆ PROFILE ◆` — Cinzel 800, 15px, `--gold-bright`, losangos `◆` dourados nas laterais como ornamento.
- **Direita:** chip `EN·PT` (borda sutil, texto `--text-dim`) + botão `Logout` (borda vermelha `rgba(176,43,40,.35)`, texto `#b96a5a`).

Fundo: `radial-gradient(120% 100% at 50% 0%, #241a0b, #120d06)`, borda inferior `1px solid rgba(201,169,78,.22)`.

---

## 2. Cartão de Nível / Rank

Card com borda `rgba(201,169,78,.32)`, fundo `linear-gradient(160deg,#271c0c,#160f06)`, overlay sutil de textura de pergaminho (`repeating-linear-gradient` diagonal, ver spec 1 §"motivos visuais").

- **Emblema de nível**: escudo SVG (mesmo motif de crista das outras telas) com o número do nível dentro, em vez de ícone de civilização — moldura em gradiente ouro (`url(#gradient)` stroke), número em Cinzel 800.
- Ao lado: rótulo pequeno "CONSUL RANK" (`--text-label`, .16em) → "Level {N}" (Cinzel 800, 22px, `--gold-hi`) → linha "{XP} XP total · {status}" (`--text-dim`).
- **Barra de progresso** cheia (7px, `--gold-btn` gradient) logo abaixo — quando o nível é máximo, mostrar 100% preenchida; quando não, refletir a % até o próximo nível.
- **Grid 2×2 de estatísticas** — cada célula: valor grande (`--gold-bright`, bold) + legenda (`--text-dim`, menor), fundo `rgba(0,0,0,.18)`, borda sutil ouro.
  > *Estes 4 valores (+10 Game played, +35 Victory, +15 Daily played, +50 Daily victory) devem ser mantidos como estão hoje — são fontes de XP, não conquistas. Não confundir com a seção 3.*

---

## 3. Conquistas — nova seção (placeholder)

**Ainda não há sistema de conquistas implementado.** Esta seção é um teaser visual para o que vem a seguir — não bloquear o dev tentando inventar conquistas reais agora.

- Título de seção "CONQUISTAS" (padrão `--text-label`, .2em).
- Card com borda `rgba(201,169,78,.18)`, fundo `#141009`.
- **5 slots quadrados tracejados** (`border: 1px dashed rgba(201,169,78,.28)`, fundo `rgba(201,169,78,.04)`), cada um com um ícone/emoji apagado (`color:#4a4032`) representando categorias possíveis (troféu, espadas, coroa, escudo, estrela) — são só indicativos de "tipos" de conquista, não conquistas reais.
- Texto abaixo, centralizado, `--text-dim`: "Sistema de conquistas em construção — em breve."
- **Dado esperado quando implementado:** `achievements[]{id, icon, name, description, unlocked:boolean, unlockedAt?}`. Por ora, renderizar só o placeholder acima — sem dados mockados de conquistas específicas.

---

## 4. Campaign Progress — trilha de níveis

Substitui a antiga grade simples "LEVELS" por uma **trilha horizontal com scroll**, em estilo "caminho de campanha":

- Container: borda `rgba(201,169,78,.18)`, fundo `#141009`, `overflow-x: auto` **com barra de rolagem oculta** (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`) — o scroll funciona por toque/arrasto, sem indicador visual.
- Conteúdo interno com largura fixa maior que a tela (ex. 560px) para acomodar os 9 (ou mais) níveis lado a lado.
- **Linha conectora em SVG**: curva suave ondulada ligando os marcos (trecho já alcançado em `--gold` sólido, trecho futuro em cinza `#3a2f1a` — quando houver níveis além do atual).
- **Marcos**: círculo 26px (`#2a1f0d` fundo, borda 2px `#6f6448` para não alcançados) com o número do nível dentro; alternam leve deslocamento vertical (~44px) para reforçar a sensação de caminho sinuoso. Abaixo de cada um, o XP necessário em texto pequeno apagado.
- **Marco atual/máximo**: maior (30px), fundo `--res-gold` (radial dourado), borda `--gold-hi`, glow (`box-shadow: 0 0 14px rgba(216,180,90,.55)`), texto "{XP} · YOU" em destaque.
- Import: ao rolar horizontalmente, nenhum efeito de scrollbar deve aparecer — testar em iOS/Android que o comportamento nativo de "hide scrollbar" seja respeitado.

**Dados:** `levels[]{level, xpRequired, reached:boolean}`, `currentLevel`.

---

## 5. Tutorial

Sem mudanças estruturais — card simples com título "Tutorial" e botão "Reactivate" à direita (estilo botão secundário: borda ouro, fundo `--bg-raise`).

---

## 6. Civilizations — grid de cards

Cards em **coluna única, largura total** (não mais 2 colunas — ficaram maiores para caber o emblema e o estado de bloqueio):

- **Emblema/crista da civ** à esquerda (46×52px), no motivo de escudo já usado em outras telas, com o ícone temático da civ dentro (ex.: têmpora romana, raio grego, machados viking, sol egípcio) e `stroke` na cor da civ.
- Fundo do card recebe leve wash da cor da civ: `linear-gradient(90deg, {civColor}15%, #171105)`.
- Corpo: nome (Barlow 700, `--text`), descrição do bônus (`--text-dim`, 2 linhas), linha da unidade especial "★ {nome}" em `--gold-bright`.
- **Badge de estado** no canto superior direito do card:
  - Desbloqueada: `UNLOCKED`, verde (`#7bbf6a`, fundo `rgba(123,191,106,.12)`, borda `rgba(123,191,106,.35)`).
  - Bloqueada: `🔒 LVL {N}`, apagado (`--text-dim`, fundo quase transparente) — card inteiro com opacidade reduzida (~.6), crista em tom acinzentado neutro (sem cor da civ), descrição trocada por "Alcance Level {N} para desbloquear." (some a unidade especial).
- Contador no título da seção: "CIVILIZATIONS · {desbloqueadas}/{total}".

**Dados:** `civilizations[]{name, color, icon, bonusText, uniqueUnit, unlocked:boolean, unlockLevel?}`.

---

## Prompt sugerido para o Claude Code
> "Redesenhe a tela de Profile seguindo `AETAS-design-spec-3.md` e a imagem `aetas-4b-profile.png`. Reuse os design tokens e componentes das specs anteriores. A seção de Conquistas é só um placeholder visual (sistema ainda não existe — não invente dados de conquistas). A trilha de Campaign Progress deve rolar horizontalmente sem mostrar barra de rolagem. Os cards de Civilizations agora ocupam a largura toda, com estado unlocked/locked."
