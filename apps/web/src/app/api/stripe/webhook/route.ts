import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe, STRIPE_CONFIGURED, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import type Stripe from "stripe";

// Stripe webhook signature verification requires the RAW request body —
// we read it via request.text() below. Force Node runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook
 *
 * Stripe → us. Validates the signature, then upserts the user's
 * `subscriptions` row on every customer.subscription.* event.
 *
 * Configure the endpoint in your Stripe Dashboard pointing to:
 *   https://YOUR_DOMAIN/api/stripe/webhook
 * and copy the signing secret into STRIPE_WEBHOOK_SECRET.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export async function POST(request: NextRequest) {
  if (!STRIPE_CONFIGURED || !stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }
  if (!admin) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // We need the raw body for signature verification
  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe webhook] bad signature:", err);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  try {
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const userId =
        (sub.metadata?.user_id as string | undefined) ??
        (await lookupUserIdByCustomer(sub.customer as string));
      if (!userId) {
        console.warn("[stripe webhook] no user_id resolvable for subscription", sub.id);
        return NextResponse.json({ received: true });
      }

      const tier = sub.status === "active" || sub.status === "trialing" ? "pro" : "free";
      // Stripe v22 moved current_period_end to the subscription item.
      // Take the first item's value as the canonical renewal moment.
      const item = sub.items?.data?.[0];
      const periodEndUnix = (item as { current_period_end?: number } | undefined)?.current_period_end;
      const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin.from("subscriptions") as any).upsert({
        user_id: userId,
        tier,
        status: sub.status,
        stripe_customer_id: sub.customer as string,
        stripe_subscription_id: sub.id,
        current_period_end: periodEnd,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
      }, { onConflict: "user_id" });
    }
  } catch (err) {
    console.error("[stripe webhook] handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function lookupUserIdByCustomer(customerId: string): Promise<string | null> {
  if (!admin) return null;
  const { data } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}
