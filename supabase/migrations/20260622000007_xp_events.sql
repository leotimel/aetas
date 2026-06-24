-- Per-action XP events table — idempotency by (user_id, action_id)
-- Used by the granular award-xp flow (turn played, city founded, era advanced, etc.)

CREATE TABLE IF NOT EXISTS xp_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_id   TEXT    NOT NULL,
  event_type  TEXT    NOT NULL,
  xp_gained   INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, action_id)
);

ALTER TABLE xp_events ENABLE ROW LEVEL SECURITY;
-- Service role bypasses RLS; no user-facing reads needed.
