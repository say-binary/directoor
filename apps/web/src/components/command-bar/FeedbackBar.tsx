"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { submitFeedback } from "@/lib/api-client";

interface FeedbackBarProps {
  logId: string;
  className?: string;
  onDone?: () => void;
}

/**
 * FeedbackBar — small thumbs-up / thumbs-down row attached to the
 * outcome of an LLM call. Posts the rating to /api/log-feedback which
 * persists it on the matching command_logs row.
 *
 * On thumbs-down, expands a small note input so the user can say what
 * went wrong (this becomes high-quality training-correction signal).
 */
export function FeedbackBar({ logId, className, onDone }: FeedbackBarProps) {
  const [picked, setPicked] = useState<1 | -1 | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const send = async (value: 1 | -1, withNote?: string) => {
    setSubmitting(true);
    setPicked(value);
    try {
      await submitFeedback(logId, value, withNote);
    } finally {
      setSubmitting(false);
    }
    if (value === 1 && onDone) onDone();
  };

  if (picked && !showNote) {
    return (
      <div className={`flex items-center justify-center gap-1.5 text-xs text-green-600 ${className ?? ""}`}>
        <Check size={12} />
        Thanks for the feedback
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-1.5 ${className ?? ""}`}>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>How was this?</span>
        <button
          onClick={() => send(1)}
          disabled={submitting}
          className={`rounded p-1 transition-colors ${
            picked === 1
              ? "bg-green-100 text-green-600"
              : "text-slate-400 hover:bg-slate-100 hover:text-green-600"
          }`}
          title="Good result"
        >
          <ThumbsUp size={12} />
        </button>
        <button
          onClick={() => {
            setPicked(-1);
            setShowNote(true);
          }}
          disabled={submitting}
          className={`rounded p-1 transition-colors ${
            picked === -1
              ? "bg-red-100 text-red-600"
              : "text-slate-400 hover:bg-slate-100 hover:text-red-600"
          }`}
          title="Bad result"
        >
          <ThumbsDown size={12} />
        </button>
      </div>
      {showNote && (
        <div className="flex w-full items-center gap-1.5">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What went wrong? (optional)"
            className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-300"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send(-1, note.trim() || undefined);
              }
            }}
          />
          <button
            onClick={() => send(-1, note.trim() || undefined)}
            disabled={submitting}
            className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
