-- Explicit map seed and size stored per game.
-- seed: the string used to generate the map (separate from gameId).
-- map_size: 'small' | 'medium' | 'large' (defaults to 'medium').

ALTER TABLE games ADD COLUMN IF NOT EXISTS seed      TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS map_size  TEXT NOT NULL DEFAULT 'medium';
