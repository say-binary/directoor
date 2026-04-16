import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/classify-intent
 *
 * Given a natural-language query, returns the intended content mode:
 *   "diagram" — architectural or conceptual diagram (shapes + arrows)
 *   "text"    — prose / paragraph / tagline / caption
 *   "image"   — picture sourced from the web
 *
 * Strategy (cheap → expensive):
 *   1. Obvious-keyword prefilter (zero LLM cost, ~1ms)
 *   2. If ambiguous, call Haiku with a tiny prompt (~$0.0002/call)
 *
 * Default (fallback): "diagram" — preserves the backward-compatible
 * behaviour of the app for any unclassifiable input.
 */

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type IntentMode = "diagram" | "text" | "image";

// ─── Cheap prefilter ──────────────────────────────────────────
// Matches commands where intent is obvious from a verb/noun.

const TEXT_PATTERNS: RegExp[] = [
  /\b(write|generate|give me|compose|draft)\s+(a\s+)?(tagline|caption|heading|title|paragraph|para|summary|description|about|bio|intro|note|quote|blurb)/i,
  /\b\d+\s*(paragraphs?|paras?|lines?|sentences?)\b/i,
  /\b(tagline|caption|one-liner|one liner|blurb)\b/i,
  /^(write|generate|compose|draft)\b/i,
];

const IMAGE_PATTERNS: RegExp[] = [
  /\b(image|photo|picture|pic|illustration|photograph)\s+(of|for|showing)\b/i,
  /\b(find|fetch|get|show)\s+(a\s+)?(image|photo|picture|pic|illustration)\b/i,
  /^(image|photo|picture|pic)\b\s*:/i,
];

const DIAGRAM_PATTERNS: RegExp[] = [
  /\b(architecture|diagram|topology|pipeline|flow|flowchart|system|infrastructure)\b/i,
  /\b(microservices?|kafka|kubernetes|rag|ml\s+pipeline)\b/i,
  /\b(database|service|api\s+gateway|cache|queue|broker|load\s+balancer)\s+(and|with|between|connected)/i,
  /\barrow\s+(from|between|to)\b/i,
];

function prefilter(query: string): IntentMode | null {
  for (const p of TEXT_PATTERNS) if (p.test(query)) return "text";
  for (const p of IMAGE_PATTERNS) if (p.test(query)) return "image";
  for (const p of DIAGRAM_PATTERNS) if (p.test(query)) return "diagram";
  return null;
}

// ─── LLM fallback for ambiguous queries ───────────────────────

const CLASSIFY_SYSTEM = `Classify the user's query into exactly one of three modes and reply with ONLY that word:
- diagram: architectural diagram, system topology, flow chart, component relationships
- text:    prose, paragraph, tagline, caption, heading, description, quote
- image:   photograph, illustration, picture from the web

Default to "diagram" for anything about technical systems or components. Default to "text" for anything describing what words or prose to generate. Default to "image" only when the user clearly wants a picture.

Reply with exactly one word: diagram, text, or image. No punctuation, no explanation.`;

async function classifyViaLLM(query: string): Promise<IntentMode> {
  try {
    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8,
      system: CLASSIFY_SYSTEM,
      messages: [{ role: "user", content: query }],
    });
    const textBlock = resp.content.find((b) => b.type === "text");
    const reply = textBlock?.type === "text" ? textBlock.text.trim().toLowerCase() : "";
    if (reply.startsWith("text")) return "text";
    if (reply.startsWith("image")) return "image";
    return "diagram";
  } catch (err) {
    console.error("Intent classify error:", err);
    return "diagram";
  }
}

// ─── Endpoint ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { query?: string };
    const query = (body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ mode: "diagram" as IntentMode });
    }

    const prefiltered = prefilter(query);
    if (prefiltered) {
      return NextResponse.json({ mode: prefiltered, source: "prefilter" });
    }

    const mode = await classifyViaLLM(query);
    return NextResponse.json({ mode, source: "llm" });
  } catch (err) {
    console.error("classify-intent API error:", err);
    return NextResponse.json({ mode: "diagram" as IntentMode, source: "error" });
  }
}
