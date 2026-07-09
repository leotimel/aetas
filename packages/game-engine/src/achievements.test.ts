import { describe, it, expect } from 'vitest'
import { ACHIEVEMENTS, ACHIEVEMENT_CATALOG, getAchievement } from './achievements.js'

describe('ACHIEVEMENT_CATALOG', () => {
  it('has 13 achievements, each with a unique id matching its map key', () => {
    expect(ACHIEVEMENT_CATALOG.size).toBe(13)
    expect(ACHIEVEMENTS).toHaveLength(13)
    for (const [id, def] of ACHIEVEMENT_CATALOG) {
      expect(def.id).toBe(id)
      expect(def.icon).toBeTruthy()
      expect(def.name).toBeTruthy()
      expect(def.description).toBeTruthy()
      expect(def.condition).toBeDefined()
    }
  })

  it('every counting condition has a positive threshold', () => {
    for (const def of ACHIEVEMENTS) {
      const c = def.condition
      if (c.kind === 'winCount' || c.kind === 'level' || c.kind === 'dailyStreak' || c.kind === 'eventCount') {
        expect(c.threshold).toBeGreaterThan(0)
      }
      if (c.kind === 'eventCount') expect(c.event).toBeTruthy()
    }
  })

  it('getAchievement returns the def for a known id and undefined otherwise', () => {
    expect(getAchievement('first_win')?.category).toBe('victory')
    expect(getAchievement('emperor')?.condition).toEqual({ kind: 'level', threshold: 20 })
    expect(getAchievement('nope')).toBeUndefined()
  })
})
