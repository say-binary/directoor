import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/save-canvas
 *
 * Server-side save endpoint with safety guards:
 *
 * 1. Empty-write protection: if the incoming payload has 0 shapes but
 *    the existing canvas in Supabase has shapes, refuse the write and
 *    return 409. This is a last line of defense against client bugs
 *    that try to wipe the DB.
 *
 * 2. The canvas_versions table (via DB trigger) automatically snapshots
 *    the OLD canvas_state before each UPDATE, so we always have the last
 *    5 versions for recovery.
 *
 * 3. Used both by the regular auto-save and by sendBeacon on page unload.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { canvasId, canvasState, objectCount = 0, connectionCount = 0 } = body;

    if (!canvasId) {
      return NextResponse.json({ error: "Missing canvasId" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // ─── EMPTY-WRITE SAFETY CHECK ──────────────────────────────────
    // If the incoming save has zero shapes/connections, fetch the
    // current DB state. If the DB has shapes, REFUSE the write —
    // this protects against client bugs that try to wipe data.
    if (objectCount === 0 && connectionCount === 0) {
      const { data: existing } = await supabase
        .from("canvases")
        .select("object_count, connection_count")
        .eq("id", canvasId)
        .single();

      if (existing && (existing.object_count > 0 || existing.connection_count > 0)) {
        console.warn(
          `[save-canvas] BLOCKED empty-write to canvas ${canvasId} ` +
          `(DB has ${existing.object_count} objects, ${existing.connection_count} connections)`,
        );
        return NextResponse.json(
          {
            error: "Refused: would overwrite non-empty canvas with empty state",
            blocked: true,
            existingObjectCount: existing.object_count,
            existingConnectionCount: existing.connection_count,
          },
          { status: 409 },
        );
      }
    }

    // ─── Perform the update ────────────────────────────────────────
    const { error } = await supabase
      .from("canvases")
      .update({
        canvas_state: canvasState,
        object_count: objectCount,
        connection_count: connectionCount,
      })
      .eq("id", canvasId);

    if (error) {
      console.error("[save-canvas] DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[save-canvas] API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
