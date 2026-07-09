-- Unlocked achievements per user — idempotency by (user_id, achievement_id).
-- Written only by the check-achievement Edge Function (service role, after a
-- server-side condition check). Read by the client on the Profile screen.

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT        NOT NULL,
  unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Owner can read their own achievements (for the Profile screen).
-- Writes happen only via the service role (Edge Function), which bypasses RLS,
-- so there is intentionally no INSERT/UPDATE policy for authenticated users.
CREATE POLICY "user_achievements_select"
  ON user_achievements FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
