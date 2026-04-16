# Deploying Directoor to Vercel

One-time setup. Total time: ~10 minutes.

## 1. Apply pending Supabase migrations

In the Supabase SQL editor (or `supabase db push` if you've wired the CLI), run anything new under `supabase/migrations/` that hasn't been applied yet. As of today:

- `003_user_images.sql` — image library table
- `004_command_logs.sql` — proprietary command log + thumbs feedback
- `005_subscriptions.sql` — subscription state table
- `006_polar_rename.sql` — switches the column names from `stripe_*` to `polar_*` (we moved off Stripe because it's invite-only for Indian businesses)

## 2. Polar.sh (optional — skip if you're not charging yet)

Without Polar, the app runs as "free for everyone": all features work, but the **Upgrade to Pro** button shows "Billing coming soon", caps still apply (3 canvases / 50 LLM calls per day), and exports get the watermark.

To turn billing on:

1. Sign up at https://polar.sh — works globally including India, no business-type restrictions. Polar is the Merchant of Record, so they handle global tax/VAT for you.
2. **Settings → Developers → New token** → create an Organization Access Token with `checkouts:write`, `customer_sessions:write`, `subscriptions:read` scopes → `POLAR_ACCESS_TOKEN`
3. **Products → New product** → recurring monthly $12 "Directoor Pro" → copy the product UUID → `POLAR_PRO_PRODUCT_ID`
4. **Settings → Webhooks → Add endpoint** → URL `https://YOUR-DOMAIN/api/polar/webhook`, format `Raw`, subscribe to all `subscription.*` events → copy the signing secret → `POLAR_WEBHOOK_SECRET`
5. (Optional) Set `POLAR_SERVER=sandbox` while testing — defaults to `production` on Vercel.

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
   | `POLAR_ACCESS_TOKEN` | optional |
   | `POLAR_PRO_PRODUCT_ID` | optional |
   | `POLAR_WEBHOOK_SECRET` | optional |
   | `POLAR_SERVER` | optional (defaults to `production` in prod) |

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
   - (If Polar is configured) **Upgrade to Pro** → checkout → after returning, the watermark goes away and caps are lifted

## 5. Domain

Once verified, point your domain at the Vercel deployment via the Vercel dashboard. Vercel handles TLS automatically.
