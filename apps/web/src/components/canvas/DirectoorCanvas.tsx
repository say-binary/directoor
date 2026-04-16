"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { Tldraw, Editor, TLShapeId, TLComponents } from "tldraw";
import { DIRECTOOR_SHAPE_UTILS } from "./shapes/DirectoorShapes";

// Hide tldraw UI elements we don't need
const hiddenComponents: TLComponents = {
  PageMenu: null,         // Remove "Page 1" dropdown
};
import "tldraw/tldraw.css";
import { createCanvasStore } from "@directoor/core";
import { CommandBar } from "../command-bar/CommandBar";
import { InlineCommand } from "../command-bar/InlineCommand";
import { AnimationRegion, type AnimationRegionData } from "../animation/AnimationRegion";
import { Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CanvasToolbar } from "./CanvasToolbar";
import { ShareDialog } from "./ShareDialog";
import { AnimationExportDialog } from "./AnimationExportDialog";

/**
 * DirectoorCanvas — The main canvas component
 *
 * - Auto-saves to Supabase on every change (debounced)
 * - Loads canvas state from Supabase when canvasId changes
 * - Dual input: double-click (positioned) + Cmd+K (global)
 * - Region-based animation
 */

interface DirectoorCanvasProps {
  canvasId?: string | null;
  userId?: string;
  /** "free" | "pro" — used to apply watermark on free-tier exports */
  tier?: "free" | "pro";
  /** Called when save function is ready — parent uses this to save before switching */
  onSaveReady?: (saveFn: () => Promise<void>) => void;
  /** Called when the tldraw editor is ready — parent uses this for sidebar shape library */
  onEditorReady?: (editor: Editor) => void;
}

export function DirectoorCanvas({ canvasId, userId, tier, onSaveReady, onEditorReady }: DirectoorCanvasProps) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [store] = useState(() => createCanvasStore(canvasId ?? undefined, userId));

  // Inline command state
  const [inlineCommand, setInlineCommand] = useState<{
    canvasPosition: { x: number; y: number };
    screenPosition: { x: number; y: number };
  } | null>(null);

  // Animation regions
  const [animationRegions, setAnimationRegions] = useState<AnimationRegionData[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportAnimationOpen, setExportAnimationOpen] = useState(false);

  // Selection state for showing "Animate this" button
  const [selectedShapeIds, setSelectedShapeIds] = useState<TLShapeId[]>([]);
  const [selectionToolbarPos, setSelectionToolbarPos] = useState({ x: 0, y: 0 });

  // Double-click detection
  const lastClickRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const handleMount = useCallback((editorInstance: Editor) => {
    setEditor(editorInstance);
    editorInstance.updateInstanceState({ isGridMode: true });
    onEditorReady?.(editorInstance);
  }, [onEditorReady]);

  // ─── Auto-save with race-condition protection ────────────────
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");
  const animationRegionsRef = useRef(animationRegions);
  animationRegionsRef.current = animationRegions;
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const canvasIdRef = useRef(canvasId);
  canvasIdRef.current = canvasId;

  // CRITICAL: blocks ALL saves until load completes for THIS canvasId.
  // Without this, the save effects fire on mount and overwrite the DB
  // with an empty snapshot before the load completes.
  const hasLoadedRef = useRef(false);
  // Reset load flag when canvasId changes (we're switching canvases)
  useEffect(() => {
    hasLoadedRef.current = false;
    lastSavedRef.current = "";
  }, [canvasId]);

  /**
   * Core save function. Multiple safety layers:
   * 1. No save before load completes (hasLoadedRef gate)
   * 2. No-op if nothing changed (lastSavedRef compare)
   * 3. Server-side empty-write guard (in /api/save-canvas) refuses to
   *    overwrite a non-empty canvas with empty data.
   */
  const doSave = useCallback(async () => {
    const ed = editorRef.current;
    const cid = canvasIdRef.current;
    if (!ed || !cid || cid.startsWith("dev-")) return;

    // GUARD: don't save before load completes
    if (!hasLoadedRef.current) {
      return;
    }

    try {
      const snapshot = ed.store.getStoreSnapshot();
      const regions = animationRegionsRef.current;

      const savePayload = {
        tldrawSnapshot: snapshot,
        animationRegions: regions.map((r) => ({
          id: r.id,
          shapeIds: r.shapeIds,
          sequence: r.sequence,
          isLooping: r.isLooping,
        })),
      };

      const saveStr = JSON.stringify(savePayload);
      if (saveStr === lastSavedRef.current) return;

      const allShapes = ed.getCurrentPageShapes();
      // Connections = any arrow shape (tldraw "arrow" or our "directoor-arrow")
      const isArrow = (s: { type: string }) => s.type === "arrow" || s.type === "directoor-arrow";
      const objectCount = allShapes.filter((s) => !isArrow(s)).length;
      const connectionCount = allShapes.filter(isArrow).length;

      // Save via our API route (which has the empty-write safety check)
      const res = await fetch("/api/save-canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasId: cid,
          canvasState: savePayload,
          objectCount,
          connectionCount,
        }),
      });

      if (res.ok) {
        lastSavedRef.current = saveStr;
      } else {
        const errBody = await res.json().catch(() => ({}));
        console.warn("Save rejected:", errBody);
      }
    } catch (err) {
      console.error("Auto-save failed:", err);
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(doSave, 2000);
  }, [doSave]);

  // Expose save function to parent so it can save before switching canvases
  useEffect(() => {
    onSaveReady?.(doSave);
  }, [doSave, onSaveReady]);

  // Save on browser refresh/close via sendBeacon to our own API
  useEffect(() => {
    const handleBeforeUnload = () => {
      const ed = editorRef.current;
      const cid = canvasIdRef.current;
      if (!ed || !cid || cid.startsWith("dev-")) return;

      // CRITICAL: don't save if load hasn't completed (would wipe DB)
      if (!hasLoadedRef.current) return;

      const snapshot = ed.store.getStoreSnapshot();
      const regions = animationRegionsRef.current;
      const savePayload = {
        tldrawSnapshot: snapshot,
        animationRegions: regions.map((r) => ({
          id: r.id, shapeIds: r.shapeIds, sequence: r.sequence, isLooping: r.isLooping,
        })),
      };

      const allShapes = ed.getCurrentPageShapes();
      // Connections = any arrow shape (tldraw "arrow" or our "directoor-arrow")
      const isArrow = (s: { type: string }) => s.type === "arrow" || s.type === "directoor-arrow";
      const objectCount = allShapes.filter((s) => !isArrow(s)).length;
      const connectionCount = allShapes.filter(isArrow).length;

      navigator.sendBeacon(
        "/api/save-canvas",
        new Blob([JSON.stringify({
          canvasId: cid,
          canvasState: savePayload,
          objectCount,
          connectionCount,
        })], { type: "application/json" }),
      );
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Listen for tldraw store changes → debounced save
  useEffect(() => {
    if (!editor || !canvasId || !userId) return;
    const unsub = editor.store.listen(scheduleSave, { scope: "document" });
    return () => unsub();
  }, [editor, canvasId, userId, scheduleSave]);

  // Save immediately when animation regions change
  useEffect(() => {
    if (!editor || !canvasId || !userId) return;
    doSave();
  }, [animationRegions, editor, canvasId, userId, doSave]);

  // Save immediately on unmount (canvas switch / logout)
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      // Fire synchronous save attempt via sendBeacon as last resort
      const ed = editorRef.current;
      const cid = canvasIdRef.current;
      if (ed && cid && !cid.startsWith("dev-")) {
        // Best-effort immediate save
        doSave();
      }
    };
  }, [doSave]);

  // ─── Load canvas from Supabase when canvasId changes ─────────
  useEffect(() => {
    if (!editor || !canvasId || !userId || canvasId.startsWith("dev-")) return;

    let cancelled = false;

    const loadCanvas = async () => {
      try {
        const { data, error } = await supabase
          .from("canvases")
          .select("canvas_state")
          .eq("id", canvasId)
          .single();

        if (cancelled) return;
        if (error) throw error;

        if (data?.canvas_state && typeof data.canvas_state === "object") {
          const saved = data.canvas_state as Record<string, unknown>;

          // Restore tldraw snapshot — migrating any old shape records
          // whose props are missing new fields added in later schema versions.
          if (saved.tldrawSnapshot) {
            try {
              const snapshot = saved.tldrawSnapshot as {
                store: Record<string, { id?: string; typeName?: string; type?: string; props?: Record<string, unknown> }>;
              };
              if (snapshot?.store) {
                for (const [key, rec] of Object.entries(snapshot.store)) {
                  if (!rec || rec.typeName !== "shape" || !rec.props) continue;
                  // Migration: directoor-arrow gained labelPosition in a later version
                  if (rec.type === "directoor-arrow") {
                    if (rec.props.labelPosition === undefined) rec.props.labelPosition = 0.5;
                    if (rec.props.label === undefined) rec.props.label = "";
                  }
                  // Migration: directoor-text gained contentType in a later version.
                  // Small text shapes (typical arrow labels) → "inline"; larger
                  // shapes assume "prose" mode.
                  if (rec.type === "directoor-text") {
                    if (rec.props.contentType === undefined) {
                      const w = Number(rec.props.w) || 0;
                      const h = Number(rec.props.h) || 0;
                      rec.props.contentType = (w <= 220 && h <= 50) ? "inline" : "prose";
                    }
                  }
                  snapshot.store[key] = rec;
                }
              }
              editor.store.loadStoreSnapshot(saved.tldrawSnapshot as any);
            } catch (e) {
              console.warn("Could not restore canvas snapshot, starting fresh:", e);
            }
          }

          // Restore animation regions
          if (Array.isArray(saved.animationRegions)) {
            const regions: AnimationRegionData[] = (saved.animationRegions as any[]).map((r) => ({
              id: r.id,
              shapeIds: r.shapeIds ?? [],
              sequence: r.sequence ?? [],
              isEditMode: false,
              isLooping: r.isLooping ?? false,
            }));
            setAnimationRegions(regions);
          }
        }
      } catch (err) {
        console.error("Failed to load canvas:", err);
      }

      // Always re-enable grid after loading (loadStoreSnapshot can overwrite it)
      editor.updateInstanceState({ isGridMode: true });

      // CRITICAL: only NOW allow saves to fire. Before this point, the
      // tldraw snapshot is empty (just initialized) and would wipe the DB.
      if (!cancelled) {
        // Stamp lastSavedRef with the current snapshot so the first save
        // doesn't immediately fire with the just-loaded data.
        const initialSnapshot = editor.store.getStoreSnapshot();
        const initialPayload = {
          tldrawSnapshot: initialSnapshot,
          animationRegions: animationRegionsRef.current.map((r) => ({
            id: r.id, shapeIds: r.shapeIds, sequence: r.sequence, isLooping: r.isLooping,
          })),
        };
        lastSavedRef.current = JSON.stringify(initialPayload);
        hasLoadedRef.current = true;
      }
    };

    loadCanvas();

    return () => {
      cancelled = true;
    };
  }, [editor, canvasId, userId]);

  // Track tldraw selection changes
  useEffect(() => {
    if (!editor) return;

    const handleChange = () => {
      const ids = editor.getSelectedShapeIds();
      setSelectedShapeIds([...ids]);

      if (ids.length >= 1) {
        // Position the "Animate" button near the selection
        const shapes = ids.map((id) => editor.getShape(id)).filter(Boolean);
        if (shapes.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity;
          for (const shape of shapes) {
            if (!shape) continue;
            const pt = editor.pageToViewport({ x: shape.x, y: shape.y });
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x + 100);
          }
          setSelectionToolbarPos({
            x: Math.max(8, (minX + maxX) / 2 - 40),
            y: Math.max(8, minY - 44),
          });
        }
      }
    };

    // Poll for selection changes (tldraw doesn't expose a clean selection event)
    const interval = setInterval(handleChange, 200);
    return () => clearInterval(interval);
  }, [editor]);

  // Double-click detection via pointerdown timing
  useEffect(() => {
    if (!editor) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (!target.closest(".tl-canvas")) return;

      const now = Date.now();
      const last = lastClickRef.current;

      if (
        last &&
        now - last.time < 400 &&
        Math.abs(e.clientX - last.x) < 10 &&
        Math.abs(e.clientY - last.y) < 10
      ) {
        lastClickRef.current = null;
        const canvasPoint = editor.screenToPage({ x: e.clientX, y: e.clientY });
        const shapesAtPoint = editor.getShapesAtPoint(canvasPoint, { hitInside: true, margin: 8 });

        if (shapesAtPoint.length === 0) {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            editor.setCurrentTool("select");
            editor.selectNone();
          }, 10);

          setInlineCommand({
            canvasPosition: { x: canvasPoint.x, y: canvasPoint.y },
            screenPosition: { x: e.clientX, y: e.clientY },
          });
        }
      } else {
        lastClickRef.current = { time: now, x: e.clientX, y: e.clientY };
      }
    };

    const container = document.querySelector(".tldraw-container");
    if (container) {
      container.addEventListener("pointerdown", handlePointerDown as EventListener, true);
      return () => {
        container.removeEventListener("pointerdown", handlePointerDown as EventListener, true);
      };
    }
  }, [editor]);

  // ─── Drag-and-drop from sidebar shape library ───────────────
  useEffect(() => {
    if (!editor) return;

    const container = document.querySelector(".tldraw-container") as HTMLElement | null;
    if (!container) return;

    const handleDragOver = (e: DragEvent) => {
      const types = e.dataTransfer?.types ?? [];
      if (
        types.includes("application/x-directoor-archetype") ||
        types.includes("application/x-directoor-shape") ||
        types.includes("application/x-directoor-library-image")
      ) {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "copy";
      }
    };

    const handleDrop = async (e: DragEvent) => {
      const archetype = e.dataTransfer?.getData("application/x-directoor-archetype");
      const semanticType = e.dataTransfer?.getData("application/x-directoor-shape");
      const libraryImageId = e.dataTransfer?.getData("application/x-directoor-library-image");
      if (!archetype && !semanticType && !libraryImageId) return;
      e.preventDefault();

      const canvasPoint = editor.screenToPage({ x: e.clientX, y: e.clientY });

      // ── Image library drop ────────────────────────────────────
      if (libraryImageId) {
        const { imageLibrary } = await import("@/lib/image-library");
        const { createShapeId } = await import("tldraw");
        const img = imageLibrary.getSnapshot().find((i) => i.id === libraryImageId);
        if (!img) return;
        const aspect = img.width > 0 && img.height > 0 ? img.width / img.height : 4 / 3;
        const w = Math.min(320, img.width || 320);
        const h = Math.round(w / aspect);
        editor.markHistoryStoppingPoint("Drop library image");
        const tlId = createShapeId();
        editor.createShape({
          id: tlId,
          type: "directoor-image",
          x: canvasPoint.x - w / 2,
          y: canvasPoint.y - h / 2,
          props: {
            w, h,
            src: img.url,
            alt: img.title,
            caption: "",
            sourceUrl: img.source ?? "",
            naturalAspect: aspect,
          },
        });
        editor.select(tlId);
        return;
      }

      const lib = await import("../sidebar/ShapeLibrary");

      if (archetype) {
        // New archetype-based drag: the sidebar sends one of the 9 iconShapes
        // Defaults come from the static ARCHETYPE list; look them up by dropping through createArchetypeShape
        // We keep a small inline table to avoid exporting ARCHETYPES
        const defaults: Record<string, { w: number; h: number; stroke: string; fill: string; name: string }> = {
          cylinder:  { w: 140, h: 80,  stroke: "#3B82F6", fill: "#EFF6FF", name: "Cylinder" },
          hexagon:   { w: 130, h: 110, stroke: "#16A34A", fill: "#F0FDF4", name: "Hexagon" },
          actor:     { w: 100, h: 110, stroke: "#E11D48", fill: "#FFF1F2", name: "User" },
          cloud:     { w: 150, h: 85,  stroke: "#94A3B8", fill: "#F8FAFC", name: "Cloud" },
          document:  { w: 110, h: 130, stroke: "#475569", fill: "#F1F5F9", name: "Document" },
          stack:     { w: 130, h: 100, stroke: "#D97706", fill: "#FEF3C7", name: "Stack" },
          rectangle: { w: 140, h: 80,  stroke: "#334155", fill: "#FFFFFF", name: "Rectangle" },
          circle:    { w: 100, h: 100, stroke: "#0EA5E9", fill: "#F0F9FF", name: "Circle" },
          diamond:   { w: 110, h: 100, stroke: "#D97706", fill: "#FEF3C7", name: "Decision" },
          pill:      { w: 130, h: 50,  stroke: "#7C3AED", fill: "#F5F3FF", name: "Endpoint" },
          layer:     { w: 90,  h: 160, stroke: "#1D4ED8", fill: "#EFF6FF", name: "Layer" },
          arrow:     { w: 200, h: 0,   stroke: "#334155", fill: "#FFFFFF", name: "Arrow" },
          line:      { w: 200, h: 0,   stroke: "#334155", fill: "#FFFFFF", name: "Line" },
          text:      { w: 400, h: 120, stroke: "#0F172A", fill: "transparent", name: "Text" },
        };
        const d = defaults[archetype];
        if (!d) return;
        lib.createArchetypeShape(editor, {
          iconShape: archetype as never,
          displayName: d.name,
          exampleUses: [],
          defaultWidth: d.w,
          defaultHeight: d.h,
          defaultStroke: d.stroke,
          defaultFill: d.fill,
        }, {
          x: canvasPoint.x - d.w / 2,
          y: canvasPoint.y - d.h / 2,
        });
      } else if (semanticType) {
        // Legacy semantic-type drag (kept for back-compat)
        const { OBJECT_LIBRARY } = await import("@directoor/core");
        const def = OBJECT_LIBRARY[semanticType];
        if (!def) return;
        lib.createShapeFromDefinition(editor, def, {
          x: canvasPoint.x - def.defaultSize.width / 2,
          y: canvasPoint.y - def.defaultSize.height / 2,
        });
      }
    };

    container.addEventListener("dragover", handleDragOver);
    container.addEventListener("drop", handleDrop);
    return () => {
      container.removeEventListener("dragover", handleDragOver);
      container.removeEventListener("drop", handleDrop);
    };
  }, [editor]);

  // Create a new animation region from current selection
  const createAnimationRegion = useCallback(() => {
    if (!editor || selectedShapeIds.length === 0) return;

    // Check if these shapes are already in a region
    const alreadyAnimated = animationRegions.some((r) =>
      r.shapeIds.some((id) => selectedShapeIds.includes(id)),
    );

    if (alreadyAnimated) {
      // Toggle existing region's edit mode
      setAnimationRegions((prev) =>
        prev.map((r) => {
          const hasOverlap = r.shapeIds.some((id) => selectedShapeIds.includes(id));
          if (hasOverlap) return { ...r, isEditMode: !r.isEditMode };
          return r;
        }),
      );
      return;
    }

    // Auto-include arrows/connections that involve any of the selected shapes.
    const allShapeIds = new Set<TLShapeId>(selectedShapeIds);
    const selectedIdSet = new Set(selectedShapeIds as string[]);

    // (1) tldraw native-arrow bindings (back-compat with any legacy arrows)
    for (const shapeId of selectedShapeIds) {
      const bindings = editor.getBindingsInvolvingShape(shapeId, "arrow");
      for (const binding of bindings) {
        allShapeIds.add(binding.fromId);
      }
    }

    // (2) directoor-arrow shapes whose fromShapeId/toShapeId point at a
    // selected shape — our custom arrows don't use tldraw bindings.
    const allPageShapes = editor.getCurrentPageShapes();
    for (const shape of allPageShapes) {
      if (shape.type !== "directoor-arrow") continue;
      const props = shape.props as { fromShapeId?: string; toShapeId?: string };
      const fromHit = props.fromShapeId && selectedIdSet.has(props.fromShapeId);
      const toHit = props.toShapeId && selectedIdSet.has(props.toShapeId);
      if (fromHit || toHit) {
        allShapeIds.add(shape.id);
      }
    }

    const newRegion: AnimationRegionData = {
      id: crypto.randomUUID().slice(0, 8),
      shapeIds: [...allShapeIds],
      sequence: [],
      isEditMode: true, // Start in edit mode to show numbers
      isLooping: false,
    };

    setAnimationRegions((prev) => [...prev, newRegion]);
    editor.selectNone();
  }, [editor, selectedShapeIds, animationRegions]);

  // Handle animate command from the command bar
  const handleAnimateCommand = useCallback(
    (sequence: number[]) => {
      // Apply sequence to the region currently in edit mode
      setAnimationRegions((prev) => {
        const editingIndex = prev.findIndex((r) => r.isEditMode);
        if (editingIndex === -1) return prev;

        const updated = [...prev];
        updated[editingIndex] = {
          ...updated[editingIndex]!,
          sequence,
          isEditMode: false, // Auto-toggle OFF after setting sequence
        };
        return updated;
      });
    },
    [],
  );

  const updateRegion = useCallback((updated: AnimationRegionData) => {
    setAnimationRegions((prev) =>
      prev.map((r) => (r.id === updated.id ? updated : r)),
    );
  }, []);

  const deleteRegion = useCallback((regionId: string) => {
    setAnimationRegions((prev) => prev.filter((r) => r.id !== regionId));
  }, []);

  // Check if any region is in edit mode (to show hint in command bar)
  const hasEditingRegion = animationRegions.some((r) => r.isEditMode);

  return (
    <div className="tldraw-container">
      <Tldraw
        onMount={handleMount}
        components={hiddenComponents}
        shapeUtils={DIRECTOOR_SHAPE_UTILS}
      />

      {/* Top-right floating toolbar — export + share */}
      <CanvasToolbar
        editor={editor}
        canvasId={canvasId ?? null}
        watermark={tier !== "pro"}
        onShare={() => setShareOpen(true)}
        hasAnimation={animationRegions.length > 0}
        onExportAnimation={() => setExportAnimationOpen(true)}
      />

      {/* "Animate" button when shapes are selected (only if not already in a region) */}
      {selectedShapeIds.length >= 1 && editor && (
        <div
          className="fixed z-[9999]"
          style={{ left: selectionToolbarPos.x, top: selectionToolbarPos.y }}
        >
          <button
            onClick={createAnimationRegion}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-lg ring-1 ring-slate-200 transition-colors hover:bg-blue-50 hover:text-blue-600 hover:ring-blue-300"
          >
            <Sparkles size={13} />
            Animate
          </button>
        </div>
      )}

      {/* Animation regions */}
      {animationRegions.map((region) => (
        <AnimationRegion
          key={region.id}
          editor={editor!}
          region={region}
          onUpdate={updateRegion}
          onDelete={deleteRegion}
        />
      ))}

      {/* Inline command (appears on double-click) */}
      {inlineCommand && editor && (
        <InlineCommand
          editor={editor}
          store={store}
          canvasId={canvasId ?? null}
          canvasPosition={inlineCommand.canvasPosition}
          screenPosition={inlineCommand.screenPosition}
          onClose={() => setInlineCommand(null)}
        />
      )}

      {/* Global command bar (Cmd+K) */}
      <CommandBar
        editor={editor}
        store={store}
        canvasId={canvasId ?? null}
        onAnimateCommand={handleAnimateCommand}
        animateHint={hasEditingRegion ? "Type: animate 1,2,3,4" : undefined}
      />

      {/* Share dialog */}
      {shareOpen && canvasId && (
        <ShareDialog
          canvasId={canvasId}
          onClose={() => setShareOpen(false)}
        />
      )}

      {/* Animation export dialog */}
      {exportAnimationOpen && editor && (
        <AnimationExportDialog
          editor={editor}
          regions={animationRegions}
          onClose={() => setExportAnimationOpen(false)}
        />
      )}
    </div>
  );
}
