"use client";

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Command, Send, Loader2 } from "lucide-react";
import type { Editor } from "tldraw";
import { executeActions } from "@/lib/tldraw-bridge";

interface CommandBarProps {
  editor: Editor | null;
  store: ReturnType<typeof import("@directoor/core").createCanvasStore>;
  onAnimateCommand?: (sequence: number[]) => void;
  animateHint?: string;
}

/**
 * Deterministic Tier 1 Router — handles commands locally without LLM.
 * Returns true if the command was handled, false if it should go to the LLM.
 */
function tryDeterministicRoute(
  command: string,
  callbacks: {
    onAnimate: (seq: number[]) => void;
    onUndo: () => void;
    onRedo: () => void;
  },
): { handled: boolean; message: string } {
  const trimmed = command.trim().toLowerCase();

  // animate 1,2,3,4,5
  const animateMatch = trimmed.match(/^animate\s+([\d,\s]+)$/);
  if (animateMatch) {
    const nums = animateMatch[1]!
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);
    if (nums.length > 0) {
      callbacks.onAnimate(nums);
      return { handled: true, message: `Animation set: ${nums.join(",")}` };
    }
  }

  // undo
  if (trimmed === "undo") {
    callbacks.onUndo();
    return { handled: true, message: "Undone." };
  }

  // redo
  if (trimmed === "redo") {
    callbacks.onRedo();
    return { handled: true, message: "Redone." };
  }

  // clear animation
  if (trimmed === "clear animation" || trimmed === "stop animation") {
    callbacks.onAnimate([]);
    return { handled: true, message: "Animation cleared." };
  }

  return { handled: false, message: "" };
}

export function CommandBar({ editor, store, onAnimateCommand, animateHint }: CommandBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastMessage, setLastMessage] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
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
    const deterministicResult = tryDeterministicRoute(trimmed, {
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
      const response = await fetch("/api/command", {
        method: "POST",
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
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg transition-all hover:bg-slate-800 hover:shadow-xl"
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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-2xl px-4">
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
      <p className="mt-1 text-center text-xs text-slate-400">
        Press <kbd className="font-mono">Enter</kbd> to send,{" "}
        <kbd className="font-mono">Esc</kbd> to close,{" "}
        <kbd className="font-mono">&uarr;</kbd> for history
      </p>
    </div>
  );
}
