# Directoor

AI-native voice-first creative canvas platform. Build and animate architecture diagrams by just saying what you want.

## Features

- **AI Command Bar** — Type natural language commands (Cmd+K) to create, connect, and style diagram objects
- **Double-Click Placement** — Double-click anywhere on the canvas to place objects at that exact position
- **21 Semantic Objects** — Database, Service, Queue, Cache, API Gateway, Load Balancer, and more with smart defaults
- **Region-Based Animation** — Select objects → toggle Animate → set sequence → Play/Step/Loop
- **Auto-Save** — Every change persists automatically to Supabase
- **Google OAuth** — Secure authentication with no passwords
- **Multi-Canvas** — Create, switch, rename, and delete canvases from the sidebar
- **Export** — PNG and SVG export

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Canvas:** tldraw v3
- **State Engine:** Zustand (custom `@directoor/core` package)
- **AI:** Claude Haiku 4.5 (Anthropic API)
- **Database:** Supabase (Postgres + Auth + RLS)
- **Monorepo:** pnpm workspaces + Turborepo

## Project Structure

```
directoor/
├── apps/
│   └── web/                    # Next.js web application
│       └── src/
│           ├── app/            # Next.js app router (pages, API routes)
│           ├── components/     # React components
│           │   ├── animation/  # Animation region, player, badges
│           │   ├── auth/       # AuthProvider, LoginScreen
│           │   ├── canvas/     # DirectoorCanvas (main component)
│           │   ├── command-bar/ # CommandBar, InlineCommand
│           │   └── sidebar/    # Sidebar (canvas list, nav)
│           └── lib/            # Utilities (supabase, tldraw-bridge, export)
├── packages/
│   └── core/                   # @directoor/core — platform-independent engine
│       └── src/
│           ├── types.ts        # Canvas state types, actions, schemas
│           ├── canvas-store.ts # Zustand store (Canvas State Engine)
│           ├── object-library.ts # 21 semantic objects with ontology
│           └── index.ts        # Public API
├── supabase/
│   └── migrations/             # SQL migrations
│       └── 001_initial_schema.sql
├── PLAN.md                     # Master plan (all 5 layers)
└── .env.example                # Environment variables template
```

## Getting Started

### Prerequisites

- Node.js 20+ (`node -v`)
- pnpm 10+ (`npm install -g pnpm`)
- A Supabase project (free tier: https://supabase.com)
- An Anthropic API key (https://console.anthropic.com)
- Google OAuth credentials (https://console.cloud.google.com)

### 1. Clone and install

```bash
git clone https://github.com/say-binary/directoor.git
cd directoor
pnpm install
```

### 2. Set up environment variables

```bash
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local with your actual keys
```

### 3. Set up Supabase

1. Create a new Supabase project
2. Go to **SQL Editor** → run the contents of `supabase/migrations/001_initial_schema.sql`
3. Go to **Authentication → Providers → Google** → enable and paste your OAuth credentials
4. Add `https://<your-project>.supabase.co/auth/v1/callback` as an authorized redirect URI in Google Cloud Console

### 4. Run locally

```bash
pnpm dev
```

Open http://localhost:3000

### 5. Try it out

1. Sign in with Google
2. Press `Cmd+K` and type: `Create a Postgres database on the left and S3 on the right with a dashed arrow`
3. Double-click on empty space to place objects at specific positions
4. Select objects → click **Animate** → type sequence like `1,3,2,4` → press Play
5. All changes auto-save. Switch canvases from the sidebar.

## Architecture

See [PLAN.md](./PLAN.md) for the full 5-layer roadmap.

### Key Architectural Decisions

- **Canvas State Engine** (`@directoor/core`) is platform-independent — zero DOM dependencies, runs in browser, React Native, or Node.js
- **tldraw is the view layer**, not the source of truth — our State Engine owns the data model
- **Two-tier intent routing:** deterministic regex for instant commands (animate, undo), LLM for everything else
- **Auto-save with three safety layers:** debounced on edit, immediate on animation change, sendBeacon on browser close

## License

Private — not open source.
