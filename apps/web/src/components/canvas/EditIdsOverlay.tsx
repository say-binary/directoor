"use client";

import { useEffect, useState } from "react";
import { useValue, type Editor, type TLShape, type TLShapeId } from "tldraw";

/**
 * Session-scoped registry that assigns each shape a stable, human-readable
 * identifier like "S-12", "A-3", "T-7". The id survives toggle on/off,
 * never gets re-used (missing numbers after delete are expected), and is
 * NOT persisted to the canvas snapshot — it's purely an editing
 * affordance that lets voice/text commands reference a specific asset.
 */
export interface EditIdRegistry {
  byShapeId: Map<string, string>;
  byEditId: Map<string, string>;
  counters: Map<string, number>;
}

export function createEditIdRegistry(): EditIdRegistry {
  return {
    byShapeId: new Map(),
    byEditId: new Map(),
    counters: new Map(),
  };
}

/** Map a tldraw shape type to its single-letter editor-id prefix. */
function prefixForShape(shape: TLShape): string {
  const t = shape.type;
  switch (t) {
    case "text": return "T";
    case "note": return "N";
    case "draw": return "D";
    case "line": return "L";
    case "arrow":
    case "directoor-arrow": return "A";
    case "image":
    case "directoor-image": return "I";
    case "highlight": return "H";
    case "geo": return "S";
    default:
      // directoor-* custom semantic shapes (database, queue, service, ...)
      // all collapse under "S" (shape). "X" is the catch-all for anything
      // tldraw adds that we haven't taxonomised.
      if (t.startsWith("directoor-")) return "S";
      return "X";
  }
}

/** Assign ids to any shapes that don't yet have one. Mutates the registry. */
export function ensureEditIds(registry: EditIdRegistry, shapes: readonly TLShape[]) {
  for (const shape of shapes) {
    if (registry.byShapeId.has(shape.id)) continue;
    const prefix = prefixForShape(shape);
    const n = (registry.counters.get(prefix) ?? 0) + 1;
    registry.counters.set(prefix, n);
    const editId = `${prefix}-${n}`;
    registry.byShapeId.set(shape.id, editId);
    registry.byEditId.set(editId, shape.id);
  }
}

/** Resolve a case-insensitive editor id ("s-3", "A-12") to a tldraw shape id. */
export function resolveEditId(registry: EditIdRegistry, editId: string): TLShapeId | null {
  const normalized = editId.trim().toUpperCase();
  const id = registry.byEditId.get(normalized);
  return (id as TLShapeId) ?? null;
}

interface EditIdsOverlayProps {
  editor: Editor;
  enabled: boolean;
  registry: EditIdRegistry;
  /** Set of shape ids that currently have a blue animation badge. When
   *  a shape has both, we offset the red id chip vertically so the two
   *  read as a stack instead of overlapping. */
  animationShapeIds: Set<string>;
}

export function EditIdsOverlay({ editor, enabled, registry, animationShapeIds }: EditIdsOverlayProps) {
  // Reactively read the current page shapes so the overlay covers new
  // additions immediately (no mount-time snapshot).
  const shapes = useValue<TLShape[]>(
    "editIds.pageShapes",
    () => editor.getCurrentPageShapes(),
    [editor],
  );

  // Maintain screen positions on a timer: pan/zoom don't trigger React
  // re-renders, so we poll (same pattern as AnimationRegion badges).
  const [positions, setPositions] = useState<
    Array<{ editId: string; shapeId: string; x: number; y: number; stacked: boolean }>
  >([]);

  useEffect(() => {
    if (!enabled) {
      setPositions([]);
      return;
    }
    // Make sure every current shape has an id before we render.
    ensureEditIds(registry, shapes);

    /**
     * Place each chip ON the shape it refers to, and (subject to that
     * constraint) as far from every other chip as possible so clusters
     * of shapes don't produce a wall of ambiguous labels.
     *
     * Algorithm: for each shape we compute a set of in-bounds candidate
     * anchor points (4 corners + centre for normal shapes, just the
     * centre for thin/small shapes where a corner would fall outside
     * the visible geometry, e.g. arrows or tiny icons). We then assign
     * placements greedily in page space — for each shape pick the
     * candidate that maximises the minimum distance to all already-
     * placed chips. Greedy on this objective is order-dependent but a
     * single pass is enough for practical cluster sizes.
     */
    const PAD = 14; // inset from corner toward centre, in page units
    type Candidate = { x: number; y: number };
    const candidatesFor = (b: { x: number; y: number; w: number; h: number }): Candidate[] => {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      if (b.w < 44 || b.h < 34) {
        // Thin or tiny (arrows, lines, narrow icons) — only the centre
        // is reliably on the shape's visible geometry.
        return [{ x: cx, y: cy }];
      }
      const ix = Math.max(PAD, Math.min(b.w / 2, PAD));
      const iy = Math.max(PAD, Math.min(b.h / 2, PAD));
      return [
        { x: b.x + ix, y: b.y + iy },
        { x: b.x + b.w - ix, y: b.y + iy },
        { x: b.x + ix, y: b.y + b.h - iy },
        { x: b.x + b.w - ix, y: b.y + b.h - iy },
        { x: cx, y: cy },
      ];
    };

    const update = () => {
      // Gather renderable shapes once with their bounds + candidates.
      const entries: Array<{
        shape: (typeof shapes)[number];
        editId: string;
        candidates: Candidate[];
        bounds: { x: number; y: number; w: number; h: number };
      }> = [];
      for (const shape of shapes) {
        const editId = registry.byShapeId.get(shape.id);
        if (!editId) continue;
        const bounds = editor.getShapePageBounds(shape.id);
        if (!bounds) continue;
        entries.push({ shape, editId, candidates: candidatesFor(bounds), bounds });
      }

      // Assign placements greedily: for stability, visit shapes in a
      // deterministic order (by shape id) so positions don't jitter
      // between polls when the shape set hasn't changed.
      entries.sort((a, b) => (a.shape.id < b.shape.id ? -1 : a.shape.id > b.shape.id ? 1 : 0));

      const placed: Array<{ x: number; y: number }> = [];
      const chosen = new Map<string, Candidate>();
      for (const entry of entries) {
        let best = entry.candidates[0]!;
        let bestScore = -Infinity;
        for (const c of entry.candidates) {
          // Minimum distance from this candidate to any already-placed
          // chip. With no prior placements the tie-breaker is the
          // distance to the shape's own centre (centre wins ties for
          // small shapes with only one candidate).
          let minDist = Infinity;
          for (const p of placed) {
            const d = Math.hypot(c.x - p.x, c.y - p.y);
            if (d < minDist) minDist = d;
          }
          if (minDist > bestScore) {
            bestScore = minDist;
            best = c;
          }
        }
        placed.push(best);
        chosen.set(entry.shape.id, best);
      }

      // Project each chosen page point to screen coords for rendering.
      const next: Array<{ editId: string; shapeId: string; x: number; y: number; stacked: boolean }> = [];
      for (const entry of entries) {
        const pagePt = chosen.get(entry.shape.id)!;
        const screenPt = editor.pageToScreen(pagePt);
        next.push({
          editId: entry.editId,
          shapeId: entry.shape.id,
          x: screenPt.x,
          y: screenPt.y,
          stacked: animationShapeIds.has(entry.shape.id),
        });
      }
      setPositions(next);
    };
    update();
    const interval = setInterval(update, 150);
    return () => clearInterval(interval);
  }, [enabled, shapes, editor, registry, animationShapeIds]);

  if (!enabled) return null;

  return (
    <>
      {positions.map((p) => (
        <div
          key={p.shapeId}
          className="pointer-events-none fixed z-[9996]"
          style={{
            // Anchor is a point inside the shape's geometry — render the
            // chip centred on it via translate(-50%, -50%). If the shape
            // also carries a blue animation badge (also anchored at the
            // shape's centre), push the red chip downward so the two
            // read as a vertical stack instead of overlapping.
            left: p.x,
            top: p.y,
            transform: `translate(-50%, calc(-50% + ${p.stacked ? 22 : 0}px))`,
          }}
        >
          <div
            className="flex h-[18px] items-center rounded-md bg-red-500 px-1.5 font-mono text-[10px] font-bold tracking-tight text-white shadow-md ring-1 ring-red-700/30"
            title={`Edit id — type "edit ${p.editId} …" in the command bar`}
          >
            {p.editId}
          </div>
        </div>
      ))}
    </>
  );
}
