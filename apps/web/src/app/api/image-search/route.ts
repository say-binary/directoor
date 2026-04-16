import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/image-search
 *
 * Returns the top 5 web images matching the user's natural-language query.
 * Uses Openverse (api.openverse.org) — a Creative-Commons aggregator that
 * spans Flickr, Wikimedia, museums, etc. No API key required for modest
 * traffic; CC-licensed so safe to display in a canvas tool.
 *
 * Body: { query: string }
 * Returns: {
 *   results: Array<{
 *     id: string;
 *     thumbnail: string;     // small preview URL
 *     url: string;           // full-size URL
 *     width: number;
 *     height: number;
 *     title: string;
 *     creator?: string;
 *     license?: string;
 *     source?: string;
 *   }>;
 * }
 */

const PAGE_SIZE = 5;

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { query?: string };
    const query = (body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }
    if (query.length > 200) {
      return NextResponse.json({ error: "Query too long" }, { status: 400 });
    }

    const url = new URL("https://api.openverse.org/v1/images/");
    url.searchParams.set("q", query);
    url.searchParams.set("page_size", String(PAGE_SIZE));
    // Bias toward higher-quality landscape-friendly results
    url.searchParams.set("mature", "false");

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "Directoor/0.1 (https://directoor.app)",
      },
      // Openverse is occasionally slow; cap at 8s
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error("Openverse error:", response.status, response.statusText);
      return NextResponse.json(
        { error: `Image search failed (${response.status})`, results: [] },
        { status: 502 },
      );
    }

    const data = (await response.json()) as { results?: OpenverseHit[] };
    const hits = (data.results ?? []).slice(0, PAGE_SIZE);

    const results = hits.map((h) => ({
      id: h.id,
      thumbnail: h.thumbnail ?? h.url,
      url: h.url,
      width: h.width ?? 800,
      height: h.height ?? 600,
      title: h.title ?? "Untitled",
      creator: h.creator,
      license: h.license,
      source: h.source ?? h.foreign_landing_url,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Image search error:", err);
    return NextResponse.json(
      { error: "Internal server error", results: [] },
      { status: 500 },
    );
  }
}
