-- ============================================================
-- Aetas — Initial Schema
-- Migration: 20260621000000_initial_schema.sql
--
-- Design: hybrid JSONB + denormalised columns.
--   • games.game_state JSONB  → full GameState snapshot (zero impedance
--     mismatch with the pure-TS game-engine)
--   • games.{turn_number, current_player_id, is_finished} → denormalised
--     for atomic CAS in Edge Functions and for RLS predicates
--   • combat_disputes table   → separate CAS on dispute resolution
--     (prevents double-resolve race condition)
--   • game_players table      → enables "list my games" queries
--   • user_profiles table     → OAuth account data (XP, unlocks)
--   • daily_challenges table  → shared daily seed (Wordle-style)
-- ============================================================


-- ── Helpers ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ── Tables ────────────────────────────────────────────────────────────────────

-- 1. user_profiles
--    One row per Supabase Auth user. Created automatically on first OAuth login
--    (via trigger in Auth hook or Edge Function 2.2).
CREATE TABLE user_profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name text        NOT NULL,
  account_xp   integer     NOT NULL DEFAULT 0,
  -- civilization IDs unlocked by this account (references static game data)
  civ_unlocks  text[]      NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- 2. games
--    One row per game instance. The canonical source of truth is game_state JSONB.
--    turn_number / current_player_id / is_finished are denormalised from game_state
--    so Edge Functions can do a CAS UPDATE without parsing JSONB in SQL:
--
--      UPDATE games
--      SET    game_state = $new_state, current_player_id = $next, ...
--      WHERE  id = $game_id
--        AND  turn_number      = $expected_turn    -- CAS guard
--        AND  current_player_id = $expected_player  -- CAS guard
--
--    current_player_id is TEXT (not uuid) because:
--    - Human player IDs are Supabase Auth UUIDs cast to text (matches Player.id in types.ts)
--    - AI player IDs are synthetic strings ('ai-p1', etc.) — Edge Function acts as proxy
CREATE TABLE games (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_state           jsonb       NOT NULL,
  -- denormalised CAS columns (must always mirror game_state values):
  turn_number          integer     NOT NULL DEFAULT 1,
  current_player_id    text        NOT NULL,
  is_finished          boolean     NOT NULL DEFAULT false,
  winner_id            text,                          -- engine player id of winner; NULL while in progress
  max_turns            integer     NOT NULL,
  -- NULL for regular multiplayer; set for the shared daily challenge game
  daily_challenge_date date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- 3. game_players
--    Maps Supabase Auth users (and AI slots) into game turn order.
--    user_id is NULL for AI-controlled slots.
--    engine_player_id matches Player.id in the GameState JSONB.
CREATE TABLE game_players (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           uuid        NOT NULL REFERENCES games ON DELETE CASCADE,
  user_id           uuid        REFERENCES auth.users ON DELETE SET NULL,  -- NULL = AI slot
  engine_player_id  text        NOT NULL,   -- Player.id in GameState (= user_id::text for humans)
  slot_order        integer     NOT NULL,   -- 0-based turn order; determines currentPlayerId cycling
  is_ai             boolean     NOT NULL DEFAULT false,
  is_eliminated     boolean     NOT NULL DEFAULT false,  -- mirrored from GameState for quick queries
  joined_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, slot_order),
  UNIQUE (game_id, engine_player_id)
);


-- 4. combat_disputes
--    Extracted from game_state JSONB to enable atomic CAS on dispute resolution.
--    Prevents the double-resolve race: two players responding simultaneously.
--    id matches CombatDispute.id produced by the game-engine (deterministic string).
--    status CHECK mirrors CombatDisputeStatus enum in types.ts.
CREATE TABLE combat_disputes (
  id                 text        PRIMARY KEY,   -- engine-generated id (e.g. "dispute-u1-u2-0")
  game_id            uuid        NOT NULL REFERENCES games ON DELETE CASCADE,
  attacker_player_id text        NOT NULL,      -- engine player id
  defender_player_id text        NOT NULL,      -- engine player id
  status             text        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'resolvedByAction', 'resolvedByTimeout')),
  expires_at         timestamptz NOT NULL,      -- createdAt + 24h, for timeout queries
  created_at         timestamptz NOT NULL DEFAULT now()
);


-- 5. daily_challenges
--    Each date maps to exactly one game (shared seed = date string).
--    ON DELETE RESTRICT prevents accidental removal of the linked game.
CREATE TABLE daily_challenges (
  date    date PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games ON DELETE RESTRICT
);


-- ── Indexes ───────────────────────────────────────────────────────────────────

-- "which games is this user in?" — home screen query
CREATE INDEX ON game_players (user_id);

-- "who is in this game?" — join panel / player list
CREATE INDEX ON game_players (game_id);

-- "pending disputes for this game" — Edge Function timeout sweep
CREATE INDEX ON combat_disputes (game_id, status);

-- partial index: active games only (most queries filter is_finished = false)
CREATE INDEX ON games (is_finished) WHERE NOT is_finished;

-- daily challenge lookup
CREATE INDEX ON games (daily_challenge_date) WHERE daily_challenge_date IS NOT NULL;


-- ── Row Level Security ────────────────────────────────────────────────────────
--
-- All critical mutations (endTurn, resolveDispute, submitAction) go through
-- Edge Functions using the service role key, which bypasses RLS. These policies
-- are defence-in-depth: they block direct API calls that try to bypass the engine.

ALTER TABLE user_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE games            ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE combat_disputes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_challenges ENABLE ROW LEVEL SECURITY;

-- user_profiles --
-- Any authenticated user can read profiles (display names in game lobbies).
CREATE POLICY "profiles_select"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

-- Only the owner can insert/update their own profile.
CREATE POLICY "profiles_write"
  ON user_profiles FOR ALL
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- games --
-- A user can read a game only if they have a slot in it.
CREATE POLICY "games_select"
  ON games FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM game_players
      WHERE game_id = games.id
        AND user_id  = auth.uid()
    )
  );

-- A user can update a game only when it is their turn.
-- The engine guarantees current_player_id always matches auth.uid() for human players.
CREATE POLICY "games_update"
  ON games FOR UPDATE
  TO authenticated
  USING (
    is_finished = false
    AND current_player_id = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM game_players
      WHERE game_id = games.id
        AND user_id  = auth.uid()
    )
  )
  WITH CHECK (
    -- After endTurn, current_player_id will be the NEXT player — still
    -- a member of this game, so the WITH CHECK stays loose here.
    -- The Edge Function is the real validator; this is a fallback.
    EXISTS (
      SELECT 1 FROM game_players
      WHERE game_id = games.id
        AND user_id  = auth.uid()
    )
  );

-- game_players --
-- A user can see all player slots in any game they belong to.
CREATE POLICY "game_players_select"
  ON game_players FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM game_players gp2
      WHERE gp2.game_id = game_players.game_id
        AND gp2.user_id  = auth.uid()
    )
  );
-- Inserts/updates go through Edge Functions (service role); no client write policy.

-- combat_disputes --
-- Any player in the game can read its disputes.
CREATE POLICY "disputes_select"
  ON combat_disputes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM game_players
      WHERE game_id = combat_disputes.game_id
        AND user_id  = auth.uid()
    )
  );

-- Only the attacker or defender can resolve (flip status) a Pending dispute.
-- CAS: WHERE status = 'pending' prevents double-resolve.
CREATE POLICY "disputes_resolve"
  ON combat_disputes FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND (
      attacker_player_id = auth.uid()::text
      OR defender_player_id = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM game_players
      WHERE game_id = combat_disputes.game_id
        AND user_id  = auth.uid()
    )
  );

-- daily_challenges --
-- All authenticated users can read the daily challenge (it's public by design).
CREATE POLICY "daily_challenges_select"
  ON daily_challenges FOR SELECT
  TO authenticated
  USING (true);


-- ── Realtime ─────────────────────────────────────────────────────────────────
--
-- Clients subscribe to games (full state on every turn) and game_players
-- (to detect when a new player joins the lobby).

ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
