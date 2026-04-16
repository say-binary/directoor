import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe, STRIPE_CONFIGURED, PRO_PRICE_ID } from "@/lib/stripe";
import { resolveUserId } from "@/lib/command-logger";

/**
 * POST /api/stripe/checkout
 *
 * Creates (or reuses) a Stripe Customer for the authenticated user
 * and returns a Checkout Session URL for the Pro subscription.
 *
 * Body: { returnUrl?: string }
 *
 * The webhook (/api/stripe/webhook) is what actually flips the
 * subscriptions row to tier=pro on subscription.created/updated. This
 * route only initiates the flow.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export async function POST(request: NextRequest) {
  if (!STRIPE_CONFIGURED || !stripe || !PRO_PRICE_ID) {
    return NextResponse.json(
      { error: "Billing is not configured." },
      { status: 503 },
    );
  }
  if (!admin) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const userId = await resolveUserId(request.headers.get("authorization"));
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Need the user's email for the customer record
  const { data: userResult } = await admin.auth.admin.getUserById(userId);
  const email = userResult?.user?.email ?? undefined;

  // Look up or create the customer
  const { data: existing } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  let customerId = (existing as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { user_id: userId },
    });
    customerId = customer.id;
    // Persist a placeholder row so the customer is reusable on next call
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from("subscriptions") as any).upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      tier: "free",
      status: "incomplete",
    }, { onConflict: "user_id" });
  }

  const body = (await request.json().catch(() => ({}))) as { returnUrl?: string };
  const origin = request.nextUrl.origin;
  const successUrl = `${body.returnUrl ?? origin}?upgraded=1`;
  const cancelUrl = body.returnUrl ?? origin;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { user_id: userId },
    },
  });

  return NextResponse.json({ url: session.url });
}
