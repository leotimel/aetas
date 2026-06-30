-- Add daily streak tracking to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS daily_streak INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_daily_date DATE;

-- Atomic streak update called by award-xp Edge Function (service role).
-- Returns the new streak value.
-- Idempotency: if last_daily_date = today, no-op and returns current streak.
CREATE OR REPLACE FUNCTION update_daily_streak(p_user_id UUID, p_today DATE)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_last   DATE;
  v_streak INT;
  v_new    INT;
BEGIN
  SELECT last_daily_date, daily_streak INTO v_last, v_streak
  FROM profiles WHERE user_id = p_user_id;

  IF v_last = p_today THEN
    RETURN v_streak;                              -- already counted today
  ELSIF v_last = p_today - INTERVAL '1 day' THEN
    v_new := v_streak + 1;                        -- consecutive day
  ELSE
    v_new := 1;                                   -- gap or first time
  END IF;

  UPDATE profiles
  SET daily_streak = v_new, last_daily_date = p_today, updated_at = now()
  WHERE user_id = p_user_id;

  RETURN v_new;
END;
$$;
