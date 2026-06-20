# Glossário de domínio — Aetas

Tabela canônica de termos do jogo. Cada linguagem segue suas próprias
convenções de casing, mas o **conceito** deve ser reconhecível em todas.
Expandir conforme o projeto avança; não inventar nomes novos sem atualizar
este arquivo.

> **Regra de leitura:** a coluna TS é a fonte da verdade — Swift e Kotlin
> traduzem o mesmo conceito para suas convenções nativas.

---

## Tipos e estruturas de dados

| Conceito (PT) | TS | Swift | Kotlin | Notas |
|---|---|---|---|---|
| Estado completo de uma partida | `GameState` | `GameState` | `GameState` | Snapshot imutável passado entre funções do engine |
| Partida (instância de jogo) | `Game` | `Game` | `Game` | Registro persistido no Postgres |
| Jogador numa partida | `Player` | `Player` | `Player` | Vinculado ao perfil de conta via `userId` |
| Civilização histórica | `Civilization` | `Civilization` | `Civilization` | 1-2 habilidades + 1 unidade especial |
| Unidade militar | `Unit` | `GameUnit` | `GameUnit` | ⚠ Swift/Kotlin: `Unit` é tipo built-in (Void-like); usar `GameUnit` nos clients nativos |
| Cidade | `City` | `City` | `City` | Posição + dono + população + especialização + nível |
| Coordenada hexagonal | `HexCoord` | `HexCoord` | `HexCoord` | Coordenadas axiais (q, r); cúbicas derivadas quando necessário |
| Disputa de combate | `CombatDispute` | `CombatDispute` | `CombatDispute` | Combate assíncrono pendente ~24h entre jogadores diferentes |
| Pacto de não-agressão | `NonAggressionPact` | `NonAggressionPact` | `NonAggressionPact` | Única diplomacia da v1; só válido após contato entre jogadores |
| Desafio diário | `DailyChallenge` | `DailyChallenge` | `DailyChallenge` | Partida solo com seed do dia (compartilhada entre todos os jogadores) |

---

## Enums

| Conceito (PT) | TS | Swift | Kotlin | Valores esperados |
|---|---|---|---|---|
| Estado do turno | `TurnState` | `TurnState` | `TurnState` | `waitingForAction` · `processing` · `completed` |
| Especialização de cidade | `CitySpecialization` | `CitySpecialization` | `CitySpecialization` | `military` · `commercial` · `scientific` |
| Tipo de recurso | `ResourceType` | `ResourceType` | `ResourceType` | `gold` · `food` · `production` |
| Era de desenvolvimento | `Era` | `Era` | `Era` | TBD em Fase 1; pelo menos `ancient`, `classical`, `medieval` |
| Estado da disputa de combate | `CombatDisputeStatus` | `CombatDisputeStatus` | `CombatDisputeStatus` | `pending` · `resolvedByAction` · `resolvedByTimeout` |

---

## Propriedades de estado (nomes canônicos de campos)

| Conceito (PT) | TS | Swift | Kotlin | Contexto |
|---|---|---|---|---|
| Jogador atual (vez de quem é) | `currentPlayer` | `currentPlayer` | `currentPlayer` | Propriedade de `GameState` |
| Número do turno | `turnNumber` | `turnNumber` | `turnNumber` | Propriedade de `GameState` |
| Jogador eliminado | `isEliminated` | `isEliminated` | `isEliminated` | Propriedade de `Player` |
| Visibilidade / fog of war | `visibleHexes` | `visibleHexes` | `visibleHexes` | Set de `HexCoord` visíveis para um jogador |
| Hexágonos já explorados (memória) | `exploredHexes` | `exploredHexes` | `exploredHexes` | Persiste entre turnos; diferente de `visibleHexes` |
| XP de conta | `accountXp` | `accountXp` | `accountXp` | Propriedade do perfil de usuário |

---

## Conceitos de IA

| Conceito (PT) | TS | Swift | Kotlin | Notas |
|---|---|---|---|---|
| IA seguradora de posição | `substituteAI` | `substituteAI` | `substituteAI` | Assume turno de jogador ausente; conservadora, não declara guerra |
| IA oponente | `opponentAI` | `opponentAI` | `opponentAI` | Preenche vagas e modo solo; mais ativa/estratégica |

---

## Expansão futura

Adicionar termos aqui quando entrarem nos prompts da Fase 1+:
- Tipos de terreno (`TerrainType`)
- Bônus de terreno em combate (`TerrainBonus`)
- Proposta diplomática (`DiplomaticProposal`)
- Troca de recursos (`ResourceTrade`)
- Pontuação de vitória (`VictoryScore`)
- Perfil de usuário / conta (`UserProfile`)
- Notificação Realtime (`RealtimeEvent`)
