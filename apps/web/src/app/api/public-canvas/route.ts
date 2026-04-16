import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/public-canvas?slug=...
 *
 * Returns the canvas_state for a canvas that has been marked
 * `is_public = true`. Uses the service role to bypass RLS — the public
 * RLS policy on `canvases` already allows anonymous SELECT on rows
 * where `is_public = true`, but we go through the service role here so
 * we can return additional fields (title, updated_at) without leaking
 * private rows by accident.
 *
 * No auth required.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export async function GET(request: NextRequest) {
  if (!admin) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }
  try {
    const { data, error } = await admin
      .from("canvases")
      .select("id, title, canvas_state, updated_at, is_public")
      .eq("public_slug", slug)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || !(data as { is_public?: boolean }).is_public) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: (data as { id: string }).id,
      title: (data as { title?: string }).title ?? "Untitled Canvas",
      canvas_state: (data as { canvas_state?: unknown }).canvas_state ?? {},
      updated_at: (data as { updated_at: string }).updated_at,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
