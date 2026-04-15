# Directoor

AI-native canvas for building and animating architecture diagrams. Type or speak what you want — it appears.

> **Status:** Layer 1 (Foundation). See [PLAN.md](./PLAN.md) for the full 5-layer roadmap.

## What it does

- **AI Command Bar** (`Cmd+K`) — natural language commands like *"Create a Postgres database on the left and S3 on the right with a dashed arrow"*
- **Double-click positioning** — double-click anywhere on the canvas to drop objects exactly where you want them
- **21 semantic objects** with smart defaults (Database, Service, Queue, Cache, API Gateway, Load Balancer, etc.)
- **Region-based animation** — select objects → toggle Animate → type sequence (`1,3,2,4`) → Play, Step (→), or Loop
- **Multi-canvas workspace** with collapsible sidebar, rename, delete
- **Auto-save** with three safety layers (load gate, empty-write protection, DB versioning)
- **Google OAuth** authentication
- **Export** to PNG and SVG
- **macOS Desktop launcher** with auto-shutdown when browser closes or after 15 min idle

## Tech Stack

- **Frontend:** Next.js 16 (Turbopack), React 19, TypeScript 5, Tailwind CSS 4
- **Canvas renderer:** tldraw v3
- **State Engine:** Custom Zustand store in `@directoor/core` (zero DOM deps — portable)
- **AI:** Claude Haiku 4.5 via Anthropic API
- **Database:** Supabase (Postgres + Auth + Row-Level Security)
- **Monorepo:** pnpm workspaces + Turborepo

## Project Structure

```
directoor/
├── apps/web/              # Next.js application
│   └── src/
│       ├── app/           # App router (pages, API routes)
│       │   └── api/
│       │       ├── command/        # AI intent router endpoint
│       │       ├── save-canvas/    # Server-side save with safety check
│       │       └── heartbeat/      # Desktop launcher idle detection
│       ├── components/
│       │   ├── animation/          # AnimationRegion, NumberBadges, Player
│       │   ├── auth/               # AuthProvider, LoginScreen
│       │   ├── canvas/             # DirectoorCanvas (main)
│       │   ├── command-bar/        # CommandBar (Cmd+K), InlineCommand (dbl-click)
│       │   └── sidebar/            # Sidebar (canvases list, nav)
│       └── lib/                    # supabase, tldraw-bridge, export, auth
├── packages/core/         # @directoor/core — platform-independent engine
│   └── src/
│       ├── types.ts           # Canvas state schemas
│       ├── canvas-store.ts    # Zustand store (Canvas State Engine)
│       └── object-library.ts  # 21 semantic objects with ontology
├── supabase/migrations/   # SQL migrations (run in order)
│   ├── 001_initial_schema.sql       # Tables, RLS, auth trigger
│   └── 002_canvas_versions.sql      # Versioning + recovery
├── scripts/               # Desktop launcher
│   ├── Directoor.app/         # macOS .app bundle
│   ├── watchdog.sh            # Auto-shutdown watchdog
│   └── install-desktop-icon.sh
├── PLAN.md                # Master plan
└── .env.example           # Env vars template
```

---

## Setup From Scratch — Complete Guide

If you want to clone this repo and run it on a fresh machine, follow every step below in order. Total time: ~20 minutes.

### Prerequisites

You need accounts on these services (all free tiers work):

| Service | Why | Sign up |
|---|---|---|
| **Node.js 20+** | Runtime | https://nodejs.org/ |
| **pnpm 10+** | Package manager | `npm install -g pnpm` |
| **Supabase** | Database, auth, storage | https://supabase.com (free) |
| **Anthropic** | Claude Haiku for AI commands | https://console.anthropic.com (~$5 credit lasts months) |
| **Google Cloud** | OAuth credentials for Google login | https://console.cloud.google.com (free) |

Verify your local setup:
```bash
node -v   # should print v20.x or higher
pnpm -v   # should print 10.x or higher
```

### Step 1 — Clone the repository

```bash
git clone https://github.com/say-binary/directoor.git
cd directoor
pnpm install
```

This installs dependencies for the monorepo (~600 packages, takes ~30 seconds).

### Step 2 — Create your Supabase project

1. Go to https://supabase.com/dashboard → **New Project**
2. Name it `directoor` (or anything you like)
3. Pick a strong database password — **save it in 1Password/Bitwarden**, not in chat or notes
4. Pick a region close to your users
5. Wait ~2 minutes for provisioning to finish

### Step 3 — Run the database migrations

Open Supabase Dashboard → **SQL Editor** → **New query**, then run **both** migrations in order:

**Migration 1:** Copy & paste the entire contents of `supabase/migrations/001_initial_schema.sql` and click **Run**. This creates:
- `profiles` table (auto-populated when users sign in)
- `canvases` table (stores your work)
- `command_logs` table (proprietary AI training dataset)
- Row-Level Security policies (users can only see their own data)
- Auto-trigger to create a profile on signup

**Migration 2:** Copy & paste the entire contents of `supabase/migrations/002_canvas_versions.sql` and click **Run**. This creates:
- `canvas_versions` table (keeps last 5 snapshots of every canvas)
- DB trigger that auto-snapshots before every update (data-loss protection)

### Step 4 — Set up Google OAuth credentials

1. Go to https://console.cloud.google.com → **New Project** named `directoor`
2. Go to **APIs & Services → OAuth consent screen**
   - Type: **External**
   - Fill in app name, support email
   - Add scopes: `email`, `profile`, `openid`
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `Directoor`
   - **Authorized redirect URIs** — add this exact URL:
     ```
     https://<YOUR-SUPABASE-PROJECT-REF>.supabase.co/auth/v1/callback
     ```
     Find your project ref in Supabase dashboard URL: `https://supabase.com/dashboard/project/<this-is-your-ref>`
4. Click **Create** and copy the **Client ID** and **Client Secret** — you'll need them next

### Step 5 — Enable Google login in Supabase

1. Supabase Dashboard → **Authentication → Providers**
2. Find **Google** → toggle **Enable Sign in with Google** to ON
3. Paste your **Client ID** and **Client Secret** from Step 4
4. Click **Save**

### Step 6 — Get your API keys

You need 5 keys total. Collect them all:

| Key | Where to find |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys → Create Key. Add ~$5 credit. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → **Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → **anon public key** |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → **service_role** key. **Treat this like a password — never expose to the client.** |
| `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET` | From Step 4 |

`GOOGLE_AI_API_KEY` is optional (fallback model) — get one at https://aistudio.google.com/app/apikey if you want it.

### Step 7 — Configure environment variables

```bash
cp .env.example apps/web/.env.local
```

Open `apps/web/.env.local` in your editor and paste the actual values:

```bash
# LLM
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...   # optional

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Google OAuth
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

> **Important:** `.env.local` is gitignored. Never commit secrets to git.

### Step 8 — Run the app

```bash
pnpm dev
```

Open http://localhost:3000 in your browser.

You should see the **Directoor** login screen. Click **Continue with Google** → sign in → you'll land on a blank canvas with the sidebar on the left.

### Step 9 — Try it out

1. Press `Cmd+K` (or `Ctrl+K`) → type:
   ```
   Create a Postgres database on the left and S3 storage on the right with a dashed arrow between them
   ```
   → press Enter. Three shapes appear.

2. **Double-click** anywhere on empty canvas → command bar appears at that position. Try:
   ```
   Add an API Gateway here
   ```
   The gateway appears exactly where you double-clicked.

3. Drag-select multiple objects → click **Animate** in the floating toolbar → type `1,2,3` → Enter. Press **Play** to see the animation. Press **→** arrow to step manually. Toggle **Loop** to repeat.

4. **Sidebar:** Click "New Canvas" to start a fresh one. Switch between canvases. Double-click a name to rename. Hover for the trash icon to delete.

Everything auto-saves. Refresh the browser — your work is still there.

---

## Optional — Install the macOS Desktop launcher

A double-clickable Desktop icon that launches the dev server, opens the browser, and **auto-shuts down** when you close the browser or after 15 min of inactivity (so it doesn't waste your Mac's resources).

```bash
./scripts/install-desktop-icon.sh
```

This copies `Directoor.app` to `~/Desktop`. Double-click it to launch.

> **First launch only:** macOS may ask *"Are you sure you want to open it?"* — right-click the icon → Open → Open. After that, normal double-click works forever.

---

## Common Issues

| Problem | Fix |
|---|---|
| `pnpm: command not found` | `npm install -g pnpm` |
| Server crashes with `Failed to open database / Loading persistence directory failed` | Stale Turbopack cache. Run: `rm -rf apps/web/.next` and restart. |
| Login redirects to `localhost` and fails | The Google OAuth redirect URI in Step 4 must match your Supabase project URL exactly. Re-check it. |
| `Continue with Google` button does nothing | Google provider is not enabled in Supabase (Step 5), or Client ID/Secret were not saved. |
| Canvas saves fine but loads blank | Make sure you ran **both** migrations 001 AND 002. Without 002, versioning is off but core saves still work. |
| Cmd+K does nothing | Make sure the Anthropic API key is valid and has credit. Check terminal for `Command API error:` logs. |
| Browser preview blocks Supabase URL | If using Claude's preview tool, OAuth won't work because external URLs are blocked. Open `http://localhost:3000` in your real browser instead. |

---

## Architecture Notes

- **Canvas State Engine** (`@directoor/core`) is platform-independent — zero DOM dependencies, runs in browser, React Native, or Node.js. Future-proofs for native mobile.
- **tldraw is the view layer**, not the source of truth — our State Engine owns the data model.
- **Two-tier intent routing:** deterministic regex for instant commands (`animate`, `undo`), LLM for natural language. Saves cost and latency.
- **Three-layer save protection:**
  1. **Client load gate** — no saves can fire until canvas load completes (prevents race condition wipes)
  2. **Server empty-write guard** — `/api/save-canvas` refuses to overwrite a non-empty canvas with empty data (HTTP 409)
  3. **DB versioning** — `canvas_versions` table keeps last 5 snapshots per canvas, auto-populated by trigger
- **Auto-shutdown:** Heartbeat endpoint + watchdog script kills the dev server when the browser closes or after 15 min of inactivity.

See [PLAN.md](./PLAN.md) for the full 5-layer roadmap and forever-decisions.

---

## Useful commands

```bash
pnpm dev              # Start dev server (http://localhost:3000)
pnpm build            # Build for production
pnpm lint             # Lint all packages
pnpm type-check       # TypeScript check across the monorepo
pnpm clean            # Clean build artifacts

# Workspace-specific
pnpm --filter @directoor/core build
pnpm --filter @directoor/web dev
```

## License

Private — not open source.
