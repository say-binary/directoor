"use client";

import { useEffect, useRef } from "react";

/**
 * HeartbeatSender — Pings /api/heartbeat every 20 seconds while the
 * user is active, and stops if the user is idle for more than 15 minutes.
 *
 * The watchdog script (run by the desktop launcher) monitors the
 * heartbeat file and shuts down the dev server if it goes stale.
 *
 * - Active heartbeat: every 20s
 * - User activity = mousemove, keypress, click, touchstart
 * - Idle timeout: 15 minutes of no activity → stop sending
 * - Browser close: page unloads → no more heartbeats → watchdog times out
 */

const HEARTBEAT_INTERVAL_MS = 20_000;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export function HeartbeatSender() {
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    // Track user activity
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    for (const evt of events) {
      window.addEventListener(evt, updateActivity, { passive: true });
    }

    // Send heartbeat on mount
    fetch("/api/heartbeat", { method: "POST" }).catch(() => {});

    // Periodic heartbeat — only if user is not idle
    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs < IDLE_TIMEOUT_MS) {
        fetch("/api/heartbeat", { method: "POST" }).catch(() => {});
      }
      // If idle > 15 min, just stop — watchdog will detect stale heartbeat
      // and shut down the server
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      for (const evt of events) {
        window.removeEventListener(evt, updateActivity);
      }
    };
  }, []);

  return null;
}
