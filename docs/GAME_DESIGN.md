# Game Design Doc — Aetas

Civilization-like destilado para mobile/web, multiplayer assíncrono, com
civilizações históricas. **Aetas** — do latim, "era"/"idade" — nome que
evoca exatamente o cerne do jogo: civilizações avançando por eras ao longo
do tempo. Este documento separa **v1 (lançamento enxuto)** de
**v2+ (profundidade futura)** — toda decisão tomada na conversa de design
está aqui, classificada por quando entra. Revisável a qualquer momento durante
o desenvolvimento; nada aqui é definitivo.

## Identidade central

O conceito completo (ver "Visão v2+" abaixo) é mais próximo de um Civ V
compacto do que de um Polytopia puro — economia de 3 recursos, fog of war
clássico, diplomacia e combate tático assíncrono são, juntos, um escopo
ambicioso. Por isso a v1 corta agressivamente: a maior parte das seções
abaixo tem uma versão "fina" para o lançamento e uma nota do que falta para
chegar na visão completa.

---

## V1 — Lançamento enxuto

O objetivo da v1 é validar o núcleo do jogo (turnos, combate tático, hex map,
multiplayer assíncrono funcionando de verdade) com o menor conjunto de
sistemas que ainda parece um Civ-like completo (Aetas), não um protótipo capenga.

### Formato e sessão

- Mobile + web.
- 4-8 jogadores por partida. IA preenche vagas vazias; solo vs. IA suportado.
- Duração configurável (curta/média/longa) na criação da partida — controla N
  turnos para a condição de vitória.
- Tempo ativo por sessão: 20-30 min (tempo de decisão do jogador, não da
  partida inteira, que pode durar dias).
- **Múltiplas partidas simultâneas** (modelo Words with Friends) — pilar
  central de retenção: sempre há alguma partida esperando a vez do jogador.

### Mapa e exploração

- Hexagonal, exploração livre, gerado proceduralmente (não mundo real).
- Fog of war clássico — só se vê o que já foi explorado.
- Tamanho do mapa vs. 4-8 jogadores: **a calibrar em prototipagem** — não dá
  pra travar por design puro, precisa testar.

### Cidades e economia

- Múltiplas cidades por jogador, sem limite explícito (o mapa restringe
  naturalmente).
- Crescimento híbrido: população cresce passiva; jogador escolhe a
  especialização da cidade (não há fila manual de produção item a item).
- 3 recursos clássicos: ouro, comida, produção.

### Progressão tecnológica

- Por eras (poucos níveis), não árvore ramificada.

### Civilizações históricas

- Cada civilização: 1-2 habilidades únicas + 1 unidade especial.
- Desbloqueadas via meta-progressão de conta (XP) — não todas abertas desde
  o início.
- **Cosméticos simples** (cores/bandeiras) também desbloqueáveis por XP.

### Combate

- Tático: stats de unidade, terreno influencia, ordem de turno importa.
- Combate entre jogadores diferentes fica "em disputa" até a próxima sessão
  de AMBOS — gera tensão tática real.
- **Timeout de ~24h**: se uma das partes não agir, resolve automaticamente.

### Turnos

- Sequencial (xadrez por correio) — jogador A termina, só então B pode jogar.
- Risco aceito conscientemente: pode gerar espera em partidas com 4-8
  jogadores. Mitigado por múltiplas partidas simultâneas.
- **Jogador ausente no seu turno:** uma IA assume temporariamente a posição
  dele até ele voltar a jogar. **Nota técnica importante:** isso significa
  que a IA jogável precisa existir desde o dia 1 da v1 — não é algo que dá
  pra adiar pra v2, porque ela também funciona como rede de segurança do
  turno sequencial.

### Diplomacia e interação social

- Disponível só após contato (unidade/cidade do outro avistada).
- Profundidade da v1: **pacto de não-agressão simples + troca de recursos**.
  Sem tratados complexos, sem múltiplas cláusulas.

### Vitória

- Condição única: pontuação combinada (território + população +
  desenvolvimento) ao fim de N turnos. Sem vitórias alternativas.

### Jogador eliminado

- Sai da partida; o território dele vira neutro/disponível para ocupação.

### Retenção diária

1. **Múltiplas partidas simultâneas** — pilar estrutural (ver Formato).
2. **Desafio diário solo:** mapa pequeno gerado para o dia, **mesma seed
   para todos** (comparável entre jogadores, estilo Wordle/Taut/Longshot —
   reaproveita um padrão de design que você já validou em outros projetos).
   Independente das partidas multiplayer.
3. **Meta-progressão de conta:** XP que desbloqueia civilizações e
   cosméticos simples (cores/bandeiras). Conecta partidas multiplayer e
   desafio diário num fio único de progresso.

---

## V2+ — Visão futura (não construir agora)

Tudo que foi discutido mas conscientemente adiado, para não inflar a v1:

- **Diplomacia mais profunda:** tratados formais com múltiplas cláusulas,
  alianças militares reais (não só não-agressão), possivelmente comércio
  automatizado por rotas.
- **Tamanho/variedade de mapa:** múltiplos tamanhos e tipos de mapa
  selecionáveis (a v1 usa um formato calibrado único).
- **Desbloqueáveis mais ricos:** avatares, variações visuais de mapa, talvez
  cosméticos de unidade — além de civilizações e cores/bandeiras da v1.
- **Jogador eliminado com chance de retorno:** modos especiais onde a
  eliminação não é definitiva (ex: vira espectador com chance de reentrar).
- **Mais condições de vitória:** caminhos alternativos (militar, cultural,
  científico) além da pontuação combinada única.
- Revisitar se a IA-substituta do turno ausente precisa de comportamento
  mais sofisticado (a v1 pode começar com uma IA propositalmente simples,
  só "seguradora de posição", e evoluir depois).

---

## Pendências verdadeiramente abertas

Únicos pontos que ainda não têm nem resposta de v1:

- **Calibração do tamanho do mapa** contra 4-8 jogadores — só resolve com
  prototipagem/playtesting real, não dá pra travar por design puro.

Tudo mais listado acima já tem uma decisão de v1, mesmo que sujeita a
revisão durante o desenvolvimento.
