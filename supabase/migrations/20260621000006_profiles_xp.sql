-- ─── Profiles ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  user_id      UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp           INTEGER NOT NULL DEFAULT 0,
  selected_civ TEXT    NOT NULL DEFAULT 'romans',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Auto-create a profile row when a new Supabase Auth user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (user_id) VALUES (new.id) ON CONFLICT DO NOTHING;
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Atomic upsert + increment — used by award-xp Edge Function (service role)
CREATE OR REPLACE FUNCTION increment_xp(p_user_id UUID, p_xp INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (user_id, xp) VALUES (p_user_id, p_xp)
  ON CONFLICT (user_id) DO UPDATE SET xp = profiles.xp + p_xp, updated_at = now();
END;
$$;

-- ─── Mark when XP has been awarded for a game (prevents double-awarding) ──────

ALTER TABLE games ADD COLUMN IF NOT EXISTS xp_awarded BOOLEAN NOT NULL DEFAULT false;
