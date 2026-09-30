-- Run once in the Supabase SQL editor. Safe to rerun.
-- Accounts that predate this column have already passed first-time setup.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'onboarding_seen'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN onboarding_seen boolean;
    UPDATE public.profiles SET onboarding_seen = true;
  END IF;
END $$;

UPDATE public.profiles SET onboarding_seen = true WHERE onboarding_seen IS NULL;
ALTER TABLE public.profiles ALTER COLUMN onboarding_seen SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN onboarding_seen SET NOT NULL;
