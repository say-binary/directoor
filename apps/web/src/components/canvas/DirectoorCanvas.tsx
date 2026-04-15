"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { Tldraw, Editor, TLShapeId, TLComponents } from "tldraw";

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
  /** Called when save function is ready — parent uses this to save before switching */
  onSaveReady?: (saveFn: () => Promise<void>) => void;
}

export function DirectoorCanvas({ canvasId, userId, onSaveReady }: DirectoorCanvasProps) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [store] = useState(() => createCanvasStore(canvasId ?? undefined, userId));

  // Inline command state
  const [inlineCommand, setInlineCommand] = useState<{
    canvasPosition: { x: number; y: number };
    screenPosition: { x: number; y: number };
  } | null>(null);

  // Animation regions
  const [animationRegions, setAnimationRegions] = useState<AnimationRegionData[]>([]);

  // Selection state for showing "Animate this" button
  const [selectedShapeIds, setSelectedShapeIds] = useState<TLShapeId[]>([]);
  const [selectionToolbarPos, setSelectionToolbarPos] = useState({ x: 0, y: 0 });

  // Double-click detection
  const lastClickRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const handleMount = useCallback((editorInstance: Editor) => {
    setEditor(editorInstance);
    editorInstance.updateInstanceState({ isGridMode: true });
  }, []);

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
      const objectCount = allShapes.filter((s) => s.type !== "arrow").length;
      const connectionCount = allShapes.filter((s) => s.type === "arrow").length;

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
      const objectCount = allShapes.filter((s) => s.type !== "arrow").length;
      const connectionCount = allShapes.filter((s) => s.type === "arrow").length;

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

          // Restore tldraw snapshot
          if (saved.tldrawSnapshot) {
            try {
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
    // Check every selected shape for arrows bound to/from it.
    const allShapeIds = new Set(selectedShapeIds);

    for (const shapeId of selectedShapeIds) {
      const bindings = editor.getBindingsInvolvingShape(shapeId, "arrow");
      for (const binding of bindings) {
        // binding.fromId is the arrow shape, binding.toId is the target shape
        allShapeIds.add(binding.fromId); // the arrow itself
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
      <Tldraw onMount={handleMount} components={hiddenComponents} />

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
          canvasPosition={inlineCommand.canvasPosition}
          screenPosition={inlineCommand.screenPosition}
          onClose={() => setInlineCommand(null)}
        />
      )}

      {/* Global command bar (Cmd+K) */}
      <CommandBar
        editor={editor}
        store={store}
        onAnimateCommand={handleAnimateCommand}
        animateHint={hasEditingRegion ? "Type: animate 1,2,3,4" : undefined}
      />
    </div>
  );
}
