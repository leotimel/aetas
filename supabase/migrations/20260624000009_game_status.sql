-- BX2: game status and human slot count for multiplayer lobby support.
-- 'lobby'  = game created, awaiting human players to join via invite link
-- 'active' = all human slots filled, game is in progress
-- 'finished' = game ended (mirrors is_finished=true)
ALTER TABLE games ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- How many human (non-AI) slots this game has.
-- 1 = solo (only creator); >1 = multiplayer or mixed, starts as 'lobby'
ALTER TABLE games ADD COLUMN IF NOT EXISTS human_slots INTEGER NOT NULL DEFAULT 1;
