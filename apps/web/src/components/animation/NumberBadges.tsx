"use client";

import { useEffect, useState } from "react";
import type { Editor } from "tldraw";
import type { CanvasStore } from "@directoor/core";

interface NumberBadgesProps {
  editor: Editor | null;
  store: ReturnType<typeof import("@directoor/core").createCanvasStore>;
  animationSequence: number[];
}

interface BadgePosition {
  number: number;
  x: number;
  y: number;
  objectId: string;
  label: string;
}

/**
 * NumberBadges — Renders numbered badges on each canvas object.
 *
 * Each object gets a visible number (1, 2, 3...) based on creation order.
 * When the user types "animate 1,2,5,4", these numbers define the sequence.
 *
 * Badges are rendered as a React overlay on top of tldraw, positioned
 * using tldraw's coordinate-to-screen conversion.
 */
export function NumberBadges({ editor, store, animationSequence }: NumberBadgesProps) {
  const [badges, setBadges] = useState<BadgePosition[]>([]);

  useEffect(() => {
    if (!editor) return;

    const updateBadges = () => {
      const canvas = store.getState().canvas;
      const objects = Object.values(canvas.objects);

      // Sort by creation time to get stable numbering
      const sorted = [...objects].sort((a, b) => a.createdAt - b.createdAt);

      const newBadges: BadgePosition[] = [];

      for (let i = 0; i < sorted.length; i++) {
        const obj = sorted[i]!;

        // Convert canvas coordinates to screen coordinates via tldraw
        const screenPoint = editor.pageToViewport({ x: obj.position.x, y: obj.position.y });

        newBadges.push({
          number: i + 1,
          x: screenPoint.x,
          y: screenPoint.y,
          objectId: obj.id,
          label: obj.label,
        });
      }

      setBadges(newBadges);
    };

    // Update on every camera change (zoom, pan)
    updateBadges();
    const interval = setInterval(updateBadges, 500);

    return () => clearInterval(interval);
  }, [editor, store]);

  if (!editor || badges.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[9998]">
      {badges.map((badge) => {
        // Check if this number is in the animation sequence
        const seqIndex = animationSequence.indexOf(badge.number);
        const isInSequence = seqIndex !== -1;

        return (
          <div
            key={badge.objectId}
            className="absolute flex items-center justify-center"
            style={{
              left: badge.x - 12,
              top: badge.y - 12,
              width: 24,
              height: 24,
            }}
          >
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shadow-sm ${
                isInSequence
                  ? "bg-blue-500 text-white ring-2 ring-blue-200"
                  : "bg-slate-700 text-white"
              }`}
            >
              {badge.number}
            </div>
          </div>
        );
      })}
    </div>
  );
}
