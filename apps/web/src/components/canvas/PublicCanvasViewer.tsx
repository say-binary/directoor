"use client";

import { useEffect, useState } from "react";
import { Tldraw, type Editor } from "tldraw";
import "tldraw/tldraw.css";
import { Loader2 } from "lucide-react";
import { DIRECTOOR_SHAPE_UTILS } from "./shapes/DirectoorShapes";

interface PublicCanvasViewerProps {
  slug: string;
}

interface PublicCanvasResponse {
  id: string;
  title: string;
  canvas_state: Record<string, unknown>;
  updated_at: string;
}

/**
 * PublicCanvasViewer — anonymous, read-only viewer for a published
 * canvas. tldraw is mounted in a non-editable mode (zoom + pan only).
 *
 * Layout is mobile-friendly: a thin header on top with title + brand,
 * canvas fills the rest, and the tldraw chrome is hidden so the
 * artwork is the focus.
 */
export function PublicCanvasViewer({ slug }: PublicCanvasViewerProps) {
  const [data, setData] = useState<PublicCanvasResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public-canvas?slug=${encodeURIComponent(slug)}`);
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok || j.error) {
          setError(j.error ?? `Failed (${res.status})`);
        } else {
          setData(j as PublicCanvasResponse);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const handleMount = (editor: Editor) => {
    if (!data) return;
    const saved = data.canvas_state as Record<string, unknown> | undefined;
    if (!saved?.tldrawSnapshot) return;
    try {
      // Apply the same migrations the editor route does so old shapes load
      const snapshot = saved.tldrawSnapshot as {
        store: Record<string, { id?: string; typeName?: string; type?: string; props?: Record<string, unknown> }>;
      };
      if (snapshot?.store) {
        for (const rec of Object.values(snapshot.store)) {
          if (!rec || rec.typeName !== "shape" || !rec.props) continue;
          if (rec.type === "directoor-arrow") {
            if (rec.props.labelPosition === undefined) rec.props.labelPosition = 0.5;
            if (rec.props.label === undefined) rec.props.label = "";
          }
          if (rec.type === "directoor-text") {
            if (rec.props.contentType === undefined) {
              const w = Number(rec.props.w) || 0;
              rec.props.contentType = w > 200 ? "prose" : "inline";
            }
          }
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.store.loadStoreSnapshot(saved.tldrawSnapshot as any);
      editor.zoomToFit({ animation: { duration: 0 } });
      // Make read-only — disable all editing UI
      editor.updateInstanceState({ isReadonly: true });
    } catch (err) {
      console.warn("Public viewer load failed:", err);
    }
  };

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50 px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold text-slate-700">Canvas not found</h1>
          <p className="mt-2 text-sm text-slate-500">
            This canvas may be private or no longer shared.
          </p>
          <a
            href="/"
            className="mt-4 inline-block rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Visit Directoor
          </a>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* Mobile-friendly header */}
      <header className="flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-2.5 backdrop-blur-sm sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-slate-800 sm:text-base">
            {data.title}
          </h1>
          <p className="text-[10px] text-slate-400 sm:text-xs">
            Shared canvas · view only
          </p>
        </div>
        <a
          href="/"
          className="ml-3 shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
        >
          Made with Directoor
        </a>
      </header>

      {/* Canvas */}
      <div className="relative flex-1">
        <Tldraw
          onMount={handleMount}
          shapeUtils={DIRECTOOR_SHAPE_UTILS}
          hideUi
        />
      </div>
    </div>
  );
}
