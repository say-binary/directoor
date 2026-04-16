import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveUserId } from "@/lib/command-logger";

/**
 * POST /api/log-feedback
 *
 * Records thumbs-up / thumbs-down (and an optional note) for a row in
 * `command_logs`. The user can only update rows they own — we use the
 * service role here for two reasons:
 *   1. anonymous-but-soon-to-be-logged-in flows still get logged
 *   2. the RLS update policy on command_logs requires auth.uid() match,
 *      so we re-check ownership ourselves before writing.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

interface FeedbackBody {
  logId: string;
  feedback: 1 | -1;
  note?: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!admin) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }
    const body = (await request.json()) as Partial<FeedbackBody>;
    const { logId, feedback, note } = body;
    if (!logId || (feedback !== 1 && feedback !== -1)) {
      return NextResponse.json({ error: "logId and feedback (1|-1) required" }, { status: 400 });
    }

    const userId = await resolveUserId(request.headers.get("authorization"));
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the log row belongs to this user before updating.
    const { data: existing, error: fetchErr } = await admin
      .from("command_logs")
      .select("user_id")
      .eq("id", logId)
      .single();
    if (fetchErr || !existing || (existing as { user_id: string }).user_id !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await admin
      .from("command_logs")
      .update({
        feedback,
        feedback_at: new Date().toISOString(),
        feedback_note: note ?? null,
      })
      .eq("id", logId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("log-feedback error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
