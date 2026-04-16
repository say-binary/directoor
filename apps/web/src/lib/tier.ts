import { createClient } from "@supabase/supabase-js";

/**
 * Server-side tier resolution + free-tier cap enforcement.
 *
 * Tiers:
 *   free — default. 3 canvases, FREE_DAILY_LLM_CALLS LLM calls/day, watermark on exports.
 *   pro  — unlimited.
 *
 * Absence of a `subscriptions` row = free tier. Anonymous (no userId)
 * = free tier — the same caps apply per IP at a higher layer (Vercel
 * middleware / Cloudflare); here we just refuse if usage is suspicious.
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

export type Tier = "free" | "pro";

export const TIER_LIMITS = {
  free: {
    maxCanvases: 3,
    dailyLlmCalls: 50,
    watermarkExports: true,
    publicShare: true,
  },
  pro: {
    maxCanvases: Number.POSITIVE_INFINITY,
    dailyLlmCalls: Number.POSITIVE_INFINITY,
    watermarkExports: false,
    publicShare: true,
  },
} as const;

export async function getUserTier(userId: string | null): Promise<Tier> {
  if (!userId) return "free";
  const client = getAdmin();
  if (!client) return "free";
  try {
    const { data, error } = await client
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return "free";
    const row = data as { tier?: string; status?: string } | null;
    if (!row) return "free";
    if (row.tier === "pro" && (row.status === "active" || row.status === "trialing")) {
      return "pro";
    }
    return "free";
  } catch {
    return "free";
  }
}

/**
 * Count today's LLM calls (across command/text/image-search) for this
 * user. Used to enforce the daily-cap on the free tier.
 *
 * Returns Number.POSITIVE_INFINITY if we can't query — a graceful
 * "deny" path would be unfriendly when our DB is briefly down, so we
 * fail-open for usage counting (the user gets through; logs still
 * record the call so abuse is post-hoc visible).
 */
export async function getTodayLlmCallCount(userId: string | null): Promise<number> {
  if (!userId) return 0;
  const client = getAdmin();
  if (!client) return 0;
  try {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const { count, error } = await client
      .from("command_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("route", ["command", "text", "image-search"])
      .gte("created_at", since.toISOString());
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Should this LLM request be blocked because the free user is over
 * their daily cap? Returns a friendly message if so.
 */
export async function checkDailyLlmCap(userId: string | null): Promise<{ allowed: true } | { allowed: false; tier: Tier; used: number; limit: number; message: string }> {
  const tier = await getUserTier(userId);
  if (tier === "pro") return { allowed: true };
  const used = await getTodayLlmCallCount(userId);
  const limit = TIER_LIMITS.free.dailyLlmCalls;
  if (used >= limit) {
    return {
      allowed: false, tier, used, limit,
      message: `Daily free limit reached (${limit} commands). Upgrade to Pro for unlimited.`,
    };
  }
  return { allowed: true };
}

/**
 * Check whether the user is allowed to create another canvas. Free
 * tier is capped at 3.
 */
export async function checkCanvasCap(userId: string | null): Promise<{ allowed: true } | { allowed: false; used: number; limit: number; message: string }> {
  if (!userId) return { allowed: true };
  const tier = await getUserTier(userId);
  if (tier === "pro") return { allowed: true };
  const client = getAdmin();
  if (!client) return { allowed: true };
  try {
    const { count } = await client
      .from("canvases")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    const used = count ?? 0;
    const limit = TIER_LIMITS.free.maxCanvases;
    if (used >= limit) {
      return {
        allowed: false, used, limit,
        message: `Free plan is limited to ${limit} canvases. Upgrade to Pro for unlimited.`,
      };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}
