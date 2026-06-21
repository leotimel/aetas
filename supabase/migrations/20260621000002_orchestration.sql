-- ============================================================
-- Aetas — Orchestration support
-- Migration: 20260621000002_orchestration.sql
--
-- Adds the concurrency primitives the Edge Functions need:
--   • games.state_version  — monotonic optimistic-lock counter, bumped on EVERY
--     successful write. The universal CAS guard. The (turn_number, current_player_id)
--     tuple alone is insufficient: initiateCombat / respondToDispute / any intra-turn
--     action does not change the tuple, so two intra-turn races would both pass a
--     tuple-only guard. state_version catches every race.
--   • games.turn_deadline  — when the substitute AI may take over an absent player.
--   • apply_game_turn()        — atomic CAS persist of a turn-advancing action.
--   • resolve_combat_dispute() — atomic CAS persist of a dispute resolution.
--
-- IMPORTANT: these RPCs NEVER compute game logic. The game-engine (TypeScript,
-- in the Edge Function) computes the new GameState; these functions only persist
-- it under a CAS guard, in a single transaction. "Only game-engine defines rules"
-- stays literal — Postgres is dumb storage with a compare-and-swap latch.
-- ============================================================

-- ── Columns ────────────────────────────────────────────────────────────────────

ALTER TABLE games ADD COLUMN state_version bigint      NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN turn_deadline timestamptz;

-- substitute-AI sweep: active games whose current turn deadline has passed
CREATE INDEX ON games (turn_deadline) WHERE NOT is_finished;


-- ── apply_game_turn ──────────────────────────────────────────────────────────
-- Persists one turn-advancing action (endTurn / initiateCombat) atomically:
-- guarded games UPDATE + dispute upserts + dispute status updates + elimination sync.
-- Returns true if the CAS matched (committed), false if it lost the race.

CREATE OR REPLACE FUNCTION apply_game_turn(
  p_game_id              uuid,
  p_expected_version     bigint,
  p_new_state            jsonb,
  p_new_turn             integer,
  p_new_player           text,
  p_is_finished          boolean,
  p_winner               text,
  p_turn_deadline        timestamptz,
  p_dispute_inserts      jsonb,   -- [{id, attacker_player_id, defender_player_id, status, expires_at}]
  p_dispute_status_updates jsonb, -- [{id, status}]
  p_eliminations         jsonb    -- ["enginePlayerId", ...]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS
$$
DECLARE
  rec jsonb;
BEGIN
  -- CAS guard: only the writer that still sees the expected version wins.
  UPDATE games SET
    game_state        = p_new_state,
    turn_number       = p_new_turn,
    current_player_id = p_new_player,
    is_finished       = p_is_finished,
    winner_id         = p_winner,
    turn_deadline     = p_turn_deadline,
    state_version     = state_version + 1
  WHERE id = p_game_id
    AND state_version = p_expected_version;   -- ← THE CAS GUARD

  IF NOT FOUND THEN
    RETURN false;  -- another write got here first; caller should refetch + retry
  END IF;

  -- New disputes opened this action (initiateCombat).
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(p_dispute_inserts, '[]'::jsonb))
  LOOP
    INSERT INTO combat_disputes (id, game_id, attacker_player_id, defender_player_id, status, expires_at)
    VALUES (
      rec ->> 'id', p_game_id,
      rec ->> 'attacker_player_id', rec ->> 'defender_player_id',
      rec ->> 'status',
      to_timestamp((rec ->> 'expires_at')::bigint / 1000.0)
    )
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
  END LOOP;

  -- Disputes whose status changed (e.g. resolved-by-timeout inside endTurn).
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(p_dispute_status_updates, '[]'::jsonb))
  LOOP
    UPDATE combat_disputes SET status = rec ->> 'status'
    WHERE id = rec ->> 'id' AND game_id = p_game_id;
  END LOOP;

  -- Players newly eliminated this action.
  IF jsonb_array_length(COALESCE(p_eliminations, '[]'::jsonb)) > 0 THEN
    UPDATE game_players SET is_eliminated = true
    WHERE game_id = p_game_id
      AND engine_player_id IN (
        SELECT jsonb_array_elements_text(p_eliminations)
      );
  END IF;

  RETURN true;
END;
$$;


-- ── resolve_combat_dispute ───────────────────────────────────────────────────
-- Persists one dispute resolution atomically, under TWO guards:
--   (1) the dispute is still 'pending'  (prevents double-resolve), and
--   (2) games.state_version matches     (prevents stale-state overwrite).
-- Both must hold; otherwise the whole transaction rolls back and returns false.

CREATE OR REPLACE FUNCTION resolve_combat_dispute(
  p_game_id          uuid,
  p_expected_version bigint,
  p_dispute_id       text,
  p_new_state        jsonb,
  p_new_status       text,
  p_extra_status_updates jsonb,  -- [{id, status}] other disputes the engine touched
  p_eliminations     jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS
$$
DECLARE
  rec jsonb;
BEGIN
  -- CAS guard 1: dispute must still be pending.
  UPDATE combat_disputes SET status = p_new_status
  WHERE id = p_dispute_id AND game_id = p_game_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN false;  -- someone already resolved it
  END IF;

  -- CAS guard 2: game version must still match. If not, roll back guard 1 too.
  UPDATE games SET
    game_state    = p_new_state,
    state_version = state_version + 1
  WHERE id = p_game_id
    AND state_version = p_expected_version;   -- ← THE CAS GUARD

  IF NOT FOUND THEN
    -- Raising inside the function's implicit transaction rolls back the dispute
    -- UPDATE above, so neither change lands. Caller treats false/exception as conflict.
    RAISE EXCEPTION 'aetas_version_conflict'
      USING ERRCODE = 'serialization_failure';
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(p_extra_status_updates, '[]'::jsonb))
  LOOP
    UPDATE combat_disputes SET status = rec ->> 'status'
    WHERE id = rec ->> 'id' AND game_id = p_game_id;
  END LOOP;

  IF jsonb_array_length(COALESCE(p_eliminations, '[]'::jsonb)) > 0 THEN
    UPDATE game_players SET is_eliminated = true
    WHERE game_id = p_game_id
      AND engine_player_id IN (
        SELECT jsonb_array_elements_text(p_eliminations)
      );
  END IF;

  RETURN true;
END;
$$;

-- These RPCs are privileged (service role). They run with definer rights and are
-- only called by Edge Functions using the service role key, never by clients.
REVOKE EXECUTE ON FUNCTION apply_game_turn       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION resolve_combat_dispute FROM anon, authenticated;
