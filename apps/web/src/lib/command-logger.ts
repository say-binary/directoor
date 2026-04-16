import { createClient } from "@supabase/supabase-js";

/**
 * Server-side command logger.
 *
 * Writes to `command_logs` using the SERVICE ROLE key so it bypasses
 * RLS — log inserts must succeed regardless of the requesting user's
 * auth state. Failures are swallowed (logging must never break a real
 * user request).
 *
 * Use from any API route that touches an LLM. The returned id can be
 * sent back to the client and later surfaced for thumbs-up/down.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let admin: ReturnType<typeof createClient> | null = null;
function getAdmin() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  if (!admin) {
    admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export interface LogCommandInput {
  userId?: string | null;
  canvasId?: string | null;
  route: string;
  mode?: "diagram" | "text" | "image" | "intent" | null;
  prompt: string;
  contextMeta?: Record<string, unknown>;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  status?: "ok" | "error" | "timeout" | "rejected";
  errorMessage?: string;
  responsePreview?: string;
}

const PREVIEW_MAX = 8192;

/**
 * Insert one row. Returns the row id on success, null on any failure
 * (never throws — logging must be invisible to the request path).
 */
export async function logCommand(input: LogCommandInput): Promise<string | null> {
  const client = getAdmin();
  if (!client) return null;
  try {
    const preview = input.responsePreview
      ? input.responsePreview.length > PREVIEW_MAX
        ? input.responsePreview.slice(0, PREVIEW_MAX)
        : input.responsePreview
      : null;

    // Supabase generated types don't know about our `command_logs` table
    // (we haven't run `supabase gen types` post-migration), so cast the
    // builder to `any` so the typed payload is accepted at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = client.from("command_logs") as any;
    const { data, error } = await table
      .insert({
        user_id: input.userId ?? null,
        canvas_id: input.canvasId ?? null,
        route: input.route,
        mode: input.mode ?? null,
        prompt: input.prompt,
        prompt_chars: input.prompt.length,
        context_meta: input.contextMeta ?? {},
        model: input.model ?? null,
        input_tokens: input.inputTokens ?? 0,
        output_tokens: input.outputTokens ?? 0,
        latency_ms: input.latencyMs ?? 0,
        status: input.status ?? "ok",
        error_message: input.errorMessage ?? null,
        response_preview: preview,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("command-logger insert failed:", error.message);
      return null;
    }
    return (data as { id?: string } | null)?.id ?? null;
  } catch (err) {
    console.warn("command-logger threw:", err);
    return null;
  }
}

/**
 * Resolve the calling user's id from the Supabase auth header attached
 * by our client (Authorization: Bearer <access_token>). Returns null if
 * the request is anonymous or the token is invalid.
 */
export async function resolveUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const client = getAdmin();
  if (!client) return null;
  try {
    const token = authHeader.slice("Bearer ".length);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
