import { NextRequest, NextResponse } from "next/server";
import { polar, POLAR_CONFIGURED } from "@/lib/polar";
import { resolveUserId } from "@/lib/command-logger";

/**
 * POST /api/polar/portal
 *
 * Returns a Polar customer portal URL so a Pro user can update their
 * payment method, view invoices, or cancel. We create a one-time
 * customer session keyed by externalCustomerId (= our user_id) and
 * hand back the customerPortalUrl it produces.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!POLAR_CONFIGURED || !polar) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const userId = await resolveUserId(request.headers.get("authorization"));
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { returnUrl?: string };

  try {
    const session = await polar.customerSessions.create({
      externalCustomerId: userId,
    });
    // Append a returnUrl param so the portal's back button comes back to us
    const url = body.returnUrl
      ? `${session.customerPortalUrl}?return_url=${encodeURIComponent(body.returnUrl)}`
      : session.customerPortalUrl;
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[polar portal] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Portal failed" },
      { status: 500 },
    );
  }
}
