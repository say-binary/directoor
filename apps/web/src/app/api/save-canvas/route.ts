import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/save-canvas
 *
 * Server-side save endpoint. Used by sendBeacon on page unload
 * since sendBeacon can't send auth headers to Supabase directly.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { canvasId, canvasState, objectCount, connectionCount } = body;

    if (!canvasId) {
      return NextResponse.json({ error: "Missing canvasId" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error } = await supabase
      .from("canvases")
      .update({
        canvas_state: canvasState,
        object_count: objectCount ?? 0,
        connection_count: connectionCount ?? 0,
      })
      .eq("id", canvasId);

    if (error) {
      console.error("Save canvas error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Save canvas API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
