# Directoor — Master Plan
*AI-Native Voice-First Creative Canvas Platform*

**Last updated:** 2026-04-15 (v1.3 — dual command input, region-based animation with toggle/loop/arrow-step)
**Authors:** Founder + Claude (AI collaborator)
**Status:** Pre-build, pre-funding, 2-person team

---

## 1. The Vision

Build the go-to tool for tech-savvy and non-tech-savvy users to transform any idea in their mind into a production-ready creative artifact — posters, forms, slide decks, architecture diagrams, animations, marketing content, educational material — through a **native AI voice-first canvas experience**.

The ideal end-state: a user paces around their room, speaks their idea aloud, and watches a context-aware AI coworker bring it to life on an infinite canvas in real time, with animation, rich media, and export-ready output.

**One-line pitch:** *"A canvas that already knows what you're doing, so when you ask for help, it responds instantly without needing to understand your whole world from scratch."*

---

## 2. Guiding Principles (Forever Decisions)

These principles anchor every layer. Violating them breaks the architecture.

1. **Every layer builds on the previous layer's architecture — never replaces it.** The Canvas State Engine built in Layer 1 powers Layer 5.
2. **Separate awareness from action.** Awareness (canvas state tracking) is cheap and always-on. Action (LLM calls, generation) is expensive and triggered.
3. **Not all actions need AI generation.** 80% of canvas commands are deterministic (move, align, color, connect). Only 20% need generative intelligence. Route accordingly.
4. **Hybrid input, never single-mode.** Click + type in Layer 1. Click + type + voice in Layer 2+. Never voice-only, never click-only.
5. **Context engine is the moat, voice is the interface.** The background state engine is the real product.
6. **Ruthless scope discipline per layer.** If a feature isn't core to the current layer's goal, it doesn't ship in that layer.
7. **Ship fast, build in public, respond to users in hours.** Speed of iteration is a moat that compounds.
8. **Design taste is non-negotiable.** A beautiful product at Layer 1 is harder to clone than a feature-rich one.
9. **Cross-platform from day one.** Browser-first, but every architectural decision must be mobile-compatible. No browser-only APIs in the core engine. The canvas runs on desktop browser, tablet browser, mobile browser, and later native iOS/Android with shared business logic.
10. **Security and privacy are Layer 1 concerns, not Layer 5 patches.** User canvases often contain confidential info (architecture diagrams with internal system names, pitch decks with financials, business strategies). Encryption, access control, prompt-injection defense, and safe LLM guardrails are baked in from the first commit — retrofitting these later is how startups die.

---

## 3. Architectural Thread (Runs Through All Layers)

These five components are **born in Layer 1** and **extended — never rebuilt — across all subsequent layers**:

| Component | Layer 1 | Layer 5 |
|---|---|---|
| **Canvas State Engine** | Structured JSON world model, reactive store, rolling history of ~20 actions | Cross-canvas intelligence, long-term memory, predictive action model |
| **Intent Router** | Deterministic path for ~50 commands + cheap LLM fallback | Multi-modal router handling voice, text, sketch, gesture |
| **Semantic Object Library** | ~15 architecture-diagram objects with ontology (not just shapes) | Hundreds of objects across verticals, community-contributed |
| **Animation System** | Region-based: select → toggle → number → animate → toggle off. Per-region play/loop/arrow-step | Full choreography with easing, triggers, per-region export |
| **Dual Input System** | Double-click (positioned) + Cmd+K (global) | + voice + ambient + proactive suggestions |

**If these are right in Layer 1, we have a 5-year runway. If they're wrong, everything above them breaks.**

---

## 3A. Deployment Architecture (Browser + Mobile)

The product must reach users on **desktop browser, tablet browser, mobile browser, and native mobile apps (iOS + Android)**. This is a forever-decision that shapes every technical choice below. We cannot treat mobile as an afterthought — retrofitting a desktop-only architecture for mobile is a 6-month rewrite we can't afford.

### 3A.1 Platform Strategy By Layer

| Layer | Desktop Web | Mobile Web | Native iOS/Android |
|---|---|---|---|
| **1** | Primary target (full feature set) | Read-only viewer for shared canvases | ❌ not yet |
| **2** | Primary + voice input | Responsive editing + voice (push-to-talk) | ❌ not yet |
| **3** | Full product | Full product (PWA) | Optional — begin evaluation |
| **4** | Full product | Full product | ✅ Launch iOS + Android (React Native or Expo) |
| **5** | Full product | Full product | Mobile-first capture becomes a major wedge |

### 3A.2 The Cross-Platform Architectural Pattern

To avoid rewriting the product for every platform, we follow a strict **"shared core, thin shells"** pattern from day one:

**Shared Core (runs everywhere, written once):**
- Canvas State Engine (pure TypeScript, zero DOM dependencies)
- Intent Router (pure TypeScript + LLM API calls)
- Semantic Object Library (JSON schemas + pure logic)
- Command logging and validation
- Canvas API (`createObject`, `updateObject`, etc.)
- Animation timeline engine

This core is a **TypeScript monorepo package** (`@directoor/core`) that has zero platform-specific dependencies. It runs in a browser, in React Native, in a web worker, or in a Node.js server process without modification.

**Platform Shells (thin, platform-specific):**
- **Web shell:** Next.js + React + tldraw for rendering, browser APIs for input/export
- **Mobile PWA shell:** Same Next.js app with responsive layout, touch-optimized gestures, mobile-safe viewport
- **Native iOS/Android shell (Layer 4+):** React Native or Expo wrapping the same `@directoor/core` package, using a native canvas renderer (Skia via `@shopify/react-native-skia`) instead of tldraw

This means 80%+ of the code is written once and shared. Only the rendering layer and platform-specific input/export code differ.

### 3A.3 Canvas Rendering — Cross-Platform Decisions

The canvas is the hardest thing to make cross-platform. Here's the plan:

**Layer 1–3 (Web only):** Use **tldraw v3** as the canvas rendering engine. It's MIT licensed, performant, and gives us drag/zoom/pan/multi-select for free. But: tldraw is web-only (DOM + Canvas2D/WebGL).

**Layer 4+ (Native mobile):** Two paths, decision deferred until Layer 3:
- **Path A:** Migrate rendering to **Skia** (via `@shopify/react-native-skia` on mobile, CanvasKit/Skia-wasm on web). Same rendering code runs everywhere. Higher engineering effort but maximum consistency.
- **Path B:** Keep tldraw for web, build a parallel native renderer on mobile using the shared `@directoor/core` state as the source of truth. Faster to ship, risk of drift between platforms.

**Critical Layer 1 decision:** Even though we use tldraw for rendering, **we never couple our Canvas State Engine to tldraw's internal data model**. We maintain our own JSON representation as the source of truth and treat tldraw as a view layer that gets fed state. This decision alone preserves our ability to swap renderers later.

### 3A.4 Mobile-Specific Considerations (Layer 1 Design Constraints)

Even though Layer 1 is "desktop-first," we impose these constraints on the architecture to keep the mobile path open:

- **No DOM-specific assumptions in the core.** Anything that touches `window`, `document`, or `localStorage` directly is wrapped in a platform adapter.
- **Storage abstraction.** Use an abstract `StorageAdapter` interface (web: IndexedDB/localStorage; mobile: AsyncStorage/MMKV). Never call storage APIs directly from the core.
- **Touch-first input hints.** Gesture handlers are designed abstractly (`pointer` not `mouse`) so touch, stylus, and mouse work through the same code path.
- **Responsive layout from day one.** The Layer 1 web app must degrade gracefully to tablet and mobile browser sizes, even if editing is limited.
- **Bandwidth awareness.** Assume 4G/5G for mobile users — don't design features that require gigabytes of download. Asset libraries are lazy-loaded.
- **Offline-first intent.** The Canvas State Engine works fully offline for simple operations. Only LLM calls require network. Sync when reconnected.
- **Mobile viewer in Layer 1.** Shared canvas links must render beautifully on mobile browsers as read-only presentations from day one — this is how canvases go viral via Slack/WhatsApp.

### 3A.5 Deployment Infrastructure By Layer

**Layer 1 (minimum viable infra):**
- **Frontend:** Vercel (Next.js) for web app, global edge CDN
- **Backend:** Next.js API routes (serverless) for intent router and LLM proxying
- **Database:** Supabase (managed Postgres) with row-level security (RLS)
- **Asset storage:** Cloudflare R2 (cheaper than S3, egress-free)
- **Auth:** Clerk or Supabase Auth (Google, email, passkey-ready)
- **Payments:** Stripe
- **Analytics:** PostHog (self-host option for EU users later)
- **Error tracking:** Sentry
- **Email:** Resend

**Layer 2 (voice added):**
- **Voice STT/TTS:** Deepgram + Cartesia/ElevenLabs (routed via our backend, never direct from client — we need to protect API keys and enforce rate limits)
- **Real-time audio transport:** WebRTC via LiveKit or Vapi (managed)
- **Edge compute for low latency:** Vercel Edge Functions or Cloudflare Workers for wake-word validation and routing

**Layer 3–4 (scale + mobile):**
- **CDN for generated assets:** Cloudflare with signed URLs
- **Queue system for async generation:** Inngest or Trigger.dev
- **Mobile app distribution:** Expo Application Services (EAS) for iOS + Android builds
- **Push notifications:** Expo Notifications + FCM/APNS
- **Feature flags:** PostHog feature flags or LaunchDarkly

**Layer 5 (enterprise):**
- **Region-specific deployments** (EU, US, India) for data residency
- **VPC peering** for enterprise customers
- **SOC 2 Type II compliance** infrastructure

### 3A.6 Performance Budgets (Enforced From Layer 1)

Non-negotiable targets that shape every technical decision:

- **Time to interactive (desktop):** < 2.0s on 4G
- **Time to interactive (mobile web):** < 3.0s on 4G
- **Canvas render FPS:** 60 FPS for canvases with up to 200 objects
- **Command-to-action latency (deterministic):** < 50ms
- **Command-to-action latency (LLM path):** < 1500ms perceived (streaming helps)
- **Voice command end-to-end latency (Layer 2):** < 800ms
- **Initial bundle size (web):** < 500KB gzipped for first paint; lazy-load the rest
- **Memory footprint (mobile web):** < 150MB for a typical canvas

If any PR violates these budgets, it doesn't ship. Performance is a feature.

---

## 3B. Security, Privacy & Guardrails

Our users will put sensitive content on Directoor — internal architecture diagrams with real service names, startup pitch decks with revenue numbers, client project maps with confidential business logic. A single public breach ends the company. Security is not optional and cannot wait for Layer 3.

### 3B.1 Threat Model

We defend against:

1. **External attackers** trying to exfiltrate user canvases or credentials
2. **Prompt injection attacks** where malicious content in canvas text, imported files, or pasted content attempts to hijack our LLM calls and exfiltrate other users' data
3. **Credential theft** via leaked API keys (Anthropic, Google, Stripe, Supabase)
4. **Account takeover** via weak auth or session hijacking
5. **Abusive users** generating harmful content or racking up LLM costs
6. **Data leakage through LLMs** — our prompts accidentally training third-party models
7. **Insider threats** — the duo itself needs audit trails as we scale
8. **Compliance risk** — GDPR, CCPA, India's DPDP Act from day one

### 3B.2 Authentication & Authorization

**Layer 1 baseline:**
- SSO-first: Google OAuth as primary, email as fallback
- **No password-based auth from day one** — passkeys (WebAuthn) supported immediately, passwords are a liability we don't want
- Session tokens with short TTLs, refresh rotation
- CSRF protection on all mutating endpoints
- Rate limiting per IP and per user
- Email verification required for new accounts
- **Row-level security (RLS) in Supabase** — enforced at the database layer, not application layer. A user can only ever read/write their own canvases regardless of what the app code does.

**Layer 3+ additions:**
- 2FA (TOTP and WebAuthn)
- Session management UI (see active sessions, revoke remotely)
- Suspicious login detection (new device, new geography)

**Layer 4+ (teams):**
- Workspace-level roles (owner, editor, viewer)
- Invite-only workspaces
- Domain-based auto-join (optional)

**Layer 5 (enterprise):**
- SAML SSO
- SCIM provisioning
- Audit logs with immutable export

### 3B.3 Data Encryption

- **In transit:** TLS 1.3 everywhere, HSTS enforced, no mixed content
- **At rest:** Supabase automatic encryption of Postgres, R2 server-side encryption for assets
- **Client-side encryption (Layer 3+):** Optional "private canvas" mode where the canvas is encrypted with a user-derived key before upload. We literally cannot read these canvases. Premium feature for sensitive use cases (legal, finance, defense).
- **Secrets management:** No API keys in code or environment files committed to git. Use Vercel's encrypted env vars + Doppler/Infisical for secrets rotation.

### 3B.4 LLM Guardrails (Critical for Layer 1)

LLMs are a new and unique attack surface. We treat them as **untrusted code execution** environments. These rules apply from the first LLM call in Layer 1:

**Input guardrails:**
- **Prompt injection defense:** Every user command is wrapped in strict delimiters before being sent to the LLM. The system prompt explicitly tells the model that any instructions inside user content must be treated as data, not instructions.
- **Content ingested from canvas imports, pasted text, or web pulls (Layer 3+)** is treated as untrusted — never concatenated directly into prompts without sanitization.
- **Canvas state sent to the LLM is schema-validated** — we only send a structured JSON subset, never raw user text blobs that could contain injection payloads.
- **Per-user rate limits** on LLM calls to prevent cost abuse and denial-of-wallet attacks.
- **Token budget caps** per command (reject commands that would exceed token limits before calling).

**Output guardrails:**
- **Every LLM response is schema-validated** against our Canvas API contract before any operation executes. If the response doesn't conform, it's rejected and retried with a correction prompt — never blindly executed.
- **Action allowlist:** The LLM can only invoke a whitelisted set of Canvas API operations. It cannot execute arbitrary code, call arbitrary URLs, or access user account settings.
- **Side-effect isolation:** LLM outputs cannot trigger operations that affect other users, modify billing, share canvases, or access storage directly. All effects route through the Canvas API which enforces the same RLS as manual actions.
- **Content safety filtering:** For generative outputs in Layer 3+ (image/video), run through a moderation model (OpenAI Moderation API or similar) before displaying.
- **Audit logging:** Every LLM call — input, output, latency, cost, user, canvas ID — is logged for incident response and abuse detection.

**Data leakage prevention:**
- **Opt-out of LLM provider training.** Anthropic, Google, OpenAI all offer "no training on my data" options via their enterprise APIs. Use them from day one.
- **Zero-retention mode** where available (Anthropic's zero-data-retention endpoint) for Pro-tier users.
- **Redaction of sensitive strings** (credit card patterns, SSN patterns, API key patterns) from command logs before storage.
- **Clear user-facing policy:** "Your canvas content may be sent to our LLM providers for command processing. We do not use your content to train models. You can export and delete your data at any time."

### 3B.5 Privacy & Compliance

**Layer 1 requirements:**
- GDPR-compliant cookie consent (PostHog in privacy-friendly mode)
- Privacy policy and ToS drafted and published before launch (use a template from Termly or hire a lawyer for 2 hours)
- Data export endpoint (user can download all their canvases as JSON)
- Data deletion endpoint (user can delete their account and all data within 30 days)
- Clear disclosure of third-party processors (Anthropic, Google, Supabase, Stripe)

**Layer 2+ requirements:**
- Voice data handling policy — transcripts are processed ephemerally, audio is not stored beyond 24h unless user opts in for "improve accuracy" training
- Consent prompt before first voice use
- DPA (Data Processing Agreement) available for business users

**Layer 4+ requirements:**
- Regional data residency (EU data stays in EU)
- DPDP Act compliance for Indian users
- CCPA compliance for California users
- Subprocessor list published publicly, updated on changes

**Layer 5 (enterprise):**
- SOC 2 Type II certification
- ISO 27001 (optional)
- HIPAA if we ever target healthcare

### 3B.6 Abuse & Cost Protection

Our biggest operational risk is a user (or bot) burning through our LLM budget. Defenses:

- **Signup friction:** Require email verification; optional CAPTCHA on signup if abuse spikes
- **Free-tier hard caps:** 3 canvases, N commands per day, M LLM calls per day, exports watermarked
- **Per-IP rate limits** via Vercel middleware or Cloudflare
- **Anomaly detection:** alert if any single user's daily cost exceeds $5 (they're either abusing or a paid power user — investigate either way)
- **Circuit breakers:** if total daily LLM spend exceeds a threshold, auto-disable free-tier LLM calls until reset
- **Payment verification before voice access (Layer 2):** voice is expensive, require a card on file even for the trial

### 3B.7 Incident Response

**Layer 1 minimum:**
- Sentry alerts routed to Slack/email for any 500 error
- Supabase backup schedule: daily automated, 30-day retention
- Runbook for "what if we see a data leak" with clear steps: isolate, rotate secrets, notify affected users, post-mortem
- Simple status page (Upptime or Statuspage free tier)

**Layer 3+:**
- On-call rotation (even as a duo)
- Formal incident severity levels
- Quarterly security reviews

### 3B.8 Security Ops as Code (Layer 1 Must-Haves)

These are non-negotiable from day one:

- **Dependabot or Renovate** for dependency updates
- **GitHub Secret Scanning** enabled on the repo
- **Branch protection** on `main`, required reviews even in a duo
- **.env files in .gitignore**, never committed
- **API key rotation playbook** documented
- **Principle of least privilege** for all service accounts (Supabase service role key never touches client code)

### 3B.9 What We Explicitly Will NOT Do

- Never store credit card numbers ourselves (Stripe handles it)
- Never bypass user consent to collect data
- Never share user canvases with third parties for any purpose
- Never use user content to train models without explicit opt-in
- Never require passwords (passkeys and SSO only, reducing credential risk)
- Never sell user data

---

## 4. Target Market Evolution

| Layer | Beachhead Persona | TAM Expansion |
|---|---|---|
| 1 | Backend/platform engineers making architecture diagrams | Niche (~2M globally) |
| 2 | Same + technical PMs, solutions engineers | ~5M |
| 3 | + founders pitching, consultants mapping processes | ~20M |
| 4 | + marketers, educators, students, small business owners | ~100M |
| 5 | Anyone turning ideas into visual artifacts, tech-savvy or not | ~1B+ (global creative TAM) |

**Local market thesis:** Starting layer 4+, aggressive pricing and localized templates for India/SEA/LatAm markets where global tools (Miro $10, Figma $15, Gamma $20) are prohibitive. Price as coffee-money, not SaaS.

---

## 5. The Five Layers — Elaborate Plan

---

## LAYER 1 — The Foundation
### "AI-Native Diagram & Slide Builder for Engineers"

**Duration:** 12–16 weeks for production beta (1 week for demo-able prototype)
**Team:** 2-person duo
**Goal:** Prove that conversational canvas creation is 10x faster than existing tools for one well-defined persona, and build the architectural skeleton that everything else plugs into.

### 5.1 In-Scope Features

#### 5.1.1 Canvas Foundation
- Infinite, zoomable, pannable canvas built on **tldraw v3** (MIT licensed)
- Standard manipulation: drag, resize, rotate, multi-select, copy/paste, undo/redo, delete, group/ungroup
- Snap-to-grid and snap-to-object alignment guides
- Dark + light mode
- Keyboard shortcuts for power users

#### 5.1.2 Semantic Object Library v1 (~15 objects)
Architecture-diagram-first, engineer beachhead:
- **Primary objects:** Database, Service, Queue, Cache, API Gateway, Load Balancer, Client, Data Lake, Storage, Function/Lambda, Container, User/Actor, External System, Microservice, Generic Box
- **Primitives:** rectangle, circle, diamond, text, sticky note, arrow (straight/elbow/curved), line, image

Each object has:
- Semantic type (AI-reasonable)
- Label
- Default styling (color, border, icon)
- Connection points (where arrows attach)
- **Ontology metadata** (relationships, idiomatic usage, smart defaults)
- Animation behavior defaults

#### 5.1.3 Canvas State Engine
- Live structured JSON representation of entire canvas — every object, position, style, label, relationship, z-index, timeline step
- Reactive store (Zustand, Yjs-ready for future collab)
- **Rolling history** of last ~20 user actions for AI context
- Serializable to `.canvas.json` for save/load
- Clean **Canvas API**: `createObject`, `updateObject`, `connect`, `align`, `group`, `animate`, `delete`, `duplicate`
- This is what the intent router calls into

#### 5.1.4 Dual Command Input System

**A. Double-Click Positioned Command (primary — spatial creation)**
- **Double-click on empty canvas space** → inline command field appears at that exact click point
- A small pin indicator marks where assets will be anchored
- User types: *"database and S3 with a dashed arrow"* → objects appear anchored to the click point
- First object placed at pin, subsequent objects positioned relative to it
- After command executes, the inline field disappears
- This solves the fundamental problem of spatial intent on an infinite vertical canvas — no more guessing positions via LLM

**B. Cmd+K Global Command Bar (secondary — canvas-wide operations)**
- Persistent command bar at bottom of canvas (Cmd+K to focus)
- For commands that aren't position-specific: *"align all horizontally"*, *"change all arrows to dashed"*, *"undo"*, *"animate 1,2,3"*
- Command history (up-arrow recall)
- Inline disambiguation ("which database did you mean?")

**Why two input surfaces:**
- Double-click = "put something *here*" (positional)
- Cmd+K = "do something to the *canvas*" (global)
- Matches Figma's mental model (double-click to add text at a point, Cmd+K for search/actions)

#### 5.1.5 Intent Router (Two-Tier)
- **Tier 1 — Deterministic path:** regex/keyword matcher for ~50 high-frequency commands. Runs locally, zero cost, sub-50ms. Handles: move, align, color, connect, resize, label, delete, duplicate, group, distribute, style changes.
- **Tier 2 — LLM path:** ambiguous or compositional requests → Claude Haiku 4.5 or Gemini 2.0 Flash with full Canvas State as context. Returns structured JSON of Canvas API calls.
- Every LLM response validated against strict schema before execution (no hallucinated ops)

#### 5.1.6 Region-Based Animation System

**The flow:**
1. User **drag-selects** a region of objects on the canvas (standard selection box)
2. A floating toolbar appears with an **"Animate" toggle** button
3. **Toggle ON** → enters animation mode for that region:
   - Number badges (1, 2, 3...) appear on the selected objects only
   - Rest of canvas dims slightly to focus attention
   - Command bar auto-prompts for sequence: `animate 2,1,3,4`
4. User types the sequence → animation is saved for that region
5. **Toggle OFF** → number badges disappear, canvas returns to clean finished view
6. A small **Play ▶** button remains pinned to the region

**Playback controls (per region):**
- **Play button** — starts the animation (fade-in, 800ms per step)
- **Arrow key (→)** — step through manually, one object per press
- **Loop toggle** — when ON, animation replays infinitely until stopped
- **Stop button** — stops playback/loop

**Re-ordering:** Toggle animation back ON → numbers reappear → type new `animate` command → toggle OFF

**Multi-region:** Each drag-selection creates an independent animation region. No "play all" — each region is independently controlled. User scrolls and plays each region as they present.

**Export (Layer 3+):**
- Individual regions exportable as separate MP4/GIF
- Loop ON → exported as looping GIF/video
- Loop OFF → plays once, freezes on final frame
- Per-region export options: resolution, step duration, transition style

**Data model:**
```
animationRegions: [
  { id, objectIds: string[], sequence: number[], bounds: {x,y,w,h}, loop: boolean }
]
```

**Implementation:**
- Number badges: custom React overlay positioned via tldraw coordinate conversion
- Toggle: floating toolbar button attached to tldraw selection
- `animate` command parsed by deterministic router (Tier 1 — no LLM needed)
- Playback engine: iterate sequence, toggle opacity with CSS transitions
- Arrow-key stepping via keyboard event listener scoped to active region

#### 5.1.7 Export & Share
- **Static:** PNG, SVG
- **Animated:** MP4, GIF (ffmpeg.wasm in browser or lightweight server-side renderer)
- Shareable public link (read-only viewer)
- Copy-to-clipboard for quick paste

#### 5.1.8 Auth, Storage, Billing
- Clerk or Supabase Auth (Google + email)
- Supabase Postgres for canvas storage
- Stripe: Free tier (3 canvases, watermarked exports) + Pro ($12/month, unlimited, no watermark)
- Basic usage dashboard

#### 5.1.9 Moat-Seeding Infrastructure (critical, baked in from day 1)
- **Command logging:** every text command, canvas state before/after, LLM response, user correction, thumbs-down flag → structured table. This becomes proprietary training data (single highest-leverage moat decision).
- **Semantic ontology:** object library designed as opinionated ontology with relationships, idiomatic groupings, smart defaults — not just shapes.
- **Open-source object repo:** semantic object schemas published publicly on GitHub for community contribution.
- **Build in public:** weekly changelogs, public Twitter/X presence, technical deep-dive blog posts.
- **Design taste commitment:** premium feel from first pixel.

#### 5.1.10 Cross-Platform Foundations (forever decisions made in Layer 1)
- **Monorepo with `@directoor/core` package** — pure TypeScript, zero DOM dependencies. Canvas State Engine, Intent Router, Semantic Object Library, Canvas API, animation engine all live here.
- **Platform adapters** for storage, input, and rendering — no direct `window`/`document` calls in core logic.
- **Canvas State Engine decoupled from tldraw** — tldraw is treated as a view layer, not the source of truth. Enables future mobile-native rendering without rewrites.
- **Responsive web layout** that degrades gracefully to mobile browser as a read-only viewer.
- **Shared canvas links render beautifully on mobile** browsers (this is how canvases go viral via Slack/WhatsApp).
- **Performance budgets enforced:** <2s TTI desktop, <3s mobile, 60 FPS canvas, <50ms deterministic command latency.

#### 5.1.11 Security & Guardrails (baked in from the first commit)
- **SSO-first auth** (Google + passkeys, no passwords)
- **Supabase row-level security (RLS)** enforced at database layer
- **TLS 1.3 everywhere**, HSTS, no mixed content
- **Prompt injection defense:** strict delimiter wrapping, untrusted content marking, schema validation of all LLM outputs
- **LLM action allowlist** — model can only invoke whitelisted Canvas API operations
- **Zero-retention / no-training opt-out** on all LLM provider calls
- **Per-user rate limits** and per-command token caps to prevent cost abuse
- **Circuit breakers** on daily LLM spend
- **Audit logging** of every LLM call, command, and auth event
- **Dependabot, GitHub secret scanning, .env in .gitignore, branch protection** on day 1
- **Privacy policy, ToS, data export, data deletion endpoints** live at launch
- **Sentry error alerts** + daily Supabase backups with 30-day retention

### 5.2 Explicitly OUT of Scope (Layer 1)

- No voice (→ Layer 2)
- No image/video generation (→ Layer 3)
- No multiplayer/collaboration (→ Layer 4)
- No templates marketplace (→ Layer 4)
- No mobile app (→ Layer 5)
- No plugins (→ Layer 5)
- No brand kits, teams/workspaces (→ Layer 4)
- No web scraping / "pull from internet" (→ Layer 3)
- No AI-generated layouts (→ Layer 3)
- No comments, version history UI (→ Layer 4)

**Discipline rule:** If a feature isn't on the in-scope list above, we don't build it in Layer 1.

### 5.3 Required APIs & Services

#### Free / Open-Source
| Service | Purpose |
|---|---|
| tldraw (MIT) | Canvas foundation |
| React + Next.js | Frontend framework |
| Zustand | Client state store |
| Yjs (optional) | Future-collab CRDT foundation |
| ffmpeg.wasm | Client-side video export |
| html2canvas / dom-to-image | PNG/SVG export |
| Tailwind + shadcn/ui | UI components |
| Vercel (hobby) | Hosting during dev |

#### Paid (cheap at Layer 1 scale)
| Service | Purpose | Cost |
|---|---|---|
| Claude Haiku 4.5 / Gemini 2.0 Flash | Intent router LLM | ~$0.001/command; ~$10/day at 10K commands/day max |
| Supabase Pro | Postgres + auth + storage | $25/month |
| Clerk (optional) | Auth | Free to 10K MAU |
| Stripe | Payments | 2.9% + $0.30/txn |
| Vercel Pro (post-launch) | Hosting + edge functions | $20/month |
| Cloudflare R2 | Asset/export storage | ~$5/month |
| PostHog | Analytics + session replay | Free to 1M events |
| Resend | Transactional email | Free to 3K/month |
| Sentry | Error tracking | Free tier |

**Total monthly burn pre-launch:** $50–$80/month infrastructure + $50–$200/month LLM = **under $300/month**.
**Post-launch (1K users):** LLM costs rise to $200–$500/month. Fully covered by ~40 Pro subscribers.

#### Day-1 API Keys to Grab
1. Anthropic API key (Claude Haiku) — primary intent router
2. Google AI Studio API key (Gemini Flash) — fallback
3. Supabase project
4. Vercel account
5. Stripe account
6. Clerk account (optional)
7. PostHog account
8. Cloudflare account (R2)

### 5.4 End-State (What Layer 1 Looks Like When Shipped)

**User journey example — Sarah, backend engineer:**
1. Signs in with Google, lands on blank infinite canvas
2. `Cmd+K` → types *"Create a Postgres database on the left and an S3 bucket on the right"* → two labeled objects appear in 400ms
3. Types *"Dashed arrow from Postgres to S3, blue, 3px"* → arrow draws itself
4. Types *"Add an API Gateway above Postgres and connect with a solid arrow"* → done
5. Types *"Align all three horizontally"* → snaps into alignment
6. Opens timeline panel, types *"Animate API Gateway at step 1, Postgres at step 2, arrow at step 3 drawing left-to-right, S3 at step 4, dashed arrow at step 5"*
7. Hits **Play** → 6-second animated sequence
8. Clicks **Export → MP4** → polished clip in 30 seconds
9. Clicks **Share** → public link → pastes in Slack
10. Total time: **under 5 minutes** (vs 45+ minutes in PowerPoint)

**Visible to user:** polished canvas, command bar, object library sidebar, timeline panel, export/share buttons, clean pricing page.

**Under the hood:** State Engine tracking JSON, deterministic router handling 80%, Haiku handling 20%, schema validation, Supabase persistence, PostHog analytics.

### 5.5 Success Metrics (PMF Signals)

- 1,000+ weekly active users by end of Layer 1
- 30%+ week-4 retention
- Users reporting "I made my diagram in 5 minutes instead of 45"
- Strong organic growth (no paid ads)
- Free-to-Pro conversion: 5%+
- Commands per session: 15+
- Exports per session: 1.5+
- Share link views per export: 3+

### 5.6 Moats Seeded in Layer 1

1. **Semantic Data Moat** — proprietary command/correction dataset, unique, compounds daily
2. **Semantic Object Library as Ontology** — opinionated DSL for architecture diagrams, not just shapes
3. **Speed-of-Execution Moat** — temporary but real 12-18 month window
4. **Community & Brand Moat** — slow burn, compounds on public presence
5. **Workflow Lock-In Moat** — user styles, custom objects, cross-canvas references

**Moats explicitly NOT pursued:** patents, "proprietary AI," closed-source everything, complex unnecessary features, exclusive partnerships.

### 5.7 Layer 1 Risks

- Design-deficient duo shipping an ugly product
- Burnout from 5-7 month intense duo work
- Scope creep from long-term vision sneaking into Layer 1
- Free-tier API cost abuse
- Category heating up (12-18 month competitive window)

---

## LAYER 2 — Voice & Ambient Intelligence
### "The AI Coworker Canvas"

**Duration:** 8–12 weeks after Layer 1 ships (1 week prototype target in our aggressive plan)
**Goal:** Add voice-first coworker layer on top of proven text-command foundation.

### 6.1 In-Scope Features

#### 6.1.1 Voice Input Pipeline
- **Push-to-talk** voice (spacebar-to-talk, Discord-style) — primary free-tier interaction
- STT via **Deepgram Nova** or **Groq Whisper** (~$0.006/min)
- Routes through the same intent router built in Layer 1 — voice is just a new input path, not a new brain
- TTS via **Cartesia Sonic** or **ElevenLabs Turbo** for responses

#### 6.1.2 Wake-Word Activation (Free Tier)
- Local voice activity detection (VAD) + wake word detection (**Picovoice Porcupine**, Vosk, or Web Speech API)
- Runs in browser/on-device, zero cloud cost until triggered
- Trigger phrase: *"Hey Canvas"* or configurable

#### 6.1.3 Always-On Ambient Mode (Paid Tier)
- Lower trigger threshold, more intent classifications per minute
- Doesn't run LLM continuously — just runs cheap classification more often
- Soft triggers on natural phrases: *"hmm," "I wonder," "what if"*
- Proactive whispers: *"want me to align these?"* based on Canvas State Engine signals

#### 6.1.4 Near-Real-Time Execution
- Pre-computed likely actions based on Canvas State Engine predictions
- Optimistic UI: execute locally immediately, reconcile with AI response after
- Target sub-500ms perceived latency
- Use Groq/Cerebras for fast LLM inference when needed

#### 6.1.5 Session Memory
- Short-term memory of working session: *"make it like the last arrow"*
- Contextual references: *"move that"* resolves to last interacted object
- Expands intent taxonomy for conversational phrasing (not just structured commands)

#### 6.1.6 Enhanced Command Logging
- Voice transcripts added to command logs
- Audio quality signals, confidence scores, corrections captured
- Powers fine-tuning of intent router in Layer 3+

#### 6.1.7 Voice-Specific Security & Guardrails
- **Voice consent prompt** on first use, explicit and reversible
- **Audio never stored by default** — transcripts only, ephemeral audio, 24h max retention unless opt-in
- **Wake-word detection runs locally** on-device (Picovoice/Web Speech) — raw audio never leaves the client until trigger
- **Voice commands go through the same LLM guardrail pipeline** as text commands — action allowlist, schema validation, rate limits
- **Background ambient mode (Pro tier)** shows a persistent visual indicator whenever the mic is hot — users must always know when they're being listened to
- **One-click mute** bound to a hotkey, always accessible

### 6.2 Required APIs (New in Layer 2)

| Service | Purpose | Cost |
|---|---|---|
| Deepgram Nova / Groq Whisper | STT | ~$0.006/min |
| Cartesia Sonic / ElevenLabs Turbo | TTS | ~$0.10–$0.30 per minute of output |
| Picovoice Porcupine | Wake word (local) | Free tier / low cost |
| Groq API | Fast LLM inference | ~$0.50/1M tokens |
| Vapi / Retell / Bland (optional) | Managed voice orchestration | Varies |

**Cost engineering principles:**
- Two-tier architecture: cheap STT + cheap LLM (Haiku/Flash) for commands, premium only for conversations
- Canvas state as structured JSON context, never screenshots (avoid vision token costs)
- Local VAD + wake word minimizes always-on cost
- Batch and debounce LLM calls

**Target unit economics:** ~$0.50/hour of active voice use → sustainable at $12/month subscription.

### 6.3 End-State (Layer 2)

A user can:
- Hold spacebar and say *"move the blue database to the middle and make it bigger"* → executes in under 500ms
- Toggle always-on mode (Pro tier), pace around the room saying *"hmm, I wonder if I should add a cache between these"* → AI whispers suggestion
- Iterate conversationally: *"make it dashed... no, thicker... perfect, now animate it at step 3"*
- Record a voice walkthrough that becomes an animated canvas playback

### 6.4 Layer 2 Success Metrics

- 50%+ of Pro users try voice within first session
- 30%+ of commands in voice sessions come from voice (vs. clicking)
- Voice-command accuracy >90% on top 50 commands
- Pro conversion lifts 2x after voice launch
- Demo video of voice-first flow goes viral (>100K views)

---

## LAYER 3 — Generative Intelligence & Rich Media
### "Beyond Deterministic"

**Duration:** 6 months after Layer 2
**Goal:** Add AI-generated content while preserving hybrid architecture.

### 7.1 In-Scope Features

- **Image generation** inside canvas (*"generate an illustration of a server rack"*) — Flux, SDXL, Imagen
- **Video/animation generation** — short looping clips, animated icons (Runway, Pika, Kling)
- **Smart layout suggestions** (*"turn this into a clean slide"*)
- **Content-aware rewriting** (*"make this headline punchier"*)
- **Import from computer / web pull** (the feature from the original vision — with proper rights handling)
- **Template intelligence** — AI learns from user's past canvases, suggests patterns
- **Fine-tuned intent router** — first model trained on proprietary command dataset from Layers 1–2

### 7.2 New APIs Required

| Service | Purpose |
|---|---|
| Flux / SDXL / Imagen | Image generation |
| Runway / Pika / Kling | Video generation |
| Claude Sonnet 4.6 | Higher-tier reasoning for layout/rewriting |
| Fine-tuned Llama/Mistral | Proprietary intent router (post-Layer 2 training) |

### 7.3 Pricing Evolution

- Free tier: limited generations per month
- Pro ($15/month): expanded generations
- **New: Pay-per-generation credits** for heavy users
- **New: Team plan** groundwork

---

## LAYER 4 — Vertical Expansion
### "From Engineer's Tool to Creative Platform"

**Duration:** 12 months after Layer 3
**Goal:** Unlock adjacent personas without rewriting the engine.

### 8.1 In-Scope Features

- **Semantic object libraries for new verticals:**
  - Marketers: funnels, journeys, campaigns, retargeting flows
  - Educators: lesson flows, mind maps, quizzes, curriculum maps
  - Founders: pitch decks, business models, GTM maps
  - Consultants: process maps, org charts, value chains
- **Vertical-specific command vocabularies** layered on shared intent router
- **Template marketplace** (community-contributed, curated)
- **Collaboration:** multiplayer editing, comments, shared workspaces
- **Team plans** and workspace billing
- **Brand kits** (fonts, colors, logos per workspace)
- **Comments and version history UI**

### 8.2 Local Market Play (Layer 4+)

- Localized templates (Indian wedding planning, SSC prep, Diwali marketing, local NGO pitches, etc.)
- Multi-language voice input/output
- UPI / local payment integration
- Aggressive pricing in INR, IDR, BRL (coffee-money tier)
- Telco / edtech bundle partnerships

---

## LAYER 5 — The Ideal State
### "Native AI Creative Platform for Everyone"

**Duration:** Ongoing
**Goal:** Become the default tool for anyone turning an idea into a visual artifact.

### 9.1 In-Scope Features

- **Multi-modal input:** voice, text, sketch, import, camera
- **Full ambient AI coworker** across sessions, long-term memory of user style
- **Cross-canvas intelligence** — AI knows everything user has made, can remix
- **Mobile-first capture** (underserved market)
- **Publishing and distribution** — canvases become shareable apps, interactive presentations, embeddable widgets
- **Plugin ecosystem** — third-party object libraries, integrations, export formats
- **Enterprise tier** — SSO, audit logs, brand governance, compliance
- **Global localization** at scale

---

## 10. Fundraising Path

| Stage | When | Amount | Traction Needed |
|---|---|---|---|
| **Bootstrap** | Layer 1 build | $0–$75K savings/F&F | Idea + team |
| **Pre-seed** | End of Layer 1 / start of Layer 2 | $500K–$2M | 1K–5K WAU, strong retention, viral demo |
| **Seed** | End of Layer 2 | $2M–$5M | 10K users, voice working, $5K–$20K MRR |
| **Series A** | Layer 3–4 | $5M–$15M | Vertical expansion proof, $100K+ MRR |
| **Series B+** | Layer 5 | $20M+ | Category leader, multi-vertical, global |

**Pitch per stage:**
- Pre-seed: *"10x faster for engineers making architecture diagrams."*
- Seed: *"First AI-native creative coworker, proven with engineers, adding voice."*
- Series A: *"Expanding from engineers into PMs, marketers, founders, educators. Same engine, exploding TAM."*
- Series B+: *"Default canvas for anyone turning ideas into visual artifacts."*

---

## 11. Team Considerations (Duo Reality)

### Four skill buckets needed (distributed across 2 people):
1. **Product & Frontend Engineering** — canvas, State Engine, UI
2. **AI / Backend Engineering** — intent router, LLM wiring, storage, voice integration
3. **Design & UX** — taste, hierarchy, interaction feel, copy
4. **Distribution & Storytelling** — public presence, launches, user conversations, content

**Gut-check questions for the duo:**
- Who owns each bucket?
- What's our combined runway?
- Do either of us have startup/launch experience?
- Do we have an existing audience or community presence?

### When to hire:
- **Designer** after Layer 1 PMF signal
- **Growth / community lead** between Layer 2 and Layer 3
- **Second engineer** during Layer 3 (generation layer + scaling)

---

## 12. Critical Next Steps

In order of priority, here's what to lock down before writing any code:

1. **Monorepo structure** — `@directoor/core` + `@directoor/web` + future `@directoor/mobile`. Platform-independent core from the first commit.
2. **State Engine schema** — the forever-decision. Object representation, properties, events, history format. Must be pure TypeScript with zero platform dependencies.
3. **Platform adapter interfaces** — abstract contracts for Storage, Input, Rendering, and Network. Web implementations first, mobile implementations later.
4. **Intent taxonomy** — the exact 50 deterministic commands + escalation criteria for LLM path.
5. **Semantic object library v1** — precise schemas for the 15 objects, including ontology metadata.
6. **Command logging schema** — the structure of captured data (proprietary dataset foundation).
7. **LLM prompt architecture** — system prompt design, delimiter strategy, schema validation, injection defense wrapping.
8. **Security baseline checklist** — auth flow, RLS policies, rate limits, secret management setup, privacy policy, ToS.
9. **Design system** — visual language, component primitives, interaction principles, mobile-responsive tokens.
10. **Performance budgets** — enforced in CI from day one.
11. **Prototype plan** — 1-week aggressive build: what exactly gets cut for the demo.

---

## 13. Open Questions to Revisit

- Exact team skill distribution between cofounders
- Financial runway (how long can we go without income?)
- Existing audience / distribution advantages
- Preferred launch timeline (aggressive 1-week prototype vs. 12-16 week production beta)
- First-100-users outreach strategy

---

## 14. Appendix — Key Insights From Discussion

### On the market gap
- PowerPoint/Keynote: powerful but 1987-era UX, no AI
- Figma/AE: for designers, 10x too complex for founders/PMs
- Gamma/Tome/Canva: AI-native but template-driven, no custom architecture diagrams
- **Nowhere:** engineer says *"dashed arrow from Postgres to S3, pulse it, then add another arrow to analytics"* and it just happens

### On defensibility
- PowerPoint's data model is visual-pixel-based, fundamentally wrong for AI control
- Our Canvas State Engine is a structured semantic model — 5-year head start
- Domain vocabulary (architecture, marketing, education) becomes per-vertical moat
- Conversational animation choreography is a killer differentiator incumbents can't bolt on

### On architecture wisdom
- Awareness is cheap, action is expensive — separate them
- Structured JSON canvas state is more accurate and cheaper than screenshots for LLM context
- Local VAD + wake word + cheap STT + cheap LLM covers 95% of cost-sensitive interactions
- Pre-computed likely actions + optimistic UI creates sub-200ms perceived latency

### On scope discipline
- Layer 1 validates PMF at lowest possible cost
- Voice is an upgrade to an already-working product, not a risky bet
- Generation is expensive — only add after core loop is tight
- Don't let ideal-state vision sneak features into Layer 1

---

**End of Plan v1.0**
*This document is a living source of truth. Update it as we learn.*
