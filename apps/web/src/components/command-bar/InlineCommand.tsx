"use client";

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Command, Send, Loader2, MapPin } from "lucide-react";
import type { Editor } from "tldraw";
import { executeActions } from "@/lib/tldraw-bridge";

interface InlineCommandProps {
  editor: Editor;
  store: ReturnType<typeof import("@directoor/core").createCanvasStore>;
  canvasPosition: { x: number; y: number };
  screenPosition: { x: number; y: number };
  onClose: () => void;
}

/**
 * InlineCommand — Same UX as the global command bar, but positioned
 * where the user double-clicked. Objects anchor to the click point.
 */
export function InlineCommand({
  editor,
  store,
  canvasPosition,
  screenPosition,
  onClose,
}: InlineCommandProps) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastMessage, setLastMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const el = inputRef.current?.parentElement?.parentElement;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    const timeout = setTimeout(() => {
      window.addEventListener("mousedown", handleClick);
    }, 200);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isProcessing) return;

    setIsProcessing(true);
    setLastMessage("");

    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: trimmed,
          context: store.getState().getContextSnapshot(),
          anchorPosition: canvasPosition,
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

      if (result.actions && Array.isArray(result.actions) && result.actions.length > 0) {
        executeActions(result.actions, store, editor);
        setLastMessage(`Done! ${result.actions.length} action(s) executed.`);
        // Close after a brief delay so user sees the success message
        setTimeout(onClose, 800);
      } else {
        setLastMessage("No actions to execute.");
      }

      setInput("");
    } catch (error) {
      console.error("Inline command error:", error);
      setLastMessage("Connection error. Try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [input, isProcessing, store, editor, canvasPosition, onClose]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Position: centered on click point, clamped to viewport
  const left = Math.max(16, Math.min(screenPosition.x - 280, window.innerWidth - 580));
  const top = Math.min(screenPosition.y + 12, window.innerHeight - 100);

  return (
    <div className="fixed z-[9999]" style={{ left, top }}>
      {/* Pin marker showing anchor point */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: screenPosition.x - left,
          top: -20,
        }}
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg ring-2 ring-white">
          <MapPin size={12} />
        </div>
        <div className="absolute top-6 h-2 w-0.5 bg-blue-400" />
      </div>

      {/* Command bar — same style as the global Cmd+K bar */}
      <div className="w-[560px]">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xl ring-1 ring-slate-900/5">
          <Command size={18} className="shrink-0 text-blue-400" />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What should go here? e.g. &quot;Database and S3 with an arrow&quot;"
            className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            disabled={isProcessing}
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
          Press <kbd className="font-mono">Enter</kbd> to create here,{" "}
          <kbd className="font-mono">Esc</kbd> to cancel
        </p>
      </div>
    </div>
  );
}
