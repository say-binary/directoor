import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { logCommand, resolveUserId } from "@/lib/command-logger";
import { checkDailyLlmCap } from "@/lib/tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/text
 *
 * Generates prose based on a natural-language prompt. Sonnet picks the
 * appropriate length (single line / tagline / paragraph / multi-paragraph)
 * based on the wording of the request (e.g. "2 paragraphs on kafka",
 * "tagline for a coffee startup", "one-liner about React hooks").
 *
 * Returns:
 *   { text: string, suggestedWidth: number, suggestedHeight: number }
 *
 * The suggested dimensions are a hint for the client — the shape is
 * fully resizable afterward, and text reflows to fit.
 */

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You are a prose generator for Directoor — an AI canvas tool. The user has requested a block of text to drop onto their canvas.

Generate exactly what they asked for — no preamble, no follow-up questions, no meta-commentary. Respect the requested length:
- "one-liner", "short", "tagline" → one sentence, max ~15 words
- "caption" → one short line, max ~20 words
- "one paragraph", "a paragraph" → one paragraph, 50-100 words
- "two paragraphs" or "2 paragraphs" → two paragraphs, separated by a blank line, 60-100 words each
- "three paragraphs" → three paragraphs
- "brief" / "concise" → bias short
- "detailed" / "in depth" → bias longer
- If no length cue, default to one paragraph (~70 words)

Write in a neutral, clear, direct tone suitable for a slide or canvas annotation. No markdown, no bullet lists, no headings — just plain paragraphs separated by blank lines.

Output ONLY the prose, nothing else. No JSON wrapper.`;

function estimateDimensions(text: string): { width: number; height: number } {
  const chars = text.length;
  // Heuristic: 80 chars per line at 14px Inter → line width ~420px.
  // Target a readable width ~440-520px depending on length.
  const width = chars < 80 ? 320 : chars < 200 ? 440 : 520;
  const charsPerLine = Math.floor(width / 7);
  const lines = Math.ceil(chars / charsPerLine) + text.split("\n").length;
  const height = Math.max(60, lines * 22 + 24);
  return { width, height };
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const userId = await resolveUserId(request.headers.get("authorization"));
  let prompt = "";
  try {
    const body = (await request.json()) as { prompt?: string; canvasId?: string };
    prompt = (body.prompt ?? "").trim();
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }
    if (prompt.length > 500) {
      return NextResponse.json({ error: "Prompt too long" }, { status: 400 });
    }

    // Free-tier daily cap
    const cap = await checkDailyLlmCap(userId);
    if (!cap.allowed) {
      await logCommand({
        userId, canvasId: body.canvasId ?? null,
        route: "text", mode: "text", prompt,
        latencyMs: Date.now() - t0,
        status: "rejected",
        errorMessage: cap.message,
      });
      return NextResponse.json(
        { error: cap.message, capExceeded: true, tier: cap.tier, used: cap.used, limit: cap.limit },
        { status: 429 },
      );
    }

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `<user_request>${prompt}</user_request>`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      const logId = await logCommand({
        userId, canvasId: body.canvasId ?? null,
        route: "text", mode: "text", prompt,
        model: MODEL, latencyMs: Date.now() - t0,
        status: "error", errorMessage: "No text block in response",
      });
      return NextResponse.json(
        { error: "No response from AI", logId },
        { status: 500 },
      );
    }

    const text = textBlock.text.trim();
    const { width, height } = estimateDimensions(text);

    const logId = await logCommand({
      userId, canvasId: body.canvasId ?? null,
      route: "text", mode: "text", prompt,
      model: MODEL,
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
      latencyMs: Date.now() - t0,
      status: "ok",
      responsePreview: text,
    });

    return NextResponse.json({
      text,
      suggestedWidth: width,
      suggestedHeight: height,
      logId,
    });
  } catch (err) {
    console.error("Text API error:", err);
    await logCommand({
      userId, route: "text", mode: "text", prompt,
      model: MODEL, latencyMs: Date.now() - t0,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
