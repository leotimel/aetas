// Achievements — pure static catalog (no I/O). The unlock CONDITIONS are
// evaluated server-side by the check-achievement Edge Function; this module is
// the single source of truth for the roster, thresholds and display strings
// (PT, rendered directly like WONDERS/CIVILIZATIONS).

export type AchievementCategory = 'victory' | 'combat' | 'level' | 'building' | 'expansion'

export type AchievementCondition =
  | { readonly kind: 'winCount';    readonly threshold: number }
  | { readonly kind: 'level';       readonly threshold: number }
  | { readonly kind: 'allCivs' }
  | { readonly kind: 'dailyStreak'; readonly threshold: number }
  | { readonly kind: 'eventCount';  readonly event: string; readonly threshold: number }
  | { readonly kind: 'gameState';   readonly check: 'domination' | 'wonder' | 'metropolis' }

export interface AchievementDefinition {
  readonly id:          string
  readonly icon:        string
  readonly category:    AchievementCategory
  readonly name:        string
  readonly description: string
  readonly condition:   AchievementCondition
}

const CATALOG_ENTRIES: readonly AchievementDefinition[] = [
  { id: 'first_win',        icon: '🏆', category: 'victory',   name: 'Primeira Vitória', description: 'Vença sua primeira partida.',
    condition: { kind: 'winCount', threshold: 1 } },
  { id: 'veteran',          icon: '🏆', category: 'victory',   name: 'Veterano',         description: 'Vença 10 partidas.',
    condition: { kind: 'winCount', threshold: 10 } },
  { id: 'first_blood',      icon: '⚔️', category: 'combat',    name: 'Primeiro Sangue',  description: 'Vença seu primeiro combate.',
    condition: { kind: 'eventCount', event: 'combat_won', threshold: 1 } },
  { id: 'total_domination', icon: '⚔️', category: 'combat',    name: 'Dominação Total',  description: 'Vença eliminando todos os oponentes.',
    condition: { kind: 'gameState', check: 'domination' } },
  { id: 'conqueror',        icon: '⚔️', category: 'combat',    name: 'Conquistador',     description: 'Capture 5 cidades inimigas.',
    condition: { kind: 'eventCount', event: 'city_captured', threshold: 5 } },
  { id: 'consul',           icon: '👑', category: 'level',     name: 'Cônsul',           description: 'Alcance o nível 5.',
    condition: { kind: 'level', threshold: 5 } },
  { id: 'emperor',          icon: '👑', category: 'level',     name: 'Imperador',        description: 'Alcance o nível 20 (máximo).',
    condition: { kind: 'level', threshold: 20 } },
  { id: 'collector',        icon: '👑', category: 'level',     name: 'Colecionador',     description: 'Desbloqueie todas as civilizações.',
    condition: { kind: 'allCivs' } },
  { id: 'architect',        icon: '🛡️', category: 'building',  name: 'Arquiteto',        description: 'Construa uma Maravilha do Mundo.',
    condition: { kind: 'gameState', check: 'wonder' } },
  { id: 'metropolis',       icon: '🛡️', category: 'building',  name: 'Metrópole',        description: 'Leve uma cidade ao nível 3.',
    condition: { kind: 'gameState', check: 'metropolis' } },
  { id: 'founder',          icon: '⭐', category: 'expansion', name: 'Fundador',         description: 'Funde uma segunda cidade.',
    condition: { kind: 'eventCount', event: 'city_founded', threshold: 2 } },
  { id: 'diplomat',         icon: '⭐', category: 'expansion', name: 'Diplomata',        description: 'Assine 5 pactos de não-agressão.',
    condition: { kind: 'eventCount', event: 'pact_signed', threshold: 5 } },
  { id: 'streak7',          icon: '⭐', category: 'expansion', name: 'Sequência de 7',   description: '7 dias seguidos no desafio diário.',
    condition: { kind: 'dailyStreak', threshold: 7 } },
]

export const ACHIEVEMENT_CATALOG: ReadonlyMap<string, AchievementDefinition> =
  new Map(CATALOG_ENTRIES.map(a => [a.id, a]))

export const ACHIEVEMENTS: readonly AchievementDefinition[] = CATALOG_ENTRIES

export function getAchievement(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_CATALOG.get(id)
}
