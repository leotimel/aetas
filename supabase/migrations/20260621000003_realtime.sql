-- ============================================================
-- Aetas — Realtime notification events
-- Migration: 20260621000003_realtime.sql
--
-- Emits three SEMANTIC events to clients via Supabase Realtime Broadcast, from
-- Postgres triggers (server-authoritative: they fire on the committed DB change,
-- so they cover BOTH the Edge Function path and the timeout-sweep path, and never
-- fire on a write that rolled back):
--
--   • turn_changed     — the turn passed to a new current player
--   • dispute_resolved — a combat dispute left 'pending' (action or timeout)
--   • game_over        — the game finished (winner decided or last player standing)
--
-- Channel model: ONE private channel per game, topic `game:<gameId>`. Every
-- participant subscribes to it; each event names the player(s) it concerns so the
-- client reacts only to the ones about itself (e.g. currentPlayerId === myId).
-- Payloads are small NOTIFICATIONS — the client refetches the full GameState
-- (RLS-gated SELECT on games) when it receives a relevant event. See docs/REALTIME.md.
--
-- Why Broadcast (realtime.send) and not postgres_changes for these?
--   • Named semantic events instead of clients diffing raw rows.
--   • combat_disputes is not in the postgres_changes publication; broadcast needs
--     no publication membership.
--   • Broadcast scales better and lets us authorize a whole game topic at once.
-- (postgres_changes on `games` from migration 2.1 still works as an optional
--  full-row stream; the two are complementary.)
-- ============================================================

-- ── games: turn_changed + game_over ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION emit_game_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS
$$
BEGIN
  -- The turn passed to a different player (normal advance). Does NOT fire on a
  -- game-ending turn, where current_player_id stays the acting player.
  IF NEW.current_player_id IS DISTINCT FROM OLD.current_player_id THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'gameId',          NEW.id,
        'turnNumber',      NEW.turn_number,
        'currentPlayerId', NEW.current_player_id
      ),
      'turn_changed',
      'game:' || NEW.id::text,
      true  -- private channel
    );
  END IF;

  -- The game just finished.
  IF NEW.is_finished AND NOT OLD.is_finished THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'gameId',    NEW.id,
        'winnerId',  NEW.winner_id,   -- null on a draw
        'finalTurn', NEW.turn_number
      ),
      'game_over',
      'game:' || NEW.id::text,
      true
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER games_realtime_events
  AFTER UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION emit_game_events();


-- ── combat_disputes: dispute_resolved ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION emit_dispute_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS
$$
BEGIN
  -- A pending dispute was resolved (by a player's action OR by timeout).
  IF OLD.status = 'pending' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'gameId',           NEW.game_id,
        'disputeId',        NEW.id,
        'status',           NEW.status,           -- 'resolvedByAction' | 'resolvedByTimeout'
        'attackerPlayerId', NEW.attacker_player_id,
        'defenderPlayerId', NEW.defender_player_id
      ),
      'dispute_resolved',
      'game:' || NEW.game_id::text,
      true
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER combat_disputes_realtime_events
  AFTER UPDATE ON combat_disputes
  FOR EACH ROW EXECUTE FUNCTION emit_dispute_events();


-- ── Private channel authorization ──────────────────────────────────────────────
-- A client may RECEIVE broadcasts on topic `game:<id>` only if it holds a slot in
-- that game. realtime.topic() returns the topic being evaluated. Clients must call
-- supabase.realtime.setAuth() (user JWT) before subscribing to a private channel.

CREATE POLICY "game_participants_read_broadcasts"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE 'game:%'
    AND EXISTS (
      SELECT 1 FROM public.game_players gp
      WHERE gp.user_id = auth.uid()
        AND ('game:' || gp.game_id::text) = realtime.topic()
    )
  );
