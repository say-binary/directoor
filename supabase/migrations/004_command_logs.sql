-- 004_command_logs.sql
--
-- Proprietary command-log dataset — every LLM-touched command is
-- recorded here with enough structure to:
--   1. measure usage / latency / cost in aggregate
--   2. fine-tune our intent router / generation prompts later
--   3. capture user thumbs up/down feedback per response
--
-- This is the highest-leverage moat in Layer 1: even at 1k users, this
-- table compounds into a unique training set no competitor can replicate.

CREATE TABLE IF NOT EXISTS public.command_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  canvas_id     uuid REFERENCES public.canvases(id) ON DELETE SET NULL,

  -- Which API route fired (e.g. "command", "text", "image-search", "classify-intent")
  route         text NOT NULL,
  -- Inferred intent mode if applicable ("diagram" | "text" | "image" | null)
  mode          text,

  -- Raw user prompt (or normalized query)
  prompt        text NOT NULL,
  prompt_chars  int  NOT NULL DEFAULT 0,

  -- Optional: a compact summary of canvas state seen by the LLM
  -- (object_count, connection_count) — never the full canvas
  context_meta  jsonb DEFAULT '{}'::jsonb,

  -- Model + cost telemetry
  model         text,
  input_tokens  int  DEFAULT 0,
  output_tokens int  DEFAULT 0,
  latency_ms    int  DEFAULT 0,

  -- Outcome
  status        text NOT NULL DEFAULT 'ok',  -- 'ok' | 'error' | 'timeout' | 'rejected'
  error_message text,

  -- Compact LLM response snapshot for replay (truncated to 8KB)
  response_preview text,

  -- Per-response feedback (set later via /api/log-feedback)
  feedback      smallint,                    -- +1 thumbs up, -1 thumbs down, null = none
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

-- RLS: only the owning user can SELECT their rows; the service role
-- (used by API routes) bypasses RLS so it can INSERT/UPDATE freely.
ALTER TABLE public.command_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "command_logs_select_own" ON public.command_logs;
CREATE POLICY "command_logs_select_own"
  ON public.command_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Allow authenticated users to update ONLY the feedback fields on
-- their own rows (so the thumbs button can work without a service role
-- round-trip).
DROP POLICY IF EXISTS "command_logs_update_feedback_own" ON public.command_logs;
CREATE POLICY "command_logs_update_feedback_own"
  ON public.command_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
