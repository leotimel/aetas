-- ============================================================
-- Aetas — Auth Trigger
-- Migration: 20260621000001_auth_trigger.sql
--
-- Creates a user_profiles row automatically the first time a
-- user signs in via OAuth (Google or Apple). The display_name
-- is taken from the OAuth provider's metadata.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER                 -- runs as the function owner, not the caller
SET search_path = public AS
$$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',   -- Google
      NEW.raw_user_meta_data ->> 'name',         -- Apple
      'Player'                                   -- fallback
    )
  )
  ON CONFLICT (id) DO NOTHING;  -- idempotent: safe on re-authentication

  RETURN NEW;
END;
$$;

-- Fire after every new row in auth.users (i.e. first OAuth sign-in)
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
