-- 005_subscriptions.sql
--
-- Per-user subscription state. One row per user; absence of a row =
-- free tier. Stripe is the source of truth — webhook upserts on
-- customer.subscription.* events.
--
-- Free tier caps (enforced application-side):
--   * 3 canvases max
--   * 50 LLM commands per day (command + text + image-search combined)
--   * Watermark on PNG / SVG / GIF exports
--
-- Pro tier ($12/month):
--   * Unlimited canvases + commands
--   * No watermark
--   * Public share links (free can also share, no extra cap here)

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier               text NOT NULL DEFAULT 'free',     -- 'free' | 'pro'
  status             text NOT NULL DEFAULT 'active',   -- mirrors Stripe status: active|trialing|past_due|canceled|incomplete
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_customer_idx
  ON public.subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_idx
  ON public.subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);
-- INSERT/UPDATE/DELETE happens only via service role from the webhook
-- and checkout routes — no client write policy is created.

CREATE OR REPLACE FUNCTION public.touch_subscription_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriptions_touch_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_touch_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_subscription_updated_at();
