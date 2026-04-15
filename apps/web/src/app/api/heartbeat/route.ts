import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";

/**
 * POST /api/heartbeat
 *
 * Called by the browser every ~20 seconds while a user is actively
 * using the app. The watchdog script checks this file's mtime — if
 * it goes stale (no heartbeat for >60s), the watchdog assumes the
 * browser was closed and kills the dev server to free up resources.
 *
 * Uses /tmp explicitly (not os.tmpdir()) so the watchdog shell script
 * and the Node API agree on the file location.
 */
const HEARTBEAT_FILE = "/tmp/directoor-heartbeat";

export async function POST() {
  try {
    await writeFile(HEARTBEAT_FILE, String(Date.now()));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Heartbeat write failed:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET() {
  // Health check
  return NextResponse.json({ ok: true, alive: true });
}
