# Design System — Aetas

Identidade visual do Aetas: "pedra à noite com ouro imperial". Todos os tokens são
definidos em `apps/web/src/styles/tokens.css` como CSS custom properties dentro do
bloco `@theme` do Tailwind v4, que gera automaticamente as classes utilitárias
(`bg-aetas-gold`, `text-aetas-text`, `border-aetas-border`, `font-display`, etc.).
Modificadores de opacidade funcionam normalmente: `bg-aetas-gold/20`, `border-aetas-gold/40`.

---

## Paleta de cores

### Primária

| Token | Hex | Classe Tailwind | Uso |
|---|---|---|---|
| `aetas-gold` | `#c9a84c` | `bg-aetas-gold` / `text-aetas-gold` | Ação primária, destaque, "sua vez" |
| `aetas-gold-light` | `#e8c97a` | `bg-aetas-gold-light` | Hover do botão primário |
| `aetas-gold-dark` | `#8f6b20` | `bg-aetas-gold-dark` | Active/pressed do botão primário |

### Acentos funcionais

| Token | Hex | Classe Tailwind | Uso |
|---|---|---|---|
| `aetas-red` | `#8b1a1a` | `bg-aetas-red` / `text-aetas-red` | Destrutivo, guerra, eliminação |
| `aetas-red-dark` | `#6b1414` | `bg-aetas-red-dark` | Hover do botão destrutivo |
| `aetas-blue` | `#1a2744` | `bg-aetas-blue` / `text-aetas-blue` | Diplomacia, estado neutro/informativo |
| `aetas-green` | `#1a3d1a` | `bg-aetas-green` / `text-aetas-green` | Aliança, ação positiva |

> Indicadores funcionais que **não** usam os tokens acima: erros de ação (`text-red-400`),
> disputas de combate (`amber-*`), vítória (`green-400`). São sinais de status em-tela,
> não identidade visual.

### Fundos (warm-dark)

| Token | Hex | Uso |
|---|---|---|
| `aetas-bg` | `#0e0c09` | Fundo de página inteira |
| `aetas-surface` | `#17140f` | Cards, modais, sidebars |
| `aetas-raised` | `#211d16` | Elementos secundários, inputs, badges |
| `aetas-panel` | `#2b261e` | Elementos elevados, hover forte |

### Bordas

| Token | Hex | Uso |
|---|---|---|
| `aetas-border` | `#38301f` | Divisores sutis |
| `aetas-border-strong` | `#4d4230` | Bordas visíveis em modais e cards |

### Texto (warm cream)

| Token | Hex | Uso |
|---|---|---|
| `aetas-text` | `#e8dcc8` | Texto primário — contraste ~12:1 sobre `aetas-surface` |
| `aetas-muted` | `#9d8c75` | Texto secundário, labels, hints |
| `aetas-dim` | `#6b5d48` | Texto muito discreto, placeholders |

---

## Tipografia

### Fontes

| Família | Token | Classe | Fonte |
|---|---|---|---|
| Display (serifada) | `--font-family-display` | `font-display` | Cinzel 400/600/700 via Google Fonts |
| Sans (corpo) | `--font-family-sans` | `font-sans` | Inter via system-ui fallback |

**Cinzel** evoca inscrições romanas — usar em headings temáticos, seções com label uppercase,
títulos de modal. **Não usar** em texto corrido, mensagens de jogo ou labels de dados.

### Escala de tamanho

| Tailwind | Uso no Aetas |
|---|---|
| `text-xs` (12px) | Labels uppercase (`font-display`), badges, tooltips, metadados |
| `text-sm` (14px) | Corpo de card, descrições, itens de lista |
| `text-base` (16px) | Títulos de card, nomes de cidade, nomes de jogador |
| `text-2xl` (24px) | Títulos de tela (Game Over, Perfil) |
| `text-3xl+` | Títulos de página principal (Login "Aetas") |

---

## Padrões de componentes

Todos os padrões abaixo são inline Tailwind — sem arquivos React separados neste momento.

### Button

**Primário (ouro) — ação principal por tela:**
```
py-3 px-6 rounded-xl font-bold text-sm transition-colors
bg-aetas-gold text-aetas-bg hover:bg-aetas-gold-light active:bg-aetas-gold-dark
```
Exemplo: "Terminar Turno", "Jogar →", "Voltar à lista".

**Secundário (pedra) — ação alternativa:**
```
py-2.5 px-4 rounded-xl text-sm transition-colors
bg-aetas-raised text-aetas-muted hover:bg-aetas-panel border border-aetas-border
```
Exemplo: "Compartilhar", "Ver →", "← Voltar".

**Destrutivo (vermelho) — ação irreversível:**
```
py-2.5 px-4 rounded-xl text-sm font-medium transition-colors
bg-aetas-red text-aetas-text hover:bg-aetas-red-dark
```
Exemplo: "Declarar Guerra", "Romper Pacto" (Diplomacia — Fase 4.5.B5).

**Desabilitado (qualquer variante):**
```
opacity-50 cursor-not-allowed
```
Adicionar à variante base. Não trocar a cor — só reduzir opacidade.

---

### Card

**Padrão:**
```
bg-aetas-surface border border-aetas-border rounded-2xl p-4
```

**Com destaque ornamental (hover ou selecionado):**
```
bg-aetas-surface border border-aetas-border-strong rounded-2xl p-4
ring-1 ring-aetas-gold/20
```

**Com borda dourada (ativo/selecionado):**
```
bg-aetas-gold/5 border border-aetas-gold/30 rounded-2xl p-4
ring-1 ring-aetas-gold/60
```

---

### Badge

**Dourado — ativo, em andamento:**
```
bg-aetas-gold/20 text-aetas-gold border border-aetas-gold/40
rounded-full px-2 py-0.5 text-xs font-semibold
```

**Neutro — concluído, inativo:**
```
bg-aetas-raised text-aetas-muted
rounded-full px-2 py-0.5 text-xs
```

**Alerta/guerra:**
```
bg-aetas-red/20 text-red-300 border border-aetas-red/40
rounded-full px-2 py-0.5 text-xs
```

---

### Tooltip

**Nativo (atual):** atributo `title="..."` no elemento — zero dependências, funciona no desktop.

**Visual (quando necessário no mobile):**
```
absolute z-50 bottom-full mb-1.5 left-1/2 -translate-x-1/2
bg-aetas-panel border border-aetas-border rounded-lg px-2.5 py-1.5
text-xs text-aetas-muted whitespace-nowrap pointer-events-none
```
Implementar como componente React apenas quando `title=` não for suficiente (Fase 4.5+).

---

### Modal

**Backdrop:**
```
fixed inset-0 z-30 bg-black/60 backdrop-blur-sm
```

**Panel (bottom sheet mobile / centro desktop):**
```
fixed inset-x-0 bottom-0 z-40
md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-96
bg-aetas-surface border border-aetas-border-strong
rounded-t-2xl md:rounded-2xl shadow-2xl shadow-black/60 p-5
```

---

## Estado atual de implementação

Todos os tokens `aetas-*` e `font-display` estão aplicados em **todos os componentes** da web
desde o polimento 4.4–4.7:

| Componente | Tokens aplicados |
|---|---|
| `LoginPage` | `aetas-bg/surface/border`, Cinzel no título, `aetas-gold` no input focus |
| `GameListPage` | `aetas-gold` no FAB, "Sua vez" dot e badge de XP |
| `GameView` | Header com `aetas-surface`, "SUA VEZ" em `aetas-gold` |
| `ActionSheet` | End Turn em `aetas-gold`, labels em `font-display` |
| `PlayerBar` | Cor de civ por lookup, dot ativo em `aetas-gold` |
| `CityModal` | Botão Construir em `aetas-gold/70`, labels em `font-display` |
| `HexMap` | Cores de terreno hardcoded (SVG, não usa classes) |
| `GameOverScreen` | Título em `font-display`, XP bar em `aetas-gold` |
| `ProfilePage` | Civ selecionada com `ring-aetas-gold/60`, XP em `aetas-gold` |

As 3 novas cores (`aetas-red`, `aetas-blue`, `aetas-green`) foram adicionadas ao `tokens.css`
e estarão disponíveis como classes Tailwind, mas não têm uso na UI ainda — serão consumidas
na Fase 4.5.B5 (Diplomacia) e em estados de guerra/aliança.
