-- 006_polar_rename.sql
--
-- We swapped the billing provider from Stripe to Polar.sh because
-- Stripe is invite-only for Indian businesses. Polar's data model is
-- almost identical (customers, subscriptions, statuses, periods), so
-- we just rename the two id columns.
--
-- Safe to run even if 005 was never applied: the renames are guarded.

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

-- Recreate the unique indexes against the new column names.
DROP INDEX IF EXISTS public.subscriptions_stripe_customer_idx;
DROP INDEX IF EXISTS public.subscriptions_stripe_subscription_idx;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_polar_customer_idx
  ON public.subscriptions (polar_customer_id) WHERE polar_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_polar_subscription_idx
  ON public.subscriptions (polar_subscription_id) WHERE polar_subscription_id IS NOT NULL;
