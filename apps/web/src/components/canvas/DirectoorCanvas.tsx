"use client";

import { useCallback, useState, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  Tldraw, Editor, TLShapeId, TLComponents, TLCameraOptions, TLShape,
  atom, useValue, useEditor, DefaultStylePanel,
} from "tldraw";
import { DIRECTOOR_SHAPE_UTILS, normalizeDirectoorShapeStyles, TL_COLOR_HEX, hexToTldrawColor } from "./shapes/DirectoorShapes";
import type { TLDefaultColorStyle } from "tldraw";
import {
  DefaultDashStyle,
  DefaultSizeStyle,
  DefaultFontStyle,
  createShapeId,
} from "tldraw";
import { X as CloseIcon, Sliders, Play as PlayIcon } from "lucide-react";

// ─── Document page configuration ─────────────────────────────────────────────
// Directoor canvases behave like a single Word/Notion-style page:
//
//   * Fixed initial width (1200px). The page IS the canvas — there is no
//     visible space outside it; the camera is hard-clamped at the edges.
//   * Hard top edge at y=0. User cannot pan/scroll above the start.
//   * Vertically infinite downward (PAGE_HEIGHT is effectively a soft cap).
//   * Right edge is user-draggable to widen the page (rightward only).
//   * Per-canvas widened width is persisted in the canvas_state JSONB.
// Default page is 1224px wide (≈150% of the previous 816px US-Letter
// width). Wider default gives diagrams more breathing room without
// forcing the user to drag the right edge on every new canvas. User
// can still widen further via the right-edge handle, or the page
// auto-grows on load to fit existing content.
const INITIAL_PAGE_WIDTH = 1224;
const MAX_PAGE_WIDTH = 10000;        // safety cap
const PAGE_HEIGHT = 100000;          // effectively infinite

/**
 * Reactive atom for the current page width. Module-scoped because tldraw
 * components rendered via the `components` slot don't share React Context
 * with our DirectoorCanvas (they live deep in tldraw's own render tree).
 * The atom is reset to the saved value (or default) every time a new
 * canvas loads. Single tab = single canvas at a time, so a module-level
 * atom is safe.
 */
const pageWidthAtom = atom<number>("directoor.pageWidth", INITIAL_PAGE_WIDTH);

/**
 * Build camera options from a given page width. The camera is hard-clamped:
 *  - x: 'contain' — at fit-x zoom (the only zoom-out level allowed by
 *    zoomSteps starting at 1), the camera is fixed at the page origin.
 *    Above fit zoom (zoomed in), horizontal pan is bounded inside the page.
 *  - y: 'inside' — vertical pan is bounded to [0, PAGE_HEIGHT - viewport_h]
 *    at every zoom. User cannot scroll above the top of the page.
 *  - padding: 0 — the page IS the viewport at fit zoom; no slate margin.
 */
function makeCameraOptions(pageWidth: number): TLCameraOptions {
  return {
    isLocked: false,
    wheelBehavior: "pan",
    panSpeed: 1,
    zoomSpeed: 1,
    // Discrete zoom levels: 50%..300%. Default is 100% (1:1 screen pixels
    // per canvas unit) — the page renders at its actual Word-doc size
    // and the surrounding grey desk is always visible on both sides on
    // any reasonably-wide viewport.
    zoomSteps: [0.5, 0.75, 1, 1.25, 1.5, 2, 3],
    constraints: {
      initialZoom: "default", // 1:1 (not fit-x) — see zoomSteps comment
      baseZoom: "default",
      bounds: { x: 0, y: 0, w: pageWidth, h: PAGE_HEIGHT },
      padding: { x: 40, y: 0 },
      origin: { x: 0.5, y: 0 },
      behavior: { x: "contain", y: "inside" },
    },
  };
}

/**
 * Compute the right-most edge of any shape currently on the page. Used to
 * prevent the user from shrinking the page narrower than its content.
 */
function rightMostShapeEdge(editor: Editor): number {
  const shapes = editor.getCurrentPageShapes();
  if (shapes.length === 0) return 0;
  let maxRight = 0;
  for (const s of shapes) {
    const w = (s.props as { w?: number }).w ?? 0;
    if (s.x + w > maxRight) maxRight = s.x + w;
  }
  return maxRight;
}

/**
 * PageRightEdgeHandle — vertical strip at the right edge of the page,
 * rendered via tldraw's InFrontOfTheCanvas slot (canvas-coord space, so it
 * sits at exactly `pageWidth` in canvas units and scrolls with the page).
 *
 * Subscribes to pageWidthAtom so it re-renders live as the user drags.
 * Drag updates the atom; the parent DirectoorCanvas listens to the atom
 * and pushes new constraints into the editor + schedules a save.
 *
 * Drag is bidirectional: rightward grows the page, leftward shrinks it.
 * Lower clamp on shrink is `max(INITIAL_PAGE_WIDTH, right-most-shape-edge)`
 * so we never push existing shapes outside the page (data-integrity rule).
 */
// Grab-handle hit area — wider than its visible indicator so users can
// grab it easily. The invisible hit area also satisfies Fitts's law for
// smooth pointer capture.
const EDGE_HIT_WIDTH = 14;

/**
 * PageEdges — renders BOTH page boundaries as matching beautiful strips.
 *
 *  Left edge  (canvas x=0):       decorative only, fixed
 *  Right edge (canvas x=pageWidth): same look + draggable to resize
 *
 * Both render in the InFrontOfTheCanvas slot. That slot is outside the
 * tldraw camera transform, so we manually convert canvas→screen X via
 *     screen_x = (canvas_x - camera.x) * camera.z
 * and re-render whenever the camera changes.
 *
 * Right-edge drag is bidirectional (rightward grows, leftward shrinks).
 * Lower clamp is `max(INITIAL_PAGE_WIDTH, right-most-shape-edge)` so we
 * never push existing shapes off the page.
 */
function PageEdges() {
  const editor = useEditor();
  const pageWidth = useValue("pageWidth", () => pageWidthAtom.get(), []);
  // Subscribe to camera so we re-render on any pan/zoom. We don't use
  // the camera object directly — instead we call editor.pageToScreen()
  // which correctly accounts for the viewport's screen-space offset
  // (which our previous manual formula was missing).
  useValue("camera", () => editor.getCamera(), [editor]);
  const isDraggingRef = useRef(false);

  // Convert canvas X (page's right edge) to viewport-screen X.
  const rightScreenX = editor.pageToScreen({ x: pageWidth, y: 0 }).x;

  const onRightPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;
      const startWidth = pageWidthAtom.get();
      const startScreenX = e.clientX;
      const minWidth = Math.max(
        INITIAL_PAGE_WIDTH,
        Math.ceil(rightMostShapeEdge(editor) + 8),
      );

      // Capture the pointer so we keep getting events even if the cursor
      // momentarily leaves the handle's hit-area while flicking the mouse.
      const targetEl = e.currentTarget;
      try { targetEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }

      // RAF-coalesce pointermove updates: each frame we apply the most
      // recent cursor X exactly once. Avoids dozens of re-renders per
      // frame on high-Hz mice / trackpads, and makes the visual track
      // the cursor without lag or stutter.
      let pendingX: number | null = null;
      let rafId = 0;
      const flush = () => {
        rafId = 0;
        if (pendingX === null) return;
        const dxScreen = pendingX - startScreenX;
        const dxPage = dxScreen / editor.getCamera().z;
        const newWidth = Math.max(
          minWidth,
          Math.min(MAX_PAGE_WIDTH, startWidth + dxPage),
        );
        pageWidthAtom.set(newWidth);
        pendingX = null;
      };

      const onMove = (ev: PointerEvent) => {
        pendingX = ev.clientX;
        if (rafId === 0) rafId = requestAnimationFrame(flush);
      };
      const onUp = () => {
        if (rafId !== 0) {
          cancelAnimationFrame(rafId);
          flush(); // apply final position so we don't end mid-move
        }
        isDraggingRef.current = false;
        try { targetEl.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [editor],
  );

  return (
    // Right-edge grab handle only — the page itself is visually defined by
    // the white-on-grey contrast (PageBackground rendered in OnTheCanvas
    // over the slate-200 tldraw background). No decorative edge lines.
    <div
      onPointerDown={onRightPointerDown}
      onMouseEnter={(e) => {
        (e.currentTarget.firstElementChild as HTMLElement).style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        if (!isDraggingRef.current) {
          (e.currentTarget.firstElementChild as HTMLElement).style.opacity = "0";
        }
      }}
      title="Drag to resize the page"
      style={{
        position: "absolute",
        top: 0,
        left: rightScreenX - EDGE_HIT_WIDTH / 2,
        width: EDGE_HIT_WIDTH,
        height: "100vh",
        cursor: "ew-resize",
        zIndex: 101,
        pointerEvents: "all",
        background: "transparent",
      }}
    >
      {/* Hover indicator: soft blue line that fades in on hover/drag */}
      <div
        style={{
          position: "absolute",
          left: (EDGE_HIT_WIDTH - 3) / 2,
          top: 0,
          width: 3,
          height: "100vh",
          background: "rgba(59, 130, 246, 0.85)",
          borderRadius: 2,
          opacity: 0,
          transition: "opacity 120ms ease",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/**
 * DeskBackground — replaces tldraw's default canvas background. A
 * uniform slate-200 "desk" behind everything. Must set the ENTIRE
 * visible area this color so the page (painted on top via OnTheCanvas)
 * reads clearly as a white sheet on top of the desk.
 */
function DeskBackground() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#E2E8F0", // slate-200
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * PageBackground — the actual page, rendered in canvas coordinates via
 * tldraw's OnTheCanvas slot. A clean white rectangle with a built-in
 * radial-gradient dot grid, soft drop shadow, and rounded corners. The
 * DeskBackground behind it (via the Background slot) provides the
 * surrounding grey. Grid dots therefore appear ONLY on the page.
 */
function PageBackground() {
  const pageWidth = useValue("pageWidth", () => pageWidthAtom.get(), []);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: pageWidth,
        height: PAGE_HEIGHT,
        background: "#FFFFFF",
        // Dot grid baked into the page — shows only on the page, not on the desk.
        backgroundImage: "radial-gradient(circle, #CBD5E1 1px, transparent 1.2px)",
        backgroundSize: "24px 24px",
        boxShadow: "0 2px 16px rgba(15,23,42,0.08)",
        borderRadius: 4,
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * PagePositionPublisher — has no DOM output; its job is to subscribe to
 * the camera + pageWidth and keep the `--ds-page-right-x` CSS variable
 * up to date in screen coords. The floating toolbar and tldraw's
 * StylePanel anchor their right edge to this variable so they always
 * sit inside the page area (not over the grey desk).
 */
function PagePositionPublisher() {
  const editor = useEditor();
  const pageWidth = useValue("pageWidth", () => pageWidthAtom.get(), []);
  const camera = useValue("camera", () => editor.getCamera(), [editor]);
  useEffect(() => {
    const rightX = editor.pageToScreen({ x: pageWidth, y: 0 }).x;
    document.documentElement.style.setProperty("--ds-page-right-x", `${rightX}px`);
  }, [editor, pageWidth, camera]);
  return null;
}

/**
 * PageChrome — bundles the screen-space page pieces (the right grab
 * handle + the CSS-var publisher that floats the toolbar + StylePanel
 * over the page). Both need `useEditor()`, which is only available
 * inside tldraw's render tree, so they mount via InFrontOfTheCanvas.
 */
function PageChrome() {
  return (
    <>
      <PagePositionPublisher />
      <PageEdges />
    </>
  );
}

/**
 * LabelColorPicker — a small color-swatch row that controls `labelColor`
 * on selected Directoor shapes independently of their stroke color.
 * Renders below the DefaultStylePanel (positioned via DOM query on mount).
 *
 * Only appears when at least one selected shape has a `labelColor` prop
 * (i.e. is a Directoor geo shape — not an arrow, image, or text shape).
 */
// Order + grouping matches tldraw's DefaultStylePanel color swatches exactly
// so the "Text color" row feels consistent with the one above it:
//   Row 1: black, grey, light-violet, violet
//   Row 2: blue, light-blue, yellow, orange
//   Row 3: green, light-green, light-red, red
// White is appended last (tldraw lists it separately via a dedicated toggle
// but we inline it so the user can also pick a light/inverted text colour).
const LABEL_COLOR_OPTIONS: TLDefaultColorStyle[] = [
  "black", "grey", "light-violet", "violet",
  "blue", "light-blue", "yellow", "orange",
  "green", "light-green", "light-red", "red",
  "white",
];

/**
 * AnimateToggle — small pill that toggles `animated: boolean` on the
 * currently selected shape(s). Only renders when the selected shape
 * supports the animation prop (i.e. has it in its props) — currently
 * directoor-arrow (flowing dashes) and directoor-gear (rotation) are
 * the two visually animated types, but any Directoor styled shape
 * carries the prop for future use. Not shown for native tldraw shapes.
 */
function AnimateToggle() {
  const editor = useEditor();

  const state = useValue<{ on: boolean; mixed: boolean } | null>(
    "animatedState",
    () => {
      const ids = editor.getSelectedShapeIds();
      let some: boolean | null = null;
      let mixed = false;
      let any = false;
      for (const id of ids) {
        const shape = editor.getShape(id);
        const props = shape?.props as { animated?: boolean } | undefined;
        if (!props || typeof props.animated !== "boolean") continue;
        any = true;
        if (some === null) some = props.animated;
        else if (some !== props.animated) mixed = true;
      }
      if (!any) return null;
      return { on: some ?? false, mixed };
    },
    [editor],
  );

  // Anchor position — same column as the tldraw style panel, just
  // below the text-color picker when it's visible, otherwise below
  // the style panel itself.
  const [top, setTop] = useState(360);
  useEffect(() => {
    const update = () => {
      const labelPanel = document.querySelector(".directoor-label-color-panel") as HTMLElement | null;
      const stylePanel = document.querySelector(".tlui-style-panel") as HTMLElement | null;
      const ref = labelPanel ?? stylePanel;
      if (ref) setTop(ref.getBoundingClientRect().bottom + 6);
    };
    update();
    const id = setInterval(update, 300);
    return () => clearInterval(id);
  }, []);

  if (!state) return null;

  const toggle = () => {
    const next = state.mixed ? true : !state.on;
    const ids = editor.getSelectedShapeIds();
    editor.run(() => {
      for (const id of ids) {
        const shape = editor.getShape(id);
        const props = shape?.props as { animated?: boolean } | undefined;
        if (!props || typeof props.animated !== "boolean") continue;
        editor.updateShape({ id, type: shape!.type, props: { ...props, animated: next } });
      }
    });
  };

  return (
    <div
      className="directoor-animate-toggle"
      style={{
        position: "fixed",
        top,
        right: "calc(100vw - var(--ds-page-right-x, 100vw) + 16px)",
        zIndex: 9993,
        background: "white",
        borderRadius: 8,
        boxShadow: "0 2px 12px rgba(15,23,42,0.12)",
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        width: 156,
        pointerEvents: "all",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        Animate
      </div>
      <button
        type="button"
        onClick={toggle}
        title="Toggle animation (flowing arrows / spinning gears)"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          padding: "5px 8px",
          borderRadius: 6,
          border: "1px solid #E2E8F0",
          background: state.on ? "#EFF6FF" : "white",
          color: state.on ? "#1D4ED8" : "#475569",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <PlayIcon size={11} />
          {state.mixed ? "Mixed" : state.on ? "On" : "Off"}
        </span>
        <span
          aria-hidden
          style={{
            width: 22,
            height: 12,
            borderRadius: 999,
            background: state.on ? "#3B82F6" : "#CBD5E1",
            position: "relative",
            transition: "background 120ms",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 1,
              left: state.on ? 11 : 1,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "white",
              transition: "left 120ms",
            }}
          />
        </span>
      </button>
    </div>
  );
}

function LabelColorPicker() {
  const editor = useEditor();

  // Issue G: only show the text-color picker when the user is ACTIVELY
  // editing text inside a Directoor shape (i.e. double-clicked into
  // text-edit mode). Before, the picker appeared whenever a styled
  // shape was merely selected, which was distracting and didn't match
  // the intent of "text color" (you change it while editing text, not
  // while just selecting the container).
  const labelColor = useValue<TLDefaultColorStyle | null>(
    "labelColor",
    () => {
      const editingId = editor.getEditingShapeId();
      if (!editingId) return null;
      const shape = editor.getShape(editingId);
      const props = shape?.props as { labelColor?: TLDefaultColorStyle } | undefined;
      if (!props || props.labelColor === undefined) return null;
      return props.labelColor;
    },
    [editor],
  );

  // Issue F: the "Text color" panel must match the DefaultStylePanel's
  // width exactly so the two don't look mis-aligned. We poll its
  // bounding rect and mirror top + width.
  const [top, setTop] = useState(340);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const panel = document.querySelector(".tlui-style-panel");
      if (panel) {
        const rect = panel.getBoundingClientRect();
        setTop(rect.bottom + 6);
        setWidth(rect.width);
      }
    };
    update();
    const id = setInterval(update, 300);
    return () => clearInterval(id);
  }, []);

  if (labelColor === null) return null;

  const setColor = (c: TLDefaultColorStyle) => {
    // The picker is only shown during text edit mode, so we update the
    // single shape that's currently being edited.
    const editingId = editor.getEditingShapeId();
    if (!editingId) return;
    const shape = editor.getShape(editingId);
    const props = shape?.props as { labelColor?: TLDefaultColorStyle } | undefined;
    if (!props || props.labelColor === undefined) return;
    editor.updateShape({ id: editingId, type: shape!.type, props: { ...props, labelColor: c } });
  };

  return (
    <div
      className="directoor-label-color-panel"
      style={{
        position: "fixed",
        top,
        right: `calc(100vw - var(--ds-page-right-x, 100vw) + 16px)`,
        zIndex: 9993,
        background: "white",
        borderRadius: 8,
        boxShadow: "0 2px 12px rgba(15,23,42,0.12)",
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        // Width mirrors the tldraw DefaultStylePanel so the two stack
        // visually as a single column. Fallback 156px covers first
        // paint before the poll has measured the panel.
        width: width ?? 156,
        // CRITICAL: tldraw's StylePanel slot container has pointer-events:none
        // so clicks on the surrounding grey area pass through to the canvas.
        // We need to re-enable pointer events on this panel so its buttons
        // actually receive clicks.
        pointerEvents: "all",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        Text color
      </div>
      {/* 4-column grid matches the tldraw DefaultStylePanel color picker
          above (black, grey, light-violet, violet / blue, light-blue, …).
          The 13th option (white) wraps onto a row of its own. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          justifyItems: "center",
        }}
      >
        {LABEL_COLOR_OPTIONS.map((c) => {
          const isActive = labelColor === c;
          return (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => setColor(c)}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: TL_COLOR_HEX[c] ?? "#0F172A",
                border: isActive
                  ? "2px solid #3b82f6"
                  : c === "white"
                    ? "1px solid #CBD5E1"
                    : "1px solid rgba(0,0,0,0.08)",
                cursor: "pointer",
                outline: "none",
                flexShrink: 0,
                boxSizing: "border-box",
                padding: 0,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * ConditionalStylePanel — renders tldraw's DefaultStylePanel only when
 * at least one shape is selected, and only if the user hasn't chosen
 * to collapse it (Issue D). Because our Directoor shapes declare their
 * style props using tldraw's standard enums, the same DefaultStylePanel
 * works for native + custom shapes with no extra wiring.
 *
 * Collapse UX (Issue D): when the user clicks the × on the panel, the
 * full style panel is hidden and a small "Styles" re-open pill appears
 * in its place, so shapes that were sitting underneath the panel become
 * directly clickable again. The collapsed state resets on each new
 * selection so the panel re-appears for the next shape.
 */
function ConditionalStylePanel() {
  const editor = useEditor();
  const selectionIds = useValue(
    "selectionIds",
    () => editor.getSelectedShapeIds().join(","),
    [editor],
  );
  const hasSelection = selectionIds.length > 0;
  const [collapsed, setCollapsed] = useState(false);
  // Reset collapsed whenever selection changes so the user sees styles
  // for each new thing they select without needing to re-expand.
  useEffect(() => {
    setCollapsed(false);
  }, [selectionIds]);

  if (!hasSelection) return null;

  return (
    <>
      {!collapsed && <DefaultStylePanel />}
      {!collapsed && (
        <button
          onClick={() => setCollapsed(true)}
          title="Hide styles"
          aria-label="Hide style panel"
          style={{
            position: "fixed",
            top: 62,
            right: "calc(100vw - var(--ds-page-right-x, 100vw) + 4px)",
            zIndex: 9995,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "white",
            border: "1px solid #E2E8F0",
            boxShadow: "0 2px 4px rgba(15,23,42,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            pointerEvents: "all",
            padding: 0,
          }}
        >
          <CloseIcon size={12} color="#64748B" />
        </button>
      )}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          title="Show styles"
          style={{
            position: "fixed",
            top: 72,
            right: "calc(100vw - var(--ds-page-right-x, 100vw) + 16px)",
            zIndex: 9994,
            padding: "6px 10px",
            borderRadius: 8,
            background: "white",
            border: "1px solid #E2E8F0",
            boxShadow: "0 2px 4px rgba(15,23,42,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 500,
            color: "#475569",
            cursor: "pointer",
            pointerEvents: "all",
          }}
        >
          <Sliders size={12} />
          Styles
        </button>
      )}
      <LabelColorPicker />
      <AnimateToggle />
    </>
  );
}

// Hide tldraw UI elements we don't need; mount the chrome.
// Removed:
//   - MenuPanel (top-left hamburger) — duplicates Sidebar + shortcuts
//   - QuickActions (top-left undo/redo/trash/copy) — covered by Cmd+Z,
//     Cmd+Shift+Z, Backspace, Cmd+D keyboard shortcuts
// Kept (user explicitly asked): NavigationPanel (minimap + zoom).
const tlComponents: TLComponents = {
  PageMenu: null,
  MenuPanel: null,                     // top-left hamburger (redundant)
  QuickActions: null,                  // top-left undo/redo/trash/copy
  Background: DeskBackground,          // uniform slate-200 desk
  OnTheCanvas: PageBackground,         // page on top — white + dot grid
  InFrontOfTheCanvas: PageChrome,      // grab handle + position publisher
  StylePanel: ConditionalStylePanel,   // hidden unless shape selected
};

/**
 * Walk all shapes on the current page, find their right-most edge, and
 * return the page width needed to comfortably contain them (with 80px of
 * right padding). Returns 0 if there are no shapes.
 *
 * Used during canvas load: legacy / pre-page canvases may have content
 * extending past the initial page width. Rather than compress the layout,
 * we grow the page so all content is reachable.
 */
function neededWidthForExistingShapes(editor: Editor): number {
  const shapes = editor.getCurrentPageShapes();
  if (shapes.length === 0) return 0;
  let maxRight = 0;
  for (const s of shapes) {
    const w = (s.props as { w?: number }).w ?? 0;
    if (s.x + w > maxRight) maxRight = s.x + w;
  }
  return Math.ceil(maxRight + 80);
}
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
import { DirectoorShapePicker } from "./DirectoorShapePicker";

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
  // Only the active region responds to ArrowRight key presses — prevents all
  // regions from advancing simultaneously (Issue 4 fix).
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportAnimationOpen, setExportAnimationOpen] = useState(false);
  // When the export dialog opens via a per-region shortcut, preselect
  // that region in the dialog's dropdown. Null = use the default (first
  // region), which is how the top-toolbar global Export button behaves.
  const [exportPreselectRegionId, setExportPreselectRegionId] = useState<string | null>(null);

  // Selection state for showing "Animate this" button
  const [selectedShapeIds, setSelectedShapeIds] = useState<TLShapeId[]>([]);
  const [selectionToolbarPos, setSelectionToolbarPos] = useState({ x: 0, y: 0 });

  // Double-click detection
  const lastClickRef = useRef<{ time: number; x: number; y: number } | null>(null);

  // Reactive subscription to the page-width atom. Re-renders this component
  // whenever the user drags the right edge handle.
  const pageWidth = useValue("pageWidth", () => pageWidthAtom.get(), []);
  // Stable ref for use inside tldraw side-effect handlers (which can't
  // capture React state cleanly across re-renders).
  const pageWidthRef = useRef(pageWidth);
  pageWidthRef.current = pageWidth;

  const handleMount = useCallback((editorInstance: Editor) => {
    setEditor(editorInstance);
    // Grid is NOT enabled — the page (PageBackground) paints its own dot
    // grid so grid dots only appear on the page, not on the surrounding
    // grey desk. Snap-to-grid still works at tldraw's default behavior.
    editorInstance.updateInstanceState({ isGridMode: false });
    // Apply page constraints immediately. Initial value is the atom's
    // current value, which loadCanvas overrides with the saved width
    // shortly after.
    editorInstance.setCameraOptions(makeCameraOptions(pageWidthAtom.get()));
    // Land the user at the top of the page.
    editorInstance.setCamera(
      { x: 0, y: 0, z: editorInstance.getCamera().z },
      { immediate: true },
    );
    onEditorReady?.(editorInstance);
  }, [onEditorReady]);

  // ─── House default styles for newly created shapes ───────────────
  // Directoor's house style: solid / s / sans. Applied here (AFTER
  // handleMount AND any loadCanvas restore) because calling it only
  // inside handleMount was getting overwritten by tldraw's own
  // per-user persisted preferences when the editor hydrated. This
  // effect runs every render-triggering dependency change and is
  // cheap (three setters). Final say on defaults belongs to us.
  useEffect(() => {
    if (!editor) return;
    const apply = () => {
      editor.setStyleForNextShapes(DefaultDashStyle, "solid");
      editor.setStyleForNextShapes(DefaultSizeStyle, "s");
      editor.setStyleForNextShapes(DefaultFontStyle, "sans");
    };
    apply();
    // Re-apply a short moment later in case tldraw's async user-
    // preference hydration runs after this tick and clobbers us.
    const id = setTimeout(apply, 250);
    return () => clearTimeout(id);
  }, [editor, canvasId]);

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

  // CRITICAL: set while editor.store.loadStoreSnapshot() is running so the
  // clamp side-effect handlers don't move shapes during restore.
  //
  // Why this matters (Issue 2 root cause): the saved pageWidth is applied
  // AFTER loadStoreSnapshot fires its beforeCreate handlers. So every
  // snapshot load ran the clamp against INITIAL_PAGE_WIDTH (816), which
  // for wide canvases repositioned any shape with x+w > 816 back inside
  // the initial page. The next debounced save then persisted the clamped
  // positions — data loss on every refresh.
  const isLoadingSnapshotRef = useRef(false);
  // Reset load flag + page width on canvas switch. The width snaps back
  // to the default until loadCanvas restores the saved value.
  useEffect(() => {
    hasLoadedRef.current = false;
    lastSavedRef.current = "";
    pageWidthAtom.set(INITIAL_PAGE_WIDTH);
  }, [canvasId]);

  // ─── Shape clamping: shapes can never live outside the page ─────────
  // Two-layer defence:
  //  (1) Before-create / before-change side-effect handlers clamp shape
  //      x, y, and (when present) shape width into the page. Reads
  //      pageWidth from a ref so handlers stay stable across page-width
  //      changes (no re-registration churn).
  //  (2) After-change handler as a backstop — if anything (e.g. a tldraw
  //      internal path that bypasses before-handlers, or a React batched
  //      update race) lands a shape outside the page, this catches it
  //      and force-corrects via editor.updateShape.
  useEffect(() => {
    if (!editor) return;

    /** Clamp a shape record so it sits entirely inside [0, pageWidth] x
     *  [0, ∞). If the shape has a `w` prop, also shrink it to fit when
     *  it would otherwise extend past the right edge. Returns the same
     *  reference if no clamp was needed.
     *
     *  Arrows are special: their visual position is stored in the
     *  endpoint props (startX/startY/endX/endY) — shape.x / shape.y is
     *  just an abstract anchor. So for directoor-arrow we clamp the
     *  ENDPOINT props into the page instead of shape.x/y; that way
     *  arrows can't be dragged outside the canvas but their position
     *  also doesn't jump on style changes (previous bug was clamping
     *  shape.x/y which had nothing to do with the visible geometry). */
    const ARROW_TYPES = new Set(["directoor-arrow", "arrow"]);
    const clampShape = (s: TLShape): TLShape => {
      if (s.type === "directoor-arrow") {
        const props = s.props as {
          startX: number; startY: number; endX: number; endY: number;
        };
        const pw = pageWidthRef.current;
        const sX = Math.max(0, Math.min(pw, props.startX));
        const sY = Math.max(0, props.startY);
        const eX = Math.max(0, Math.min(pw, props.endX));
        const eY = Math.max(0, props.endY);
        if (sX === props.startX && sY === props.startY && eX === props.endX && eY === props.endY) return s;
        return { ...s, props: { ...props, startX: sX, startY: sY, endX: eX, endY: eY } as typeof s.props };
      }
      // tldraw native arrow: leave untouched for now (legacy, rarely used
      // in Directoor canvases — we replaced it with directoor-arrow).
      if (s.type === "arrow") return s;
      const props = s.props as { w?: number };
      const pw = pageWidthRef.current;
      const hasW = typeof props.w === "number" && props.w > 0;
      // First clamp width: never larger than the page itself.
      let nextW = props.w;
      if (hasW && (props.w as number) > pw) nextW = pw;
      const w = (nextW ?? 0);
      const maxX = Math.max(0, pw - w);
      const x = Math.max(0, Math.min(maxX, s.x));
      const y = Math.max(0, s.y);
      const widthChanged = hasW && nextW !== props.w;
      if (x === s.x && y === s.y && !widthChanged) return s;
      return widthChanged
        ? { ...s, x, y, props: { ...props, w: nextW } as typeof s.props }
        : { ...s, x, y };
    };

    // Native tldraw shape types whose style props we want to steer to
    // our house defaults (solid / s / sans) on first creation — but
    // ONLY if the user hasn't overridden tldraw's pristine defaults
    // (draw / m / draw). This way, user-picked style values are
    // respected; only untouched defaults get rewritten.
    const NATIVE_STYLED_TYPES = new Set(["geo", "text", "note", "highlight", "arrow", "line"]);
    const injectHouseDefaults = (s: TLShape): TLShape => {
      if (!NATIVE_STYLED_TYPES.has(s.type)) return s;
      const props = s.props as { dash?: string; size?: string; font?: string };
      const patch: Record<string, string> = {};
      // Only override values that are STILL at tldraw's pristine defaults.
      if (props.dash === "draw") patch.dash = "solid";
      if (props.size === "m") patch.size = "s";
      // `text` shapes use their own size enum and don't have a "font"
      // equivalent to the "draw" sketchy option; still fine to switch.
      if (props.font === "draw") patch.font = "sans";
      if (Object.keys(patch).length === 0) return s;
      return { ...s, props: { ...props, ...patch } };
    };

    // Normalize legacy-hex color/fill/dash into tldraw's enum always
    // (safe during load — it only touches props, not x/y). Position
    // clamping is skipped during snapshot load so saved shape positions
    // are preserved even when they exceed the default page width; the
    // saved pageWidth is applied to the camera after load.
    const normalizeAndMaybeClamp = (s: TLShape): TLShape => {
      const normalized = normalizeDirectoorShapeStyles(s) as TLShape;
      if (isLoadingSnapshotRef.current) return normalized;
      return clampShape(normalized);
    };

    // beforeCreate — normalize + clamp + inject house defaults.
    // Default injection ONLY happens here (on first creation), never
    // on subsequent changes, so user-picked style values stay sticky.
    const u1 = editor.sideEffects.registerBeforeCreateHandler("shape", (s) => {
      const base = normalizeAndMaybeClamp(s);
      if (isLoadingSnapshotRef.current) return base;
      return injectHouseDefaults(base);
    });
    // beforeChange — only normalize + clamp. Respects user style edits.
    const u2 = editor.sideEffects.registerBeforeChangeHandler("shape", (_prev, next) => normalizeAndMaybeClamp(next));
    // After-change backstop. If somehow a shape landed off-page despite
    // the before-handlers, force-correct it. Skip during snapshot load
    // (data is trusted), and skip arrows (their visual position is
    // endpoint-derived, not x/y-derived).
    const u3 = editor.sideEffects.registerAfterChangeHandler("shape", (_prev, next) => {
      if (isLoadingSnapshotRef.current) return;
      if (ARROW_TYPES.has(next.type)) return;
      const corrected = clampShape(next);
      if (corrected !== next) {
        // Use a microtask so we don't recurse inside the side-effect.
        queueMicrotask(() => {
          try {
            editor.updateShape({ id: next.id, type: next.type, x: corrected.x, y: corrected.y });
          } catch { /* shape may have been deleted */ }
        });
      }
    });

    // ─── Arrow conversion ─────────────────────────────────────────
    // Convert every tldraw NATIVE arrow created by the user via the
    // arrow tool into our directoor-arrow with path="straight". This
    // gives users the three draggable bend handles (bend1/bend2/bend3)
    // as soon as they draw an arrow — matching the #2b feature
    // request. We intentionally DO NOT convert arrows loaded from
    // saved snapshots (isLoadingSnapshotRef guard); existing native
    // arrows continue to render as they were saved.
    //
    // We convert in the afterCreate phase, inside a microtask, because
    // (a) the native arrow's terminal props are only finalised after
    // the drag completes, and (b) reading + deleting + recreating
    // inside the synchronous handler would confuse tldraw's history.
    const u4 = editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
      if (isLoadingSnapshotRef.current) return;
      if (shape.type !== "arrow") return;

      queueMicrotask(() => {
        const native = editor.getShape(shape.id);
        if (!native || native.type !== "arrow") return;
        const nativeProps = native.props as {
          start: { x?: number; y?: number };
          end: { x?: number; y?: number };
          color?: string;
          size?: string;
          dash?: string;
          text?: string;
        };
        // tldraw v3 stores start/end as plain points in shape-local
        // coords; bound arrows get their binding via the separate
        // bindings store (readable via editor.getBindingsFromShape).
        const startX = native.x + (nativeProps.start?.x ?? 0);
        const startY = native.y + (nativeProps.start?.y ?? 0);
        const endX = native.x + (nativeProps.end?.x ?? 0);
        const endY = native.y + (nativeProps.end?.y ?? 0);

        // Preserve binding targets if the user snapped the arrow ends
        // onto existing shapes. getBindingsFromShape returns the
        // arrow's "arrow" bindings (start/end terminals).
        let fromShapeId = "";
        let toShapeId = "";
        try {
          const bindings = editor.getBindingsFromShape(native.id, "arrow");
          for (const b of bindings) {
            const bprops = b.props as { terminal?: "start" | "end" };
            if (bprops.terminal === "start") fromShapeId = b.toId as unknown as string;
            else if (bprops.terminal === "end") toShapeId = b.toId as unknown as string;
          }
        } catch { /* binding lookup can throw for unbound arrows */ }

        const newId = createShapeId();
        editor.run(() => {
          editor.createShape({
            id: newId,
            type: "directoor-arrow",
            x: 0,
            y: 0,
            props: {
              startX, startY, endX, endY,
              fromShapeId, toShapeId,
              fromAnchor: "auto",
              toAnchor: "auto",
              color: hexToTldrawColor(nativeProps.color ?? "grey"),
              strokeWidth: 2,
              dash: nativeProps.dash === "dashed" || nativeProps.dash === "dotted"
                ? nativeProps.dash
                : "solid",
              startHead: "none",
              endHead: "arrow",
              path: "straight",
              squiggleOffset: 0,
              bend1Offset: 0,
              bend2Offset: 0,
              bend3Offset: 0,
              animated: false,
              label: nativeProps.text ?? "",
              labelPosition: 0.5,
            },
          });
          editor.deleteShape(native.id);
          editor.select(newId);
        });
      });
    });

    return () => { u1(); u2(); u3(); u4(); };
  }, [editor]);

  // ─── React to page-width changes (from drag handle or load) ─────────
  // When pageWidth changes, push new constraints into the editor and
  // schedule a save so the new width persists. Skipped on the initial
  // mount where handleMount already applied options.
  const lastAppliedWidthRef = useRef<number | null>(null);
  useEffect(() => {
    if (!editor) return;
    if (lastAppliedWidthRef.current === pageWidth) return;
    lastAppliedWidthRef.current = pageWidth;
    editor.setCameraOptions(makeCameraOptions(pageWidth));
    // Only schedule a save once the canvas has fully loaded (otherwise
    // we'd save the default width before the saved width is restored).
    if (hasLoadedRef.current) {
      scheduleSaveRef.current?.();
    }
  }, [editor, pageWidth]);

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
        pageWidth: pageWidthRef.current,
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
  // Expose scheduleSave to effects defined earlier in the function body
  // (page-width effect needs to trigger a save when the user resizes).
  const scheduleSaveRef = useRef<(() => void) | null>(null);
  useEffect(() => { scheduleSaveRef.current = scheduleSave; }, [scheduleSave]);

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
        pageWidth: pageWidthRef.current,
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
                  // Migration: Directoor geo shapes now use tldraw's
                  // standard style enums (DefaultColor/Fill/Dash) and
                  // richText for labels. The shared normaliser converts
                  // legacy hex/string values and wraps plain-string
                  // labels into tldraw's rich-text JSON.
                  const fixed = normalizeDirectoorShapeStyles(rec as { type: string; props?: object });
                  if (fixed !== rec) {
                    snapshot.store[key] = fixed as typeof rec;
                    continue;
                  }
                  snapshot.store[key] = rec;
                }
              }
              // Set the load flag so our clamp side-effect handlers don't
              // reposition shapes against the stale INITIAL_PAGE_WIDTH.
              // The saved width is applied to the camera immediately after
              // this restore completes.
              isLoadingSnapshotRef.current = true;
              try {
                editor.store.loadStoreSnapshot(saved.tldrawSnapshot as any);
              } finally {
                isLoadingSnapshotRef.current = false;
              }
            } catch (e) {
              console.warn("Could not restore canvas snapshot, starting fresh:", e);
              isLoadingSnapshotRef.current = false;
            }
          }

          // ── Restore page width ─────────────────────────────────────
          // Saved width takes priority. If absent (legacy canvas) or
          // invalid, fall back to INITIAL_PAGE_WIDTH. Then run the
          // growth migration: if existing shapes extend past the chosen
          // width, grow it (rather than compress the layout) so all
          // content remains reachable inside the new page-constrained
          // camera. Width is always >= INITIAL and <= MAX.
          const savedWidth =
            typeof saved.pageWidth === "number" && saved.pageWidth >= INITIAL_PAGE_WIDTH
              ? Math.min(saved.pageWidth, MAX_PAGE_WIDTH)
              : INITIAL_PAGE_WIDTH;
          const needed = neededWidthForExistingShapes(editor);
          const restoredWidth = Math.min(MAX_PAGE_WIDTH, Math.max(savedWidth, needed));
          pageWidthAtom.set(restoredWidth);

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

      // Native grid stays OFF after load (loadStoreSnapshot can flip it).
      // The page has its own baked-in dot grid via PageBackground.
      editor.updateInstanceState({ isGridMode: false });

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
          pageWidth: pageWidthRef.current,
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
        // Position the "Animate" button above the centre-top of the
        // actual visible selection. We use editor.getShapePageBounds(id)
        // so every shape type reports its correct VISIBLE rectangle —
        // critical for directoor-arrow / line, whose shape.x / shape.y
        // is just an anchor, not the drawn position. Using shape.x/y
        // for these put the button at the wrong spot (often hidden or
        // far from the arrow), which is what made the Animate button
        // appear to be "missing" when arrows were in the selection.
        let minX = Infinity, minY = Infinity, maxX = -Infinity;
        for (const id of ids) {
          const bounds = editor.getShapePageBounds(id);
          if (!bounds) continue;
          // pageToScreen (NOT pageToViewport) — we position the Animate
          // button with `fixed` (screen coords), and our CSS insets
          // `.tl-container` by the sidebar width, so viewport coords and
          // screen coords no longer match.
          const topLeft = editor.pageToScreen({ x: bounds.x, y: bounds.y });
          const topRight = editor.pageToScreen({ x: bounds.x + bounds.w, y: bounds.y });
          minX = Math.min(minX, topLeft.x);
          minY = Math.min(minY, topLeft.y);
          maxX = Math.max(maxX, topRight.x);
        }
        if (minX !== Infinity) {
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
    setActiveRegionId(newRegion.id);
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
    setAnimationRegions((prev) => {
      const next = prev.filter((r) => r.id !== regionId);
      // If the deleted region was active, activate the last remaining one
      setActiveRegionId((cur) => {
        if (cur !== regionId) return cur;
        return next.length > 0 ? next[next.length - 1]!.id : null;
      });
      return next;
    });
  }, []);

  // Check if any region is in edit mode (to show hint in command bar)
  const hasEditingRegion = animationRegions.some((r) => r.isEditMode);

  return (
    <div className="tldraw-container">
      <Tldraw
        onMount={handleMount}
        components={tlComponents}
        shapeUtils={DIRECTOOR_SHAPE_UTILS}
      />

      {/* Directoor shape picker — anchored to the right edge of tldraw's
          bottom toolbar. Opens a popup with every archetype from
          ARCHETYPES (extensible); single-click on canvas drops the
          selected shape at that point with its default size. */}
      <DirectoorShapePicker editor={editor} />

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
          isActive={activeRegionId === region.id}
          onActivate={() => setActiveRegionId(region.id)}
          onExport={() => {
            setExportPreselectRegionId(region.id);
            setExportAnimationOpen(true);
          }}
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
          initialRegionId={exportPreselectRegionId}
          onClose={() => {
            setExportAnimationOpen(false);
            setExportPreselectRegionId(null);
          }}
        />
      )}
    </div>
  );
}
