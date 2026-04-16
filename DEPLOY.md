# Deploying Directoor to Vercel

One-time setup. Total time: ~10 minutes.

## 1. Apply pending Supabase migrations

In the Supabase SQL editor (or `supabase db push` if you've wired the CLI), run anything new under `supabase/migrations/` that hasn't been applied yet. As of today:

- `003_user_images.sql` — image library table
- `004_command_logs.sql` — proprietary command log + thumbs feedback
- `005_subscriptions.sql` — Stripe subscription state

## 2. Stripe (optional — skip if you're not charging yet)

Without Stripe, the app runs as "free for everyone": all features work, but the **Upgrade to Pro** button shows "Billing coming soon", caps still apply (3 canvases / 50 LLM calls per day), and exports get the watermark.

To turn billing on:

1. https://dashboard.stripe.com/apikeys → copy the **Secret key** → `STRIPE_SECRET_KEY`
2. https://dashboard.stripe.com/products → create a recurring product **Directoor Pro / $12 monthly** → copy the price id (`price_…`) → `STRIPE_PRO_PRICE_ID`
3. https://dashboard.stripe.com/webhooks → add endpoint `https://YOUR-DOMAIN/api/stripe/webhook` listening to `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` → copy the signing secret (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`

## 3. Vercel project

1. Import the repo at https://vercel.com/new
2. **Framework preset:** Next.js (auto-detected)
3. **Root directory:** leave at repo root (the `vercel.json` at the root tells Vercel about the monorepo)
4. **Install command:** `pnpm install --frozen-lockfile` (auto-set by `vercel.json`)
5. **Build command:** `pnpm --filter @directoor/web build` (auto-set by `vercel.json`)
6. **Environment variables** — copy these from your `.env.local`:

   | Var | Required |
   |---|---|
   | `ANTHROPIC_API_KEY` | yes |
   | `NEXT_PUBLIC_SUPABASE_URL` | yes |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes |
   | `SUPABASE_SERVICE_ROLE_KEY` | yes |
   | `GOOGLE_CLIENT_ID` | yes (for OAuth) |
   | `GOOGLE_CLIENT_SECRET` | yes (for OAuth) |
   | `GOOGLE_AI_API_KEY` | optional |
   | `STRIPE_SECRET_KEY` | optional |
   | `STRIPE_PRO_PRICE_ID` | optional |
   | `STRIPE_WEBHOOK_SECRET` | optional |

7. Hit **Deploy**.

## 4. Post-deploy

1. In Supabase **Auth → URL Configuration**, add the Vercel domain to the allowed redirects (e.g. `https://YOUR-DOMAIN/auth/callback`).
2. In Google Cloud Console **OAuth credentials**, add the Vercel domain to authorized redirect URIs (same `/auth/callback` path).
3. Smoke-test:
   - Sign in with Google
   - Double-click → "show me golden retrievers" → image picker pops
   - Make any diagram → 👍 / 👎 → check that a row lands in `command_logs`
   - Click **Share** → toggle public → open the URL in a private window → should render
   - Click **PNG** → file should have the "Made with Directoor" watermark in the bottom-right
   - (If Stripe is configured) **Upgrade to Pro** → checkout → after returning, the watermark goes away and caps are lifted

## 5. Domain

Once verified, point your domain at the Vercel deployment via the Vercel dashboard. Vercel handles TLS automatically.
