-- Daily challenge columns
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS is_daily   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_date TEXT;

-- Fast lookup: all daily games for a given date
CREATE INDEX IF NOT EXISTS idx_games_daily_date
  ON games (daily_date)
  WHERE is_daily = true;
