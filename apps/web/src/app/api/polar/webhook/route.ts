import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { POLAR_CONFIGURED, POLAR_WEBHOOK_SECRET } from "@/lib/polar";

/**
 * POST /api/polar/webhook
 *
 * Polar → us. Validates the standard-webhooks signature (Polar uses the
 * same scheme as Svix), then upserts the user's `subscriptions` row on
 * subscription.* events.
 *
 * Configure the endpoint in your Polar dashboard pointing to:
 *   https://YOUR_DOMAIN/api/polar/webhook
 * and copy the signing secret into POLAR_WEBHOOK_SECRET.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// Subscription statuses that grant Pro access. Anything else (canceled,
// past_due, incomplete, …) drops the user back to free.
const PRO_STATUSES = new Set(["active", "trialing"]);

interface PolarSubscriptionPayload {
  id: string;
  status: string;
  customerId: string;
  currentPeriodEnd: Date | string | null;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  if (!POLAR_CONFIGURED || !POLAR_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }
  if (!admin) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const raw = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => { headers[k] = v; });

  let event: { type: string; data: unknown };
  try {
    event = validateEvent(raw, headers, POLAR_WEBHOOK_SECRET) as { type: string; data: unknown };
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    }
    console.error("[polar webhook] validate error:", err);
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  try {
    if (
      event.type === "subscription.created" ||
      event.type === "subscription.updated" ||
      event.type === "subscription.active" ||
      event.type === "subscription.canceled" ||
      event.type === "subscription.revoked" ||
      event.type === "subscription.uncanceled" ||
      event.type === "subscription.past_due"
    ) {
      const sub = event.data as PolarSubscriptionPayload;
      const meta = (sub.metadata ?? {}) as Record<string, unknown>;
      const userId = await resolveUserId(meta, sub.customerId);
      if (!userId) {
        console.warn("[polar webhook] no user_id resolvable for subscription", sub.id);
        return NextResponse.json({ received: true });
      }

      const tier = PRO_STATUSES.has(sub.status) ? "pro" : "free";
      const periodEnd = sub.currentPeriodEnd
        ? new Date(sub.currentPeriodEnd as string).toISOString()
        : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from("subscriptions") as any).upsert(
        {
          user_id: userId,
          tier,
          status: sub.status,
          polar_customer_id: sub.customerId,
          polar_subscription_id: sub.id,
          current_period_end: periodEnd,
          cancel_at_period_end: sub.cancelAtPeriodEnd ?? false,
        },
        { onConflict: "user_id" },
      );
    }
  } catch (err) {
    console.error("[polar webhook] handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Map a webhook payload back to our auth.users.id.
 *
 * Two paths:
 *   1. metadata.user_id was set when the checkout was created → trust it
 *   2. fall back to looking up the row by polar_customer_id (set on a
 *      previous webhook for the same customer)
 */
async function resolveUserId(
  metadata: Record<string, unknown>,
  customerId: string,
): Promise<string | null> {
  const fromMeta = metadata.user_id;
  if (typeof fromMeta === "string" && fromMeta.length > 0) return fromMeta;

  if (!admin) return null;
  const { data } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("polar_customer_id", customerId)
    .maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}
