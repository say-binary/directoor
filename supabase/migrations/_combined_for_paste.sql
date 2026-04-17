-- Combined Directoor migrations 003 + 004 + 005 + 006 (Polar version)
--
-- Paste this entire block into the Supabase SQL editor and click Run.
-- Safe to re-run: every CREATE/INDEX/POLICY uses IF [NOT] EXISTS guards.
-- Builds: user_images, command_logs, subscriptions (with polar_* columns).

------------------------------------------------------------------------
-- 003 — user_images (image library, per-user)
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_images (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_id    text NOT NULL,
  url         text NOT NULL,
  thumbnail   text NOT NULL,
  title       text DEFAULT '',
  width       int  DEFAULT 0,
  height      int  DEFAULT 0,
  creator     text,
  license     text,
  source      text,
  query       text DEFAULT '',
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, image_id)
);

CREATE INDEX IF NOT EXISTS user_images_user_added_idx
  ON public.user_images (user_id, added_at DESC);

ALTER TABLE public.user_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_images_select_own" ON public.user_images;
CREATE POLICY "user_images_select_own"
  ON public.user_images FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_images_insert_own" ON public.user_images;
CREATE POLICY "user_images_insert_own"
  ON public.user_images FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_images_update_own" ON public.user_images;
CREATE POLICY "user_images_update_own"
  ON public.user_images FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_images_delete_own" ON public.user_images;
CREATE POLICY "user_images_delete_own"
  ON public.user_images FOR DELETE
  USING (auth.uid() = user_id);

------------------------------------------------------------------------
-- 004 — command_logs (proprietary moat dataset + thumbs feedback)
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.command_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  canvas_id     uuid REFERENCES public.canvases(id) ON DELETE SET NULL,
  route         text NOT NULL,
  mode          text,
  prompt        text NOT NULL,
  prompt_chars  int  NOT NULL DEFAULT 0,
  context_meta  jsonb DEFAULT '{}'::jsonb,
  model         text,
  input_tokens  int  DEFAULT 0,
  output_tokens int  DEFAULT 0,
  latency_ms    int  DEFAULT 0,
  status        text NOT NULL DEFAULT 'ok',
  error_message text,
  response_preview text,
  feedback      smallint,
  feedback_at   timestamptz,
  feedback_note text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS command_logs_user_idx
  ON public.command_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS command_logs_route_idx
  ON public.command_logs (route, created_at DESC);
CREATE INDEX IF NOT EXISTS command_logs_feedback_idx
  ON public.command_logs (feedback) WHERE feedback IS NOT NULL;

ALTER TABLE public.command_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "command_logs_select_own" ON public.command_logs;
CREATE POLICY "command_logs_select_own"
  ON public.command_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "command_logs_update_feedback_own" ON public.command_logs;
CREATE POLICY "command_logs_update_feedback_own"
  ON public.command_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

------------------------------------------------------------------------
-- 005 + 006 — subscriptions (Polar billing state)
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier               text NOT NULL DEFAULT 'free',
  status             text NOT NULL DEFAULT 'active',
  polar_customer_id  text,
  polar_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- If you previously ran the Stripe-named version of 005, rename columns now.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE public.subscriptions
      RENAME COLUMN stripe_customer_id TO polar_customer_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'stripe_subscription_id'
  ) THEN
    ALTER TABLE public.subscriptions
      RENAME COLUMN stripe_subscription_id TO polar_subscription_id;
  END IF;
END $$;

DROP INDEX IF EXISTS public.subscriptions_stripe_customer_idx;
DROP INDEX IF EXISTS public.subscriptions_stripe_subscription_idx;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_polar_customer_idx
  ON public.subscriptions (polar_customer_id) WHERE polar_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_polar_subscription_idx
  ON public.subscriptions (polar_subscription_id) WHERE polar_subscription_id IS NOT NULL;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);
-- INSERT/UPDATE/DELETE only via service role from webhook + checkout routes.

CREATE OR REPLACE FUNCTION public.touch_subscription_updated_at()
RETURNS trigger AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriptions_touch_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_touch_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_subscription_updated_at();
