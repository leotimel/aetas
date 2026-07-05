// ─── Seeded PRNG ──────────────────────────────────────────────────────────────
// djb2 string → uint32, then mulberry32 for the sequence. Every caller creates a
// fresh generator from the seed, so all consumers stay pure: same args → same
// result. Shared by map generation (map.ts) and world events (events.ts) so both
// draw from the SAME algorithm — never Math.random.

/** djb2 hash: string → uint32. */
export function djb2(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0
  }
  return h >>> 0
}

/** mulberry32: numeric seed → stateful generator producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let z = Math.imul(s ^ (s >>> 15), 1 | s)
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) >>> 0
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000
  }
}

/** Fresh generator from a string seed (used by map generation). */
export function createRng(seed: string): () => number {
  return mulberry32(djb2(seed))
}

/**
 * Deterministic per-round generator for world events. Namespaced with `:evt:`
 * so the event RNG stream is INDEPENDENT of the map-generation stream for the
 * same seed — same seed + round → same events, on the same turns, for everyone.
 */
export function rngForTurn(seed: string, round: number): () => number {
  return mulberry32(djb2(`${seed}:evt:${round}`))
}
