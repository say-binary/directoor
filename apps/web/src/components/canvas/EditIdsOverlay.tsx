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

    const update = () => {
      const next: Array<{ editId: string; shapeId: string; x: number; y: number; stacked: boolean }> = [];
      for (const shape of shapes) {
        const editId = registry.byShapeId.get(shape.id);
        if (!editId) continue;
        const bounds = editor.getShapePageBounds(shape.id);
        if (!bounds) continue;
        // Anchor: top-right corner of the shape bounds, projected to screen.
        const pt = editor.pageToScreen({ x: bounds.x + bounds.w, y: bounds.y });
        next.push({
          editId,
          shapeId: shape.id,
          x: pt.x,
          y: pt.y,
          stacked: animationShapeIds.has(shape.id),
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
            // Top-right external corner. If the shape also carries a blue
            // animation badge (which sits at shape centre), shift the red
            // chip down by its full height so the two stack cleanly
            // rather than overlap at different anchors.
            left: p.x + 4,
            top: p.y - 10 + (p.stacked ? 22 : 0),
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
