import { describe, it, expect } from 'vitest'
import {
  xpToLevel,
  xpForNextLevel,
  xpProgress,
  XP_FOR_PLAYING,
  XP_WIN_BONUS,
  XP_DAILY_BASE,
  XP_DAILY_WIN,
} from './civs.js'

// ─── Suite 1 — XP constants são positivos ────────────────────────────────────

describe('XP constants', () => {
  it('XP_FOR_PLAYING ≥ 1', () => expect(XP_FOR_PLAYING).toBeGreaterThanOrEqual(1))
  it('XP_WIN_BONUS ≥ 1',   () => expect(XP_WIN_BONUS).toBeGreaterThanOrEqual(1))
  it('XP_DAILY_BASE ≥ 1',  () => expect(XP_DAILY_BASE).toBeGreaterThanOrEqual(1))
  it('XP_DAILY_WIN ≥ 1',   () => expect(XP_DAILY_WIN).toBeGreaterThanOrEqual(1))
  it('XP total nunca fica negativo para qualquer combinação de jogo', () => {
    const options = [
      XP_FOR_PLAYING,
      XP_FOR_PLAYING + XP_WIN_BONUS,
      XP_DAILY_BASE,
      XP_DAILY_BASE + XP_DAILY_WIN,
    ]
    for (const v of options) expect(v).toBeGreaterThan(0)
  })
  it('daily paga mais que regular em derrota', () => {
    expect(XP_DAILY_BASE).toBeGreaterThan(XP_FOR_PLAYING)
  })
})

// ─── Suite 2 — xpToLevel: level sobe no threshold correto ────────────────────

describe('xpToLevel', () => {
  it('0 XP → nível 1',   () => expect(xpToLevel(0)).toBe(1))
  it('49 XP → nível 1',  () => expect(xpToLevel(49)).toBe(1))
  it('50 XP → nível 2',  () => expect(xpToLevel(50)).toBe(2))
  it('149 XP → nível 2', () => expect(xpToLevel(149)).toBe(2))
  it('150 XP → nível 3', () => expect(xpToLevel(150)).toBe(3))
  it('299 XP → nível 3', () => expect(xpToLevel(299)).toBe(3))
  it('300 XP → nível 4', () => expect(xpToLevel(300)).toBe(4))
  it('499 XP → nível 4', () => expect(xpToLevel(499)).toBe(4))
  it('500 XP → nível 5', () => expect(xpToLevel(500)).toBe(5))
  it('749 XP → nível 5', () => expect(xpToLevel(749)).toBe(5))
  it('750 XP → nível 6', () => expect(xpToLevel(750)).toBe(6))
  it('1050 XP → nível 7', () => expect(xpToLevel(1050)).toBe(7))
  it('1400 XP → nível 8', () => expect(xpToLevel(1400)).toBe(8))
  it('1800 XP → nível 9', () => expect(xpToLevel(1800)).toBe(9))
  it('99999 XP → nível máximo 20 (não lança)', () => {
    const level = xpToLevel(99999)
    expect(level).toBe(20)
  })
  it('nível nunca fica abaixo de 1 mesmo com XP 0', () => {
    expect(xpToLevel(0)).toBeGreaterThanOrEqual(1)
  })
})

// ─── Suite 3 — xpForNextLevel ────────────────────────────────────────────────

describe('xpForNextLevel', () => {
  it('nível 1 → próximo em 50', () => expect(xpForNextLevel(1)).toBe(50))
  it('nível 2 → próximo em 150', () => expect(xpForNextLevel(2)).toBe(150))
  it('nível 9 → próximo em 2250 (deixou de ser o teto na expansão pra 20 níveis)', () => expect(xpForNextLevel(9)).toBe(2250))
  it('nível 20 (max) → Infinity', () => expect(xpForNextLevel(20)).toBe(Infinity))
})

// ─── Suite 4 — xpProgress ────────────────────────────────────────────────────

describe('xpProgress', () => {
  it('0 XP → progresso 0 de 50 (range do nível 1)', () => {
    const [cur, range] = xpProgress(0)
    expect(cur).toBe(0)
    expect(range).toBe(50)
  })

  it('75 XP → progresso 25 de 100 (nível 2: 50→150)', () => {
    const [cur, range] = xpProgress(75)
    expect(cur).toBe(25)
    expect(range).toBe(100)
  })

  it('progresso nunca excede range no threshold exato', () => {
    const [cur, range] = xpProgress(50)
    expect(cur).toBe(0)
    expect(range).toBeGreaterThan(0)
  })

  it('progresso sempre [0, range] para XP abaixo do nível máximo', () => {
    for (const xp of [0, 1, 49, 50, 100, 300, 750]) {
      const [cur, range] = xpProgress(xp)
      expect(cur).toBeGreaterThanOrEqual(0)
      expect(range).toBeGreaterThan(0)
      expect(cur).toBeLessThanOrEqual(range)
    }
  })

  it('no nível máximo (9500 XP), cur e range são 0 (sem próximo nível)', () => {
    const [cur, range] = xpProgress(9500)
    expect(cur).toBe(0)
    expect(range).toBe(0)
  })
})

// ─── Suite 5 — Idempotência (lógica de nível) ────────────────────────────────
// A idempotência real é garantida pelo Postgres UNIQUE(user_id, action_id).
// Aqui testamos a premissa: re-processar o mesmo XP não muda o nível.

describe('idempotência de nível (sem XP duplo)', () => {
  it('adicionar 0 XP não muda o nível', () => {
    const base = 150  // nível 3
    expect(xpToLevel(base + 0)).toBe(xpToLevel(base))
  })

  it('aplicar o mesmo evento duas vezes vs uma vez deve resultar em nível diferente ou igual', () => {
    const eventXp = 5
    const startXp = 45  // nível 1, faltam 5 para nível 2
    const once    = xpToLevel(startXp + eventXp)     // → 50 = nível 2
    const twice   = xpToLevel(startXp + eventXp * 2) // → 55 = nível 2 (mesmo)
    // A idempotência impede o segundo pagamento; o nivel deve ser o mesmo que com 1 aplicação
    expect(once).toBe(2)
    // Se o XP duplicado fosse aplicado, o nível seria o mesmo para este caso específico
    expect(twice).toBe(2)
  })
})
