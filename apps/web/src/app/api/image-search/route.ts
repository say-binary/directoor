import { NextRequest, NextResponse } from "next/server";
import { logCommand, resolveUserId } from "@/lib/command-logger";
import { checkDailyLlmCap } from "@/lib/tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/image-search
 *
 * Returns up to PAGE_SIZE web images matching the user's natural-language
 * query. Primary source: Serper.dev (Google Images API) — full Google index,
 * understands complex queries, returns real web images at full resolution.
 * Fallback: Openverse (CC-licensed) if Serper is unavailable or the API key
 * is not configured.
 *
 * Body: { query: string; canvasId?: string }
 * Returns: {
 *   results: Array<{
 *     id: string;
 *     thumbnail: string;   // small preview URL (used in picker grid)
 *     url: string;         // full-size URL (placed on canvas)
 *     width: number;
 *     height: number;
 *     title: string;
 *     source?: string;     // originating domain
 *   }>;
 *   logId?: string;
 * }
 */

const PAGE_SIZE = 10;

// ─── Serper types ────────────────────────────────────────────────────────────

interface SerperImageResult {
  title?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  thumbnailUrl?: string;
  source?: string;
  link?: string;
}

interface SerperResponse {
  images?: SerperImageResult[];
  error?: string;
}

// ─── Openverse types (fallback) ──────────────────────────────────────────────

interface OpenverseHit {
  id: string;
  title?: string;
  thumbnail?: string;
  url: string;
  width?: number;
  height?: number;
  creator?: string;
  license?: string;
  source?: string;
  foreign_landing_url?: string;
}

// ─── Normalised hit ──────────────────────────────────────────────────────────

interface ImageHit {
  id: string;
  thumbnail: string;
  url: string;
  width: number;
  height: number;
  title: string;
  source?: string;
}

// ─── Serper search ───────────────────────────────────────────────────────────

async function searchViaSerper(query: string, num: number): Promise<ImageHit[]> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) throw new Error("SERPER_API_KEY not configured");

  const response = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Serper ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as SerperResponse;

  if (!data.images?.length) return [];

  return data.images.slice(0, num).map((img, i) => ({
    // Serper doesn't return a stable ID — use a hash of the URL
    id: `serper-${i}-${(img.imageUrl ?? img.thumbnailUrl ?? "").slice(-20)}`,
    thumbnail: img.thumbnailUrl ?? img.imageUrl ?? "",
    url: img.imageUrl ?? img.thumbnailUrl ?? "",
    width: img.imageWidth ?? 800,
    height: img.imageHeight ?? 600,
    title: img.title ?? "Untitled",
    source: img.source ?? img.link,
  })).filter((h) => h.url); // drop any hit with no URL
}

// ─── Openverse fallback ──────────────────────────────────────────────────────

async function searchViaOpenverse(query: string, num: number): Promise<ImageHit[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(num));
  url.searchParams.set("size", "large");
  url.searchParams.set("mature", "false");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "Directoor/0.1 (https://directoor.app)",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) throw new Error(`Openverse ${response.status}`);

  const data = (await response.json()) as { results?: OpenverseHit[] };
  return (data.results ?? []).slice(0, num).map((h) => ({
    id: h.id,
    thumbnail: h.thumbnail ?? h.url,
    url: h.url,
    width: h.width ?? 800,
    height: h.height ?? 600,
    title: h.title ?? "Untitled",
    source: h.source ?? h.foreign_landing_url,
  }));
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const userId = await resolveUserId(request.headers.get("authorization"));
  let query = "";
  try {
    const body = (await request.json()) as { query?: string; canvasId?: string };
    query = (body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }
    if (query.length > 300) {
      return NextResponse.json({ error: "Query too long" }, { status: 400 });
    }
    const canvasId = body.canvasId ?? null;

    // Free-tier daily cap
    const cap = await checkDailyLlmCap(userId);
    if (!cap.allowed) {
      await logCommand({
        userId, canvasId,
        route: "image-search", mode: "image", prompt: query,
        latencyMs: Date.now() - t0,
        status: "rejected",
        errorMessage: cap.message,
      });
      return NextResponse.json(
        { results: [], error: cap.message, capExceeded: true, tier: cap.tier, used: cap.used, limit: cap.limit },
        { status: 429 },
      );
    }

    // Try Serper first, fall back to Openverse
    let results: ImageHit[] = [];
    let provider = "serper";

    try {
      results = await searchViaSerper(query, PAGE_SIZE);
    } catch (serperErr) {
      console.warn("Serper failed, falling back to Openverse:", serperErr);
      provider = "openverse";
      try {
        results = await searchViaOpenverse(query, PAGE_SIZE);
      } catch (openverseErr) {
        console.error("Both providers failed:", openverseErr);
        await logCommand({
          userId, canvasId,
          route: "image-search", mode: "image", prompt: query,
          model: provider, latencyMs: Date.now() - t0,
          status: "error",
          errorMessage: openverseErr instanceof Error ? openverseErr.message : String(openverseErr),
        });
        return NextResponse.json(
          { error: "Image search unavailable. Try again shortly.", results: [] },
          { status: 502 },
        );
      }
    }

    if (results.length === 0) {
      return NextResponse.json({ results: [], logId: null });
    }

    const logId = await logCommand({
      userId, canvasId,
      route: "image-search", mode: "image", prompt: query,
      model: provider, latencyMs: Date.now() - t0,
      status: "ok",
      contextMeta: { hitCount: results.length, provider },
      responsePreview: results.map((r) => r.title).join(" | ").slice(0, 800),
    });

    return NextResponse.json({ results, logId });
  } catch (err) {
    console.error("Image search error:", err);
    await logCommand({
      userId, route: "image-search", mode: "image", prompt: query,
      latencyMs: Date.now() - t0,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Internal server error", results: [] },
      { status: 500 },
    );
  }
}
