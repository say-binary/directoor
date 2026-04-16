"use client";

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Command, Send, Loader2, MapPin } from "lucide-react";
import type { Editor } from "tldraw";
import { executeActions } from "@/lib/tldraw-bridge";
import { InlineImagePicker } from "./InlineImagePicker";
import { apiFetch } from "@/lib/api-client";
import { FeedbackBar } from "./FeedbackBar";

interface InlineCommandProps {
  editor: Editor;
  store: ReturnType<typeof import("@directoor/core").createCanvasStore>;
  canvasId: string | null;
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
  canvasId,
  canvasPosition,
  screenPosition,
  onClose,
}: InlineCommandProps) {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastMessage, setLastMessage] = useState("");
  const [imageQuery, setImageQuery] = useState<string | null>(null);
  const [lastLogId, setLastLogId] = useState<string | null>(null);
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
      // ─── Step 1: classify intent ─────────────────────────
      // The classifier runs a cheap regex prefilter first, and only
      // falls back to an LLM call for ambiguous queries.
      setLastMessage("Understanding…");
      const intentRes = await apiFetch("/api/classify-intent", {
        method: "POST",
        canvasId,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const intent = intentRes.ok
        ? ((await intentRes.json()) as { mode: "diagram" | "text" | "image" })
        : { mode: "diagram" as const };

      // ─── Step 2: route ───────────────────────────────────
      if (intent.mode === "text") {
        await handleTextGeneration(trimmed);
      } else if (intent.mode === "image") {
        // Hand off to the image picker — strips a leading verb like
        // "show me", "find", "image of" so the search query is clean.
        const cleaned = trimmed.replace(
          /^\s*(show me|find|search|get|image(s)? of|picture(s)? of|photo(s)? of|an? image of|some images of)\s+/i,
          "",
        ).trim();
        setImageQuery(cleaned || trimmed);
        return;
      } else {
        await handleDiagramGeneration(trimmed);
      }

      setInput("");
    } catch (error) {
      console.error("Inline command error:", error);
      setLastMessage("Connection error. Try again.");
    } finally {
      setIsProcessing(false);
    }

    async function handleTextGeneration(prompt: string) {
      setLastMessage("Writing…");
      const res = await apiFetch("/api/text", {
        method: "POST",
        canvasId,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (res.status === 429) {
        const j = await res.json().catch(() => ({}));
        setLastMessage(j.error ?? "Daily free limit reached.");
        return;
      }
      if (!res.ok) {
        setLastMessage(`Error: ${res.statusText}`);
        return;
      }
      const result = (await res.json()) as {
        text?: string;
        suggestedWidth?: number;
        suggestedHeight?: number;
        error?: string;
        logId?: string;
      };
      if (result.error || !result.text) {
        setLastMessage(result.error ?? "No text generated");
        return;
      }
      if (result.logId) setLastLogId(result.logId);
      // Create a prose-mode DirectoorText at the click position
      const w = result.suggestedWidth ?? 440;
      const h = result.suggestedHeight ?? 120;
      const tldraw = await import("tldraw");
      const tlId = tldraw.createShapeId();
      editor.createShape({
        id: tlId,
        type: "directoor-text",
        x: canvasPosition.x - w / 2,
        y: canvasPosition.y - h / 2,
        props: {
          w, h,
          text: result.text,
          color: "#0F172A",
          size: "m",
          weight: "normal",
          align: "left",
          background: "subtle",
          contentType: "prose",
        },
      });
      editor.select(tlId);
      setLastMessage("Done!");
      setTimeout(onClose, 600);
    }

    async function handleDiagramGeneration(command: string) {
      setLastMessage("Drawing…");
      const response = await apiFetch("/api/command", {
        method: "POST",
        canvasId,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command,
          context: store.getState().getContextSnapshot(),
          anchorPosition: canvasPosition,
        }),
      });
      if (response.status === 429) {
        const j = await response.json().catch(() => ({}));
        setLastMessage(j.error ?? "Daily free limit reached.");
        return;
      }
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
      if (result.actions && Array.isArray(result.actions) && result.actions.length > 0) {
        executeActions(result.actions, store, editor);
        setLastMessage(`Done! ${result.actions.length} action(s) executed.`);
        // Don't auto-close — keep open so the user can rate the result
      } else {
        setLastMessage("No actions to execute.");
      }
    }
  }, [input, isProcessing, store, editor, canvasId, canvasPosition, onClose]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  // If image intent was inferred, show the picker instead of the bar
  if (imageQuery) {
    return (
      <InlineImagePicker
        editor={editor}
        query={imageQuery}
        canvasId={canvasId}
        canvasPosition={canvasPosition}
        screenPosition={screenPosition}
        onClose={onClose}
      />
    );
  }

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
            placeholder='Diagram, text ("write 2 paragraphs on kafka"), or images ("show me golden retrievers")'
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
        {lastLogId && !isProcessing && (
          <FeedbackBar
            logId={lastLogId}
            onDone={() => setTimeout(onClose, 500)}
            className="mt-2"
          />
        )}
        <p className="mt-1 text-center text-xs text-slate-400">
          Press <kbd className="font-mono">Enter</kbd> to create here,{" "}
          <kbd className="font-mono">Esc</kbd> to cancel
        </p>
      </div>
    </div>
  );
}
