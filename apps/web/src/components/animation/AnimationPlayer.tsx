"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Play, Square, ChevronRight, Repeat } from "lucide-react";
import type { Editor, TLShapeId } from "tldraw";

interface AnimationPlayerProps {
  editor: Editor | null;
  store: ReturnType<typeof import("@directoor/core").createCanvasStore>;
  animationSequence: number[];
  getShapeIdForNumber: (num: number) => TLShapeId | undefined;
}

/**
 * AnimationPlayer — Per-region playback with play, arrow-step, and loop.
 */
export function AnimationPlayer({
  editor,
  animationSequence,
  getShapeIdForNumber,
}: AnimationPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenShapesRef = useRef<TLShapeId[]>([]);

  const getAllSequenceShapeIds = useCallback((): TLShapeId[] => {
    return animationSequence
      .map(getShapeIdForNumber)
      .filter((id): id is TLShapeId => id !== undefined);
  }, [animationSequence, getShapeIdForNumber]);

  const hideAllSequenceShapes = useCallback(() => {
    if (!editor) return;
    const ids = getAllSequenceShapeIds();
    for (const id of ids) {
      const shape = editor.getShape(id);
      if (shape) {
        editor.updateShape({ id, type: shape.type, opacity: 0 });
      }
    }
    hiddenShapesRef.current = ids;
  }, [editor, getAllSequenceShapeIds]);

  const showAllSequenceShapes = useCallback(() => {
    if (!editor) return;
    for (const id of hiddenShapesRef.current) {
      const shape = editor.getShape(id);
      if (shape) {
        editor.updateShape({ id, type: shape.type, opacity: 1 });
      }
    }
    hiddenShapesRef.current = [];
  }, [editor]);

  const revealStep = useCallback((step: number) => {
    if (!editor) return;
    const num = animationSequence[step];
    if (num === undefined) return;
    const shapeId = getShapeIdForNumber(num);
    if (!shapeId) return;
    const shape = editor.getShape(shapeId);
    if (shape) {
      editor.updateShape({ id: shapeId, type: shape.type, opacity: 1 });
    }
  }, [editor, animationSequence, getShapeIdForNumber]);

  const stopAnimation = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    showAllSequenceShapes();
    setIsPlaying(false);
    setCurrentStep(-1);
  }, [showAllSequenceShapes]);

  const playAnimation = useCallback(() => {
    if (!editor || animationSequence.length === 0) return;

    setIsPlaying(true);
    setCurrentStep(0);
    hideAllSequenceShapes();

    let step = 0;
    const revealNext = () => {
      if (step >= animationSequence.length) {
        if (isLooping) {
          // Restart loop
          step = 0;
          setCurrentStep(0);
          hideAllSequenceShapes();
          timeoutRef.current = setTimeout(revealNext, 600);
        } else {
          setIsPlaying(false);
          setCurrentStep(-1);
          hiddenShapesRef.current = [];
        }
        return;
      }

      revealStep(step);
      setCurrentStep(step + 1);
      step++;
      timeoutRef.current = setTimeout(revealNext, 800);
    };

    timeoutRef.current = setTimeout(revealNext, 400);
  }, [editor, animationSequence, isLooping, hideAllSequenceShapes, revealStep]);

  // Arrow key stepping
  const stepForward = useCallback(() => {
    if (!editor || animationSequence.length === 0) return;

    if (currentStep === -1) {
      // Start stepping from beginning
      hideAllSequenceShapes();
      setCurrentStep(0);
      return;
    }

    if (currentStep < animationSequence.length) {
      revealStep(currentStep);
      setCurrentStep(currentStep + 1);
    } else if (isLooping) {
      hideAllSequenceShapes();
      setCurrentStep(0);
    }
  }, [editor, animationSequence, currentStep, isLooping, hideAllSequenceShapes, revealStep]);

  // Arrow key listener
  useEffect(() => {
    if (animationSequence.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && !isPlaying) {
        e.preventDefault();
        stepForward();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [animationSequence, isPlaying, stepForward]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (animationSequence.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-lg ring-1 ring-slate-200">
      <span className="text-xs font-medium text-slate-500 mr-1">
        Sequence: {animationSequence.join(" → ")}
      </span>

      {isPlaying ? (
        <button
          onClick={stopAnimation}
          className="rounded-lg bg-red-500 p-1.5 text-white hover:bg-red-600"
          title="Stop"
        >
          <Square size={14} />
        </button>
      ) : (
        <>
          <button
            onClick={playAnimation}
            className="rounded-lg bg-blue-500 p-1.5 text-white hover:bg-blue-600"
            title="Play animation"
          >
            <Play size={14} />
          </button>
          <button
            onClick={stepForward}
            className="rounded-lg bg-slate-200 p-1.5 text-slate-700 hover:bg-slate-300"
            title="Step forward (→ arrow key)"
          >
            <ChevronRight size={14} />
          </button>
        </>
      )}

      <button
        onClick={() => setIsLooping(!isLooping)}
        className={`rounded-lg p-1.5 transition-colors ${
          isLooping
            ? "bg-blue-100 text-blue-600 ring-1 ring-blue-300"
            : "bg-slate-100 text-slate-400 hover:text-slate-600"
        }`}
        title={isLooping ? "Loop ON" : "Loop OFF"}
      >
        <Repeat size={14} />
      </button>

      {currentStep > 0 && (
        <span className="text-xs text-slate-400 ml-1">
          {currentStep}/{animationSequence.length}
        </span>
      )}
    </div>
  );
}
