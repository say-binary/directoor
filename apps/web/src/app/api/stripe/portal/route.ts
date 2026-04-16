import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe, STRIPE_CONFIGURED } from "@/lib/stripe";
import { resolveUserId } from "@/lib/command-logger";

/**
 * POST /api/stripe/portal
 *
 * Returns a Stripe Customer Portal URL so a Pro user can update their
 * card, view invoices, or cancel.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

export async function POST(request: NextRequest) {
  if (!STRIPE_CONFIGURED || !stripe) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }
  if (!admin) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const userId = await resolveUserId(request.headers.get("authorization"));
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  const customerId = (data as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json({ error: "No customer record" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { returnUrl?: string };
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: body.returnUrl ?? request.nextUrl.origin,
  });
  return NextResponse.json({ url: session.url });
}
