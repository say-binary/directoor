"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Shapes, X as CloseIcon } from "lucide-react";
import type { Editor } from "tldraw";
import {
  ARCHETYPES,
  ArchetypeIcon,
  createArchetypeShape,
  type Archetype,
} from "@/components/sidebar/ShapeLibrary";

/**
 * DirectoorShapePicker — floating "+Shape" button anchored next to
 * tldraw's bottom toolbar. Clicking opens a popup that mirrors the
 * tldraw geo popup in style (same dimensions, same grid, same icon
 * treatment). The popup contains every entry from ARCHETYPES, so
 * extending the catalog automatically extends this UI with zero
 * additional code — that's the "keep the geo property extensible"
 * requirement.
 *
 * Drop interaction (single-click drop, per user preference):
 *   1. User opens the popup, clicks an archetype.
 *   2. The picker enters "arm" state: the cursor becomes a crosshair on
 *      the canvas; a small floating pill at the cursor confirms which
 *      shape is armed.
 *   3. User clicks anywhere on the canvas. One shape is created at that
 *      location with the archetype's default size + colors, then the
 *      picker auto-disarms.
 *   4. Escape key also disarms.
 *
 * This replaces the Sidebar "Shapes" tab as the primary creation path
 * while keeping sidebar drag-and-drop + LLM + Cmd-K flows fully intact.
 */

interface DirectoorShapePickerProps {
  editor: Editor | null;
}

export function DirectoorShapePicker({ editor }: DirectoorShapePickerProps) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState<Archetype | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  // ─── Position against tldraw's bottom toolbar ───────────────────────
  // The toolbar pill sits at the bottom-center of the tl-container. We
  // anchor our button to its RIGHT EDGE so it reads as "one extra slot"
  // on the same strip. Re-measured on resize / scroll so it follows.
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => {
    const update = () => {
      const toolbar = document.querySelector(".tlui-toolbar__inner");
      if (!toolbar) return;
      const rect = toolbar.getBoundingClientRect();
      setPos({
        left: rect.right + 8,
        bottom: window.innerHeight - rect.bottom,
      });
    };
    update();
    const id = setInterval(update, 300);
    window.addEventListener("resize", update);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", update);
    };
  }, []);

  // ─── Drop-on-next-click when armed ──────────────────────────────────
  useEffect(() => {
    if (!armed || !editor) return;

    const container = document.querySelector(".tldraw-container");
    if (!container) return;

    const handlePointerDown = (e: Event) => {
      const pe = e as PointerEvent;
      if (pe.button !== 0) return;
      const target = pe.target as HTMLElement;
      // Only consume clicks on the canvas surface — not on the toolbar,
      // menus, style panel, or our own popup / armed-state pill.
      if (!target.closest(".tl-canvas")) return;
      if (target.closest(".directoor-shape-picker-popup")) return;
      if (target.closest(".directoor-shape-picker-armed-pill")) return;

      pe.preventDefault();
      pe.stopPropagation();

      const pagePoint = editor.screenToPage({ x: pe.clientX, y: pe.clientY });
      const halfW = armed.defaultWidth / 2;
      const halfH = Math.max(0, armed.defaultHeight) / 2;

      editor.markHistoryStoppingPoint(`Create ${armed.displayName}`);
      createArchetypeShape(editor, armed, {
        x: pagePoint.x - halfW,
        y: pagePoint.y - halfH,
      });

      setArmed(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setArmed(null);
      }
    };

    // Capture phase so we beat tldraw's own pointerdown on the canvas.
    container.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [armed, editor]);

  // ─── Armed state: change the body cursor so users see "place mode" ──
  useEffect(() => {
    if (!armed) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = "crosshair";
    return () => { document.body.style.cursor = prev; };
  }, [armed]);

  // ─── Close popup on outside click ──────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".directoor-shape-picker-popup")) return;
      if (target.closest(".directoor-shape-picker-button")) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const pickArchetype = useCallback((a: Archetype) => {
    setOpen(false);
    setArmed(a);
  }, []);

  const disarm = useCallback(() => setArmed(null), []);

  if (!pos) return null;

  return (
    <>
      {/* Floating trigger button */}
      <button
        ref={anchorRef}
        onClick={() => setOpen((v) => !v)}
        className="directoor-shape-picker-button"
        title="Directoor shapes"
        style={{
          position: "fixed",
          left: pos.left,
          bottom: pos.bottom,
          zIndex: 9994,
          width: 40,
          height: 40,
          borderRadius: 10,
          background: open ? "#3B82F6" : "white",
          color: open ? "white" : "#334155",
          border: "1px solid #E2E8F0",
          boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "background 120ms, color 120ms",
        }}
      >
        <Shapes size={18} />
      </button>

      {/* Popup (portal so it can layer above tldraw chrome) */}
      {open &&
        createPortal(
          <div
            className="directoor-shape-picker-popup"
            style={{
              position: "fixed",
              left: pos.left,
              bottom: pos.bottom + 50,
              zIndex: 9995,
              background: "white",
              borderRadius: 12,
              boxShadow: "0 8px 32px rgba(15,23,42,0.16), 0 2px 8px rgba(15,23,42,0.06)",
              padding: 8,
              display: "grid",
              gridTemplateColumns: "repeat(4, 52px)",
              gap: 4,
            }}
          >
            {ARCHETYPES.map((a) => (
              <button
                key={a.iconShape}
                onClick={() => pickArchetype(a)}
                title={`${a.displayName}${a.exampleUses.length > 0 ? ` · ${a.exampleUses.slice(0, 3).join(", ")}` : ""}`}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 8,
                  background: "transparent",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "background 120ms",
                  padding: 4,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#F1F5F9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <ArchetypeIcon archetype={a} />
              </button>
            ))}
          </div>,
          document.body,
        )}

      {/* Armed-state pill — floats over the page and tells the user
          they're in "click-to-drop" mode. Click the × to cancel. */}
      {armed &&
        createPortal(
          <div
            className="directoor-shape-picker-armed-pill"
            style={{
              position: "fixed",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 9996,
              background: "#1e293b",
              color: "white",
              borderRadius: 999,
              padding: "6px 10px 6px 12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              fontWeight: 500,
              boxShadow: "0 4px 16px rgba(15,23,42,0.25)",
              pointerEvents: "all",
            }}
          >
            <span>Click canvas to place <b>{armed.displayName}</b></span>
            <button
              onClick={disarm}
              title="Cancel (Esc)"
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.15)",
                color: "white",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <CloseIcon size={11} />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
