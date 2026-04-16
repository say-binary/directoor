import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { polar, POLAR_CONFIGURED, POLAR_PRO_PRODUCT_ID } from "@/lib/polar";
import { resolveUserId } from "@/lib/command-logger";

/**
 * POST /api/polar/checkout
 *
 * Creates a Polar checkout session for the Pro subscription. The
 * authenticated user's id is sent as `externalCustomerId` and as
 * subscription `metadata.user_id` so the webhook can resolve the row
 * to update.
 *
 * Body: { returnUrl?: string }
 * Returns: { url: string }
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

export async function POST(request: NextRequest) {
  if (!POLAR_CONFIGURED || !polar || !POLAR_PRO_PRODUCT_ID) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }
  if (!admin) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const userId = await resolveUserId(request.headers.get("authorization"));
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userResult } = await admin.auth.admin.getUserById(userId);
  const email = userResult?.user?.email ?? undefined;

  const body = (await request.json().catch(() => ({}))) as { returnUrl?: string };
  const origin = request.nextUrl.origin;
  const successUrl = `${body.returnUrl ?? origin}?upgraded=1&checkout_id={CHECKOUT_ID}`;

  try {
    const checkout = await polar.checkouts.create({
      products: [POLAR_PRO_PRODUCT_ID],
      successUrl,
      externalCustomerId: userId,
      customerEmail: email,
      metadata: { user_id: userId },
    });
    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    console.error("[polar checkout] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 500 },
    );
  }
}
