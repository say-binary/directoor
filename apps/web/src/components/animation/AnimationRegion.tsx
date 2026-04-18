"use client";

import { useState, useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import { Play, Square, ChevronRight, Repeat, Sparkles, X, Check, Download } from "lucide-react";
import type { Editor, TLShapeId } from "tldraw";

export interface AnimationRegionData {
  id: string;
  shapeIds: TLShapeId[];
  sequence: number[];
  isEditMode: boolean;
  isLooping: boolean;
}

interface AnimationRegionProps {
  editor: Editor;
  region: AnimationRegionData;
  onUpdate: (region: AnimationRegionData) => void;
  onDelete: (regionId: string) => void;
  /** Whether this region is the "active" one for keyboard navigation.
   *  Only the active region responds to ArrowRight key presses, so
   *  multiple regions don't all advance simultaneously. */
  isActive: boolean;
  /** Callback to make this region the active one when the user interacts
   *  with its controls (step, play, etc.). */
  onActivate: () => void;
  /** Callback when the user clicks the per-region Export shortcut.
   *  Opens the global export dialog pre-selected to this region. */
  onExport: () => void;
}

export function AnimationRegion({ editor, region, onUpdate, onDelete, isActive, onActivate, onExport }: AnimationRegionProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [sequenceInput, setSequenceInput] = useState(region.sequence.join(","));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use ref for isLooping so the play closure always sees the latest value
  const isLoopingRef = useRef(region.isLooping);
  isLoopingRef.current = region.isLooping;

  // Keep sequenceInput in sync when region changes externally
  useEffect(() => {
    if (!region.isEditMode) return;
    setSequenceInput(region.sequence.join(","));
  }, [region.isEditMode, region.sequence]);

  // ─── Bounding Box ────────────────────────────────────────────

  const [screenBounds, setScreenBounds] = useState({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    const updateBounds = () => {
      if (region.shapeIds.length === 0) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      for (const id of region.shapeIds) {
        const pageBounds = editor.getShapePageBounds(id);
        if (!pageBounds) continue;
        minX = Math.min(minX, pageBounds.x);
        minY = Math.min(minY, pageBounds.y);
        maxX = Math.max(maxX, pageBounds.x + pageBounds.w);
        maxY = Math.max(maxY, pageBounds.y + pageBounds.h);
      }

      if (minX === Infinity) return;

      const pad = 24;
      // pageToScreen (NOT pageToViewport) because the region is rendered
      // with `position: fixed` in screen coords. Our DirectoorCanvas CSS
      // insets `.tl-container` by the sidebar width, so viewport != screen.
      const topLeft = editor.pageToScreen({ x: minX - pad, y: minY - pad });
      const bottomRight = editor.pageToScreen({ x: maxX + pad, y: maxY + pad });
      setScreenBounds({
        x: topLeft.x,
        y: topLeft.y,
        w: bottomRight.x - topLeft.x,
        h: bottomRight.y - topLeft.y,
      });
    };

    updateBounds();
    const interval = setInterval(updateBounds, 200);
    return () => clearInterval(interval);
  }, [editor, region.shapeIds]);

  // ─── Shape Visibility ────────────────────────────────────────

  const hideAll = useCallback(() => {
    for (const id of region.shapeIds) {
      const shape = editor.getShape(id);
      if (shape) editor.updateShape({ id, type: shape.type, opacity: 0 });
    }
  }, [editor, region.shapeIds]);

  const showAll = useCallback(() => {
    for (const id of region.shapeIds) {
      const shape = editor.getShape(id);
      if (shape) editor.updateShape({ id, type: shape.type, opacity: 1 });
    }
  }, [editor, region.shapeIds]);

  const revealBySequenceIndex = useCallback((seqIdx: number) => {
    const displayNum = region.sequence[seqIdx];
    if (displayNum === undefined) return;
    // displayNum is 1-based → index into shapeIds is displayNum - 1
    const shapeId = region.shapeIds[displayNum - 1];
    if (!shapeId) return;
    const shape = editor.getShape(shapeId);
    if (shape) editor.updateShape({ id: shapeId, type: shape.type, opacity: 1 });
  }, [editor, region.shapeIds, region.sequence]);

  // ─── Playback ────────────────────────────────────────────────

  const stopAnimation = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    showAll();
    setIsPlaying(false);
    setCurrentStep(-1);
  }, [showAll]);

  const playAnimation = useCallback(() => {
    const seq = region.sequence;
    const shapeIds = region.shapeIds;
    if (seq.length === 0) return;

    setIsPlaying(true);
    setCurrentStep(0);

    // Hide all shapes in the region
    for (const id of shapeIds) {
      const shape = editor.getShape(id);
      if (shape) editor.updateShape({ id, type: shape.type, opacity: 0 });
    }

    let step = 0;

    const revealOne = (seqIdx: number) => {
      const displayNum = seq[seqIdx];
      if (displayNum === undefined) return;
      const shapeId = shapeIds[displayNum - 1];
      if (!shapeId) return;
      const shape = editor.getShape(shapeId);
      if (shape) editor.updateShape({ id: shapeId, type: shape.type, opacity: 1 });
    };

    const tick = () => {
      revealOne(step);
      setCurrentStep(step + 1);
      step++;

      if (step < seq.length) {
        timeoutRef.current = setTimeout(tick, 800);
      } else {
        // All steps done — hold the final frame so the viewer clearly sees it
        timeoutRef.current = setTimeout(() => {
          if (isLoopingRef.current) {
            // Loop: hide all, pause briefly, then restart from step 0
            for (const id of shapeIds) {
              const shape = editor.getShape(id);
              if (shape) editor.updateShape({ id, type: shape.type, opacity: 0 });
            }
            setCurrentStep(0);
            step = 0;
            timeoutRef.current = setTimeout(tick, 700);
          } else {
            // One-shot: keep the full scene visible, stop
            for (const id of shapeIds) {
              const shape = editor.getShape(id);
              if (shape) editor.updateShape({ id, type: shape.type, opacity: 1 });
            }
            setIsPlaying(false);
            setCurrentStep(-1);
          }
        }, 2200); // Hold final frame 2.2s so the last reveal is clearly visible
      }
    };

    timeoutRef.current = setTimeout(tick, 400);
  }, [editor, region.sequence, region.shapeIds]);

  // Arrow key stepping
  const stepForward = useCallback(() => {
    if (region.sequence.length === 0) return;

    if (currentStep === -1) {
      hideAll();
      setCurrentStep(0);
      return;
    }

    if (currentStep < region.sequence.length) {
      revealBySequenceIndex(currentStep);
      setCurrentStep(currentStep + 1);
    } else if (region.isLooping) {
      hideAll();
      setCurrentStep(0);
    } else {
      showAll();
      setCurrentStep(-1);
    }
  }, [region.sequence, region.isLooping, currentStep, hideAll, showAll, revealBySequenceIndex]);

  useEffect(() => {
    // Only the ACTIVE region responds to ArrowRight — prevents all regions
    // from advancing simultaneously when the user presses the arrow key.
    if (region.sequence.length === 0 || isPlaying || !isActive) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        stepForward();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [region.sequence, isPlaying, stepForward, isActive]);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  // When a region stops being the active one while it's mid-animation
  // (shapes hidden, currentStep advanced), restore all its shapes so the
  // canvas doesn't show a half-stepped region sitting there with some of
  // its shapes invisible. This is why the user saw "other region shapes
  // disappear" — a previously active region was stuck mid-reveal when the
  // user switched to another region.
  useEffect(() => {
    if (isActive) return;
    if (isPlaying) {
      stopAnimation();
      return;
    }
    if (currentStep !== -1) {
      showAll();
      setCurrentStep(-1);
    }
    // Intentionally not including currentStep/isPlaying/showAll/stopAnimation
    // in deps — we only want this to fire when isActive flips to false.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ─── Sequence Editor ─────────────────────────────────────────

  const applySequence = useCallback(() => {
    const nums = sequenceInput
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0 && n <= region.shapeIds.length);
    onUpdate({ ...region, sequence: nums, isEditMode: false });
  }, [sequenceInput, region, onUpdate]);

  const handleSequenceKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applySequence();
    }
  };

  // ─── Number Badges ───────────────────────────────────────────

  const [badgePositions, setBadgePositions] = useState<Array<{ num: number; x: number; y: number; isArrow: boolean }>>([]);

  useEffect(() => {
    if (!region.isEditMode) {
      setBadgePositions([]);
      return;
    }
    const update = () => {
      const positions: Array<{ num: number; x: number; y: number; isArrow: boolean }> = [];
      for (let i = 0; i < region.shapeIds.length; i++) {
        const id = region.shapeIds[i]!;
        const shape = editor.getShape(id);
        if (!shape) continue;

        // For arrows (both tldraw native and our custom directoor-arrow),
        // use the centre of the shape's page bounds. For directoor-arrow
        // specifically, shape.x/shape.y is an abstract anchor decoupled
        // from the visible geometry, so positioning a badge at shape.x,y
        // landed it far from the drawn arrow (often off-screen). The
        // page-bounds centre is the correct midpoint of the line itself.
        const isArrow = shape.type === "arrow" || shape.type === "directoor-arrow";
        let pageX: number, pageY: number;

        if (isArrow) {
          const bounds = editor.getShapePageBounds(id);
          if (!bounds) continue;
          pageX = bounds.x + bounds.w / 2;
          pageY = bounds.y + bounds.h / 2;
        } else {
          pageX = shape.x;
          pageY = shape.y;
        }

        // Screen coords (not viewport) — rendered with position:fixed;
        // tl-container is CSS-inset by the sidebar width.
        const pt = editor.pageToScreen({ x: pageX, y: pageY });
        positions.push({ num: i + 1, x: pt.x, y: pt.y, isArrow });
      }
      setBadgePositions(positions);
    };
    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [editor, region.shapeIds, region.isEditMode]);

  // ─── Render ──────────────────────────────────────────────────

  const hasSequence = region.sequence.length > 0;

  // Border classes: ACTIVE state takes priority and paints a solid blue
  // frame + soft glow so the user can see at a glance which region will
  // respond to the arrow key. Other states fall back to the previous UI.
  const borderClasses = isPlaying
    ? "border-blue-500 bg-blue-50/15 shadow-xl shadow-blue-300/60 border-solid"
    : isActive
      ? "border-blue-500 bg-blue-50/10 shadow-lg shadow-blue-200/50 border-solid ring-2 ring-blue-200"
      : region.isEditMode
        ? "border-blue-300 bg-blue-50/5 border-dashed"
        : hasSequence
          ? "border-slate-200 bg-transparent border-dashed"
          : "border-slate-200 bg-transparent border-dashed opacity-50";

  return (
    <>
      {/* Persistent bounding box — pointer-events: none so clicks on the
         INSIDE pass through to the shape layer. Clicks on the EDGES are
         picked up by the 4 thin border strips below, which call
         onActivate() to promote this region to the active one. */}
      <div
        className={`pointer-events-none absolute z-[9997] rounded-lg border-2 transition-all duration-300 ${borderClasses}`}
        style={{
          left: screenBounds.x,
          top: screenBounds.y,
          width: screenBounds.w,
          height: screenBounds.h,
        }}
      />

      {/* Invisible clickable border frame. Four thin strips around the
         bounding-box perimeter that call onActivate() when clicked. The
         interior of the region stays pointer-events-transparent so shapes
         underneath remain individually selectable. */}
      {hasSequence && !region.isEditMode && (() => {
        const edge = 10; // px-wide click strip
        const bandStyle: React.CSSProperties = {
          position: "fixed",
          cursor: "pointer",
          zIndex: 9997,
        };
        return (
          <>
            <div
              onClick={onActivate}
              title="Activate this animation region"
              style={{ ...bandStyle, left: screenBounds.x - edge / 2, top: screenBounds.y - edge / 2, width: screenBounds.w + edge, height: edge }}
            />
            <div
              onClick={onActivate}
              title="Activate this animation region"
              style={{ ...bandStyle, left: screenBounds.x - edge / 2, top: screenBounds.y + screenBounds.h - edge / 2, width: screenBounds.w + edge, height: edge }}
            />
            <div
              onClick={onActivate}
              title="Activate this animation region"
              style={{ ...bandStyle, left: screenBounds.x - edge / 2, top: screenBounds.y - edge / 2, width: edge, height: screenBounds.h + edge }}
            />
            <div
              onClick={onActivate}
              title="Activate this animation region"
              style={{ ...bandStyle, left: screenBounds.x + screenBounds.w - edge / 2, top: screenBounds.y - edge / 2, width: edge, height: screenBounds.h + edge }}
            />
          </>
        );
      })()}

      {/* Number badges (edit mode only) */}
      {region.isEditMode && badgePositions.map((badge) => {
        const isInSequence = region.sequence.includes(badge.num);
        const seqPos = region.sequence.indexOf(badge.num);
        return (
          <div
            key={badge.num}
            className="pointer-events-none absolute z-[9998]"
            style={{ left: badge.x - 12, top: badge.y - 12 }}
          >
            <div
              className={`flex h-7 w-7 items-center justify-center text-xs font-bold shadow-md ${
                badge.isArrow ? "rounded-md" : "rounded-full"
              } ${
                isInSequence
                  ? "bg-blue-500 text-white ring-2 ring-blue-200"
                  : "bg-slate-600 text-white ring-2 ring-white"
              }`}
              title={badge.isArrow ? `Arrow #${badge.num}` : `Shape #${badge.num}`}
            >
              {isInSequence ? seqPos + 1 : badge.num}
            </div>
          </div>
        );
      })}

      {/* Toolbar pinned to bounding box */}
      <div
        className="pointer-events-auto fixed z-[9999] flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 shadow-lg ring-1 ring-slate-200"
        style={{
          left: screenBounds.x,
          top: Math.max(4, screenBounds.y - 44),
        }}
      >
        {/* Animate toggle */}
        <button
          onClick={() => {
            if (region.isEditMode) {
              // Toggling OFF — apply whatever is in the input
              applySequence();
            } else {
              onUpdate({ ...region, isEditMode: true });
            }
          }}
          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
            region.isEditMode
              ? "bg-blue-500 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Sparkles size={12} />
          {region.isEditMode ? "Editing" : "Animate"}
        </button>

        {/* Sequence editor (visible in edit mode) */}
        {region.isEditMode && (
          <>
            <input
              type="text"
              value={sequenceInput}
              onChange={(e) => setSequenceInput(e.target.value)}
              onKeyDown={handleSequenceKeyDown}
              placeholder={`1,2,3...${region.shapeIds.length}`}
              className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
            />
            <button
              onClick={applySequence}
              className="rounded-lg bg-green-500 p-1 text-white hover:bg-green-600"
              title="Save sequence"
            >
              <Check size={12} />
            </button>
          </>
        )}

        {/* Sequence display (view mode) */}
        {hasSequence && !region.isEditMode && (
          <span className="text-xs text-slate-400 mx-0.5">
            {region.sequence.join("→")}
          </span>
        )}

        {/* Playback controls (view mode with sequence) */}
        {hasSequence && !region.isEditMode && (
          <>
            {isPlaying ? (
              <button onClick={() => { onActivate(); stopAnimation(); }} className="rounded-lg bg-red-500 p-1.5 text-white hover:bg-red-600" title="Stop">
                <Square size={12} />
              </button>
            ) : (
              <>
                <button onClick={() => { onActivate(); playAnimation(); }} className="rounded-lg bg-blue-500 p-1.5 text-white hover:bg-blue-600" title="Play">
                  <Play size={12} />
                </button>
                <button onClick={() => { onActivate(); stepForward(); }} className={`rounded-lg p-1.5 text-slate-700 hover:bg-slate-300 transition-colors ${isActive ? "bg-blue-100 ring-1 ring-blue-300" : "bg-slate-200"}`} title="Step (→) — click to activate, then use arrow key">
                  <ChevronRight size={12} />
                </button>
              </>
            )}

            <button
              onClick={() => onUpdate({ ...region, isLooping: !region.isLooping })}
              className={`rounded-lg p-1.5 transition-colors ${
                region.isLooping ? "bg-blue-100 text-blue-600 ring-1 ring-blue-300" : "bg-slate-100 text-slate-400 hover:text-slate-600"
              }`}
              title={region.isLooping ? "Loop ON" : "Loop OFF"}
            >
              <Repeat size={12} />
            </button>
          </>
        )}

        {/* Step counter */}
        {currentStep > 0 && (
          <span className="text-xs text-slate-400">{currentStep}/{region.sequence.length}</span>
        )}

        {/* Export (only when a sequence exists and we're not in edit mode) */}
        {hasSequence && !region.isEditMode && (
          <button
            onClick={() => { onActivate(); onExport(); }}
            className="rounded-lg bg-slate-100 p-1.5 text-slate-600 hover:bg-blue-100 hover:text-blue-600 transition-colors"
            title="Export this animation (GIF / WebM / HTML slideshow)"
          >
            <Download size={12} />
          </button>
        )}

        {/* Delete */}
        <button
          onClick={() => { stopAnimation(); onDelete(region.id); }}
          className="rounded-lg p-1 text-slate-300 hover:text-red-500"
          title="Remove animation"
        >
          <X size={12} />
        </button>
      </div>
    </>
  );
}
