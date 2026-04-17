"use client";

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Command, Send, Loader2 } from "lucide-react";
import type { Editor } from "tldraw";
import { executeActions } from "@/lib/tldraw-bridge";
import { apiFetch } from "@/lib/api-client";
import { FeedbackBar } from "./FeedbackBar";

interface CommandBarProps {
  editor: Editor | null;
  store: ReturnType<typeof import("@directoor/core").createCanvasStore>;
  canvasId: string | null;
  onAnimateCommand?: (sequence: number[]) => void;
  animateHint?: string;
}

/**
 * Deterministic Tier 1 Router — handles 30+ common commands locally
 * without any LLM call. Free, instant (<5ms), and reliable.
 *
 * Returns `handled: true` when matched, which skips the LLM round-trip.
 */
function tryDeterministicRoute(
  command: string,
  editor: Editor | null,
  callbacks: {
    onAnimate: (seq: number[]) => void;
    onUndo: () => void;
    onRedo: () => void;
  },
): { handled: boolean; message: string } {
  const trimmed = command.trim().toLowerCase();
  if (!editor) return { handled: false, message: "" };

  // ─── Animation ──────────────────────────────────────────
  const animateMatch = trimmed.match(/^animate\s+([\d,\s]+)$/);
  if (animateMatch) {
    const nums = animateMatch[1]!.split(/[,\s]+/).map(Number).filter((n) => !isNaN(n) && n > 0);
    if (nums.length > 0) {
      callbacks.onAnimate(nums);
      return { handled: true, message: `Animation set: ${nums.join(",")}` };
    }
  }
  if (trimmed === "clear animation" || trimmed === "stop animation" || trimmed === "remove animation") {
    callbacks.onAnimate([]);
    return { handled: true, message: "Animation cleared." };
  }

  // ─── Undo / Redo ────────────────────────────────────────
  if (trimmed === "undo") { callbacks.onUndo(); return { handled: true, message: "Undone." }; }
  if (trimmed === "redo") { callbacks.onRedo(); return { handled: true, message: "Redone." }; }

  // ─── Selection helpers ──────────────────────────────────
  if (trimmed === "select all") {
    editor.selectAll();
    return { handled: true, message: "All shapes selected." };
  }
  if (trimmed === "deselect" || trimmed === "deselect all" || trimmed === "clear selection") {
    editor.selectNone();
    return { handled: true, message: "Deselected." };
  }

  // All following commands require a selection
  const selectedIds = editor.getSelectedShapeIds();
  const hasSelection = selectedIds.length > 0;

  // ─── Alignment ──────────────────────────────────────────
  const alignMap: Record<string, "left" | "right" | "center-horizontal" | "top" | "bottom" | "center-vertical"> = {
    "align left": "left",
    "align right": "right",
    "align center": "center-horizontal",
    "align horizontally": "center-horizontal",
    "align top": "top",
    "align bottom": "bottom",
    "align middle": "center-vertical",
    "align vertically": "center-vertical",
  };
  if (alignMap[trimmed]) {
    if (!hasSelection || selectedIds.length < 2) {
      return { handled: true, message: "Select 2+ shapes to align." };
    }
    editor.alignShapes(selectedIds, alignMap[trimmed]!);
    return { handled: true, message: `Aligned ${trimmed.replace("align ", "")}.` };
  }

  // ─── Distribute ─────────────────────────────────────────
  if (trimmed === "distribute horizontally" || trimmed === "space horizontally") {
    if (!hasSelection || selectedIds.length < 3) return { handled: true, message: "Select 3+ shapes to distribute." };
    editor.distributeShapes(selectedIds, "horizontal");
    return { handled: true, message: "Distributed horizontally." };
  }
  if (trimmed === "distribute vertically" || trimmed === "space vertically") {
    if (!hasSelection || selectedIds.length < 3) return { handled: true, message: "Select 3+ shapes to distribute." };
    editor.distributeShapes(selectedIds, "vertical");
    return { handled: true, message: "Distributed vertically." };
  }

  // ─── Delete ─────────────────────────────────────────────
  if (trimmed === "delete" || trimmed === "delete selected" || trimmed === "remove selected") {
    if (!hasSelection) return { handled: true, message: "Nothing selected." };
    editor.deleteShapes(selectedIds);
    return { handled: true, message: `Deleted ${selectedIds.length} shape(s).` };
  }
  if (trimmed === "delete all" || trimmed === "clear canvas" || trimmed === "clear all") {
    const all = editor.getCurrentPageShapes().map((s) => s.id);
    if (all.length === 0) return { handled: true, message: "Canvas already empty." };
    editor.deleteShapes(all);
    return { handled: true, message: `Cleared ${all.length} shape(s).` };
  }

  // ─── Duplicate ──────────────────────────────────────────
  if (trimmed === "duplicate" || trimmed === "copy" || trimmed === "clone") {
    if (!hasSelection) return { handled: true, message: "Nothing selected." };
    editor.duplicateShapes(selectedIds, { x: 30, y: 30 });
    return { handled: true, message: `Duplicated ${selectedIds.length} shape(s).` };
  }

  // ─── Z-order ────────────────────────────────────────────
  if (trimmed === "bring to front") {
    if (!hasSelection) return { handled: true, message: "Nothing selected." };
    editor.bringToFront(selectedIds);
    return { handled: true, message: "Brought to front." };
  }
  if (trimmed === "send to back") {
    if (!hasSelection) return { handled: true, message: "Nothing selected." };
    editor.sendToBack(selectedIds);
    return { handled: true, message: "Sent to back." };
  }
  if (trimmed === "bring forward") {
    if (!hasSelection) return { handled: true, message: "Nothing selected." };
    editor.bringForward(selectedIds);
    return { handled: true, message: "Brought forward." };
  }
  if (trimmed === "send backward") {
    if (!hasSelection) return { handled: true, message: "Nothing selected." };
    editor.sendBackward(selectedIds);
    return { handled: true, message: "Sent backward." };
  }

  // ─── Grouping ───────────────────────────────────────────
  if (trimmed === "group" || trimmed === "group selected") {
    if (!hasSelection || selectedIds.length < 2) return { handled: true, message: "Select 2+ shapes to group." };
    editor.groupShapes(selectedIds);
    return { handled: true, message: "Grouped." };
  }
  if (trimmed === "ungroup" || trimmed === "ungroup selected") {
    if (!hasSelection) return { handled: true, message: "Nothing selected." };
    editor.ungroupShapes(selectedIds);
    return { handled: true, message: "Ungrouped." };
  }

  // ─── Line style shortcuts ───────────────────────────────
  const styleMap: Record<string, "solid" | "dashed" | "dotted"> = {
    "make dashed": "dashed",
    "make it dashed": "dashed",
    "dashed": "dashed",
    "make dotted": "dotted",
    "make it dotted": "dotted",
    "dotted": "dotted",
    "make solid": "solid",
    "make it solid": "solid",
    "solid": "solid",
  };
  if (styleMap[trimmed]) {
    if (!hasSelection) return { handled: true, message: "Select shape(s) first." };
    const dash = styleMap[trimmed]! === "solid" ? "solid" : styleMap[trimmed];
    for (const id of selectedIds) {
      const shape = editor.getShape(id);
      if (!shape) continue;
      // Only shapes with a `dash` prop support this (geo, arrow, directoor-*)
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        props: { ...(shape.props as Record<string, unknown>), dash },
      });
    }
    return { handled: true, message: `Set to ${styleMap[trimmed]}.` };
  }

  // ─── Viewport ───────────────────────────────────────────
  if (trimmed === "zoom to fit" || trimmed === "fit all" || trimmed === "fit to screen") {
    editor.zoomToFit({ animation: { duration: 300 } });
    return { handled: true, message: "Zoomed to fit." };
  }
  if (trimmed === "zoom to selection" || trimmed === "fit selection") {
    if (!hasSelection) return { handled: true, message: "Nothing selected." };
    editor.zoomToSelection({ animation: { duration: 300 } });
    return { handled: true, message: "Zoomed to selection." };
  }
  if (trimmed === "reset zoom" || trimmed === "zoom 100") {
    editor.resetZoom();
    return { handled: true, message: "Zoom reset." };
  }

  // ─── Lock / unlock ──────────────────────────────────────
  if (trimmed === "lock" || trimmed === "lock selected") {
    if (!hasSelection) return { handled: true, message: "Nothing selected." };
    for (const id of selectedIds) {
      const shape = editor.getShape(id);
      if (shape) editor.updateShape({ id, type: shape.type, isLocked: true });
    }
    return { handled: true, message: `Locked ${selectedIds.length} shape(s).` };
  }
  if (trimmed === "unlock" || trimmed === "unlock selected") {
    if (!hasSelection) return { handled: true, message: "Nothing selected." };
    for (const id of selectedIds) {
      const shape = editor.getShape(id);
      if (shape) editor.updateShape({ id, type: shape.type, isLocked: false });
    }
    return { handled: true, message: `Unlocked ${selectedIds.length} shape(s).` };
  }

  return { handled: false, message: "" };
}

export function CommandBar({ editor, store, canvasId, onAnimateCommand, animateHint }: CommandBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastMessage, setLastMessage] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global Cmd+K / Ctrl+K shortcut to open command bar
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        setInput("");
        setLastMessage("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isProcessing || !editor) return;

    setHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);

    // Try deterministic route first (Tier 1 — free, instant)
    const deterministicResult = tryDeterministicRoute(trimmed, editor, {
      onAnimate: (seq) => onAnimateCommand?.(seq),
      onUndo: () => {
        editor.undo();
        store.getState().dispatch({ type: "UNDO", payload: {} }, "user-command");
      },
      onRedo: () => {
        editor.redo();
        store.getState().dispatch({ type: "REDO", payload: {} }, "user-command");
      },
    });

    if (deterministicResult.handled) {
      setLastMessage(deterministicResult.message);
      setInput("");
      return;
    }

    // Tier 2 — LLM route
    setIsProcessing(true);
    setLastMessage("");

    try {
      const response = await apiFetch("/api/command", {
        method: "POST",
        canvasId,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: trimmed,
          context: store.getState().getContextSnapshot(),
        }),
      });

      if (!response.ok) {
        setLastMessage(`Error: ${response.statusText}`);
        return;
      }

      const result = await response.json();
      if (result.logId) setLastLogId(result.logId);

      if (result.error) {
        setLastMessage(result.error);
        return;
      }

      // Execute the returned actions via the bridge
      if (result.actions && Array.isArray(result.actions) && result.actions.length > 0) {
        executeActions(result.actions, store, editor);

        // Zoom to fit after creating objects
        const hasCreates = result.actions.some(
          (a: { type: string }) =>
            a.type === "CREATE_OBJECT" || a.type === "CREATE_CONNECTION",
        );
        if (hasCreates) {
          setTimeout(() => {
            editor.zoomToFit({ animation: { duration: 300 } });
          }, 100);
        }

        setLastMessage(`Done! ${result.actions.length} action(s) executed.`);
      } else {
        setLastMessage("No actions to execute.");
      }

      setInput("");
    } catch (error) {
      console.error("Command error:", error);
      setLastMessage("Connection error. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing, store, editor, onAnimateCommand]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex =
          historyIndex === -1
            ? history.length - 1
            : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(history[newIndex] ?? "");
      }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= history.length) {
          setHistoryIndex(-1);
          setInput("");
        } else {
          setHistoryIndex(newIndex);
          setInput(history[newIndex] ?? "");
        }
      }
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="fixed bottom-[64px] left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg transition-all hover:bg-slate-800 hover:shadow-xl"
      >
        <Command size={16} />
        <span>Command</span>
        <kbd className="ml-1 rounded bg-slate-700 px-1.5 py-0.5 text-xs font-mono">
          {typeof navigator !== "undefined" &&
          navigator.userAgent.includes("Mac")
            ? "\u2318K"
            : "Ctrl+K"}
        </kbd>
      </button>
    );
  }

  return (
    <div className="fixed bottom-[64px] left-1/2 -translate-x-1/2 z-[9999] w-full max-w-2xl px-4">
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xl ring-1 ring-slate-900/5">
        <Command size={18} className="shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={animateHint || 'Try "Create a Postgres database" or "animate 1,3,2,4"'}
          className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          disabled={isProcessing}
          autoFocus
        />
        {isProcessing ? (
          <Loader2 size={18} className="shrink-0 animate-spin text-blue-500" />
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="shrink-0 rounded-lg bg-blue-500 p-1.5 text-white transition-colors hover:bg-blue-600 disabled:opacity-40 disabled:hover:bg-blue-500"
          >
            <Send size={14} />
          </button>
        )}
      </div>
      {lastMessage && (
        <p
          className={`mt-1.5 text-center text-xs ${
            lastMessage.startsWith("Error") || lastMessage.startsWith("Connection")
              ? "text-red-500"
              : "text-green-600"
          }`}
        >
          {lastMessage}
        </p>
      )}
      {lastLogId && !isProcessing && (
        <FeedbackBar logId={lastLogId} className="mt-2" />
      )}
      <p className="mt-1 text-center text-xs text-slate-400">
        Press <kbd className="font-mono">Enter</kbd> to send,{" "}
        <kbd className="font-mono">Esc</kbd> to close,{" "}
        <kbd className="font-mono">&uarr;</kbd> for history
      </p>
    </div>
  );
}
