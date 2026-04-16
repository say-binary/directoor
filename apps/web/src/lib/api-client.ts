"use client";

import { supabase } from "./supabase";

/**
 * apiFetch — wrapper around `fetch` that:
 *   1. Attaches the current Supabase access token as Bearer (for
 *      command_logs.user_id resolution).
 *   2. Auto-injects the current canvasId into the JSON body if absent
 *      (so server-side logging can join logs to a canvas).
 *
 * Falls back to a normal fetch if the user is anonymous.
 */
export async function apiFetch(
  url: string,
  init: RequestInit & { canvasId?: string | null } = {},
): Promise<Response> {
  const { canvasId, ...rest } = init;

  // Inject canvasId into JSON bodies
  let body = rest.body;
  if (
    canvasId &&
    body &&
    typeof body === "string" &&
    rest.headers &&
    new Headers(rest.headers).get("content-type")?.includes("json")
  ) {
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed === "object" && parsed !== null && parsed.canvasId === undefined) {
        parsed.canvasId = canvasId;
        body = JSON.stringify(parsed);
      }
    } catch {
      // leave body as-is
    }
  }

  // Attach auth header
  const headers = new Headers(rest.headers);
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token && !headers.has("authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    // continue anonymously
  }

  return fetch(url, { ...rest, body, headers });
}

/**
 * Submit thumbs up/down feedback for a previously-returned logId.
 * Silently fails on network errors — feedback is best-effort.
 */
export async function submitFeedback(
  logId: string,
  feedback: 1 | -1,
  note?: string,
): Promise<boolean> {
  try {
    const res = await apiFetch("/api/log-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logId, feedback, note }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
