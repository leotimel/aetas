// @aetas/backend-core — orchestration between the pure game-engine and the
// persistence layer. No I/O concretion here: everything depends on the GameRepo
// port, so it runs and is fully tested under Vitest without a database.
//
// The Supabase adapter (SupabaseGameRepo) lives Deno-side in supabase/functions/
// and implements GameRepo against the apply_game_turn / resolve_combat_dispute RPCs.
export * from './repository.js'
export * from './disputes.js'
export * from './orchestration.js'
