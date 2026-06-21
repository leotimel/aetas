-- Fix infinite recursion in game_players RLS.
--
-- The original policy checked membership via a subquery on game_players itself,
-- causing Postgres to recurse indefinitely. The fix uses a direct user_id check:
-- users see only their own rows (sufficient, since player details for other
-- participants come from game_state JSONB, not queried from this table).
--
-- The games.games_select policy also referenced game_players, which could
-- recurse through the old policy. It is safe with the new direct-check policy
-- because the subquery in games_select will just do a direct user_id lookup.

DROP POLICY IF EXISTS "game_players_select" ON game_players;

CREATE POLICY "game_players_select"
  ON game_players FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
