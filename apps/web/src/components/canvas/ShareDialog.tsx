"use client";

import { useEffect, useState } from "react";
import { X, Copy, Check, Loader2, Globe, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ShareDialogProps {
  canvasId: string;
  onClose: () => void;
}

interface CanvasShareState {
  is_public: boolean;
  public_slug: string | null;
}

/**
 * ShareDialog — toggles the canvas public/private and shows a
 * shareable URL when public. The slug is generated server-side via a
 * stored Postgres function (or simple UUID fallback) and persisted on
 * the `canvases` row. The viewer at /canvas/[slug] renders a clean,
 * mobile-friendly read-only version of the canvas.
 */
export function ShareDialog({ canvasId, onClose }: ShareDialogProps) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<CanvasShareState | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  // Load current share state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("canvases")
          .select("is_public, public_slug")
          .eq("id", canvasId)
          .single();
        if (cancelled) return;
        if (error) throw error;
        setState({
          is_public: !!data?.is_public,
          public_slug: (data?.public_slug as string | null) ?? null,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canvasId]);

  const togglePublic = async (next: boolean) => {
    setBusy(true);
    setError("");
    try {
      const update: Record<string, unknown> = { is_public: next };
      if (next && !state?.public_slug) {
        // Generate a slug client-side: short random + canvasId prefix
        const slug = `${canvasId.slice(0, 6)}-${Math.random().toString(36).slice(2, 8)}`;
        update.public_slug = slug;
      }
      const { data, error } = await supabase
        .from("canvases")
        .update(update)
        .eq("id", canvasId)
        .select("is_public, public_slug")
        .single();
      if (error) throw error;
      setState({
        is_public: !!data?.is_public,
        public_slug: (data?.public_slug as string | null) ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  const shareUrl =
    state?.is_public && state.public_slug
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/canvas/${state.public_slug}`
      : "";

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-900/10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Share canvas</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-slate-300" />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                {state?.is_public ? (
                  <Globe size={16} className="text-blue-500" />
                ) : (
                  <Lock size={16} className="text-slate-400" />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {state?.is_public ? "Anyone with the link" : "Private"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {state?.is_public
                      ? "Read-only view, no login required"
                      : "Only you can see this canvas"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => togglePublic(!state?.is_public)}
                disabled={busy}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                  state?.is_public
                    ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                {busy ? "…" : state?.is_public ? "Make private" : "Publish"}
              </button>
            </div>

            {state?.is_public && shareUrl && (
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-transparent px-1 text-xs text-slate-700 outline-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  onClick={copy}
                  className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}

            {error && (
              <p className="mt-2 text-xs text-red-500">{error}</p>
            )}

            <p className="mt-3 text-xs text-slate-400">
              Shared canvases render beautifully on mobile — perfect for
              pasting in Slack, WhatsApp, or DMs.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
