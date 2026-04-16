"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import type { Editor } from "tldraw";
import { createShapeId } from "tldraw";
import { useImageLibrary, type LibraryImage } from "@/lib/image-library";

export interface ImageHit {
  id: string;
  thumbnail: string;
  url: string;
  width: number;
  height: number;
  title: string;
  creator?: string;
  license?: string;
  source?: string;
}

interface InlineImagePickerProps {
  editor: Editor;
  query: string;
  canvasPosition: { x: number; y: number };
  screenPosition: { x: number; y: number };
  onClose: () => void;
}

const MAX_IMAGE_WIDTH = 320;
const TILE_GAP = 16;

/**
 * InlineImagePicker — fetches top 5 web images for the user's query and
 * presents them as a floating multi-select grid anchored at the click
 * point. Selected images become DirectoorImage shapes near the anchor;
 * unselected ones disappear. Creation goes through editor.createShapes
 * inside a single mark so the entire add is undoable/redoable as one
 * step. Selected images are also pushed into the per-user image library.
 */
export function InlineImagePicker({
  editor,
  query,
  canvasPosition,
  screenPosition,
  onClose,
}: InlineImagePickerProps) {
  const [results, setResults] = useState<ImageHit[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const addToLibrary = useImageLibrary((s) => s.addMany);

  // Fetch top 5 images on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/image-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        const data = (await res.json()) as { results?: ImageHit[]; error?: string };
        if (cancelled) return;
        if (!res.ok || data.error) {
          setError(data.error ?? `Search failed (${res.status})`);
          setResults([]);
        } else {
          setResults(data.results ?? []);
          if ((data.results ?? []).length === 0) {
            setError(`No images found for "${query}"`);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Image search error:", err);
          setError("Connection error.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [query]);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter" && selected.size > 0) handleConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Click outside to close
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => window.addEventListener("mousedown", onClick), 200);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const picks = results.filter((r) => selected.has(r.id));
    if (picks.length === 0) return;

    // Lay them out left-to-right around the anchor point with a small gap.
    // Each image is sized so its width is at most MAX_IMAGE_WIDTH and its
    // aspect ratio is preserved. The cluster is centered on the anchor.
    const sized = picks.map((p) => {
      const aspect = p.width > 0 && p.height > 0 ? p.width / p.height : 4 / 3;
      const w = Math.min(MAX_IMAGE_WIDTH, p.width || MAX_IMAGE_WIDTH);
      const h = Math.round(w / aspect);
      return { ...p, w, h, aspect };
    });
    const totalW = sized.reduce((s, x) => s + x.w, 0) + TILE_GAP * (sized.length - 1);
    const startX = canvasPosition.x - totalW / 2;
    const maxH = Math.max(...sized.map((s) => s.h));
    const baseY = canvasPosition.y - maxH / 2;

    // Wrap in a single history mark so undo/redo treats this as one step.
    editor.markHistoryStoppingPoint("Add images");

    let cursorX = startX;
    const created: { id: ReturnType<typeof createShapeId>; src: string }[] = [];
    for (const s of sized) {
      const tlId = createShapeId();
      editor.createShape({
        id: tlId,
        type: "directoor-image",
        x: cursorX,
        y: baseY,
        props: {
          w: s.w,
          h: s.h,
          src: s.url,
          alt: s.title,
          caption: "",
          sourceUrl: s.source ?? "",
          naturalAspect: s.aspect,
        },
      });
      created.push({ id: tlId, src: s.url });
      cursorX += s.w + TILE_GAP;
    }

    if (created.length > 0) {
      editor.select(...created.map((c) => c.id));
    }

    // Persist to image library
    const libEntries: LibraryImage[] = picks.map((p) => ({
      id: p.id,
      url: p.url,
      thumbnail: p.thumbnail,
      title: p.title,
      width: p.width,
      height: p.height,
      creator: p.creator,
      license: p.license,
      source: p.source,
      query,
      addedAt: Date.now(),
    }));
    addToLibrary(libEntries);

    onClose();
  };

  // Position the picker beneath the click point, clamped to viewport
  const PICKER_W = 560;
  const left = Math.max(16, Math.min(screenPosition.x - PICKER_W / 2, window.innerWidth - PICKER_W - 16));
  const top = Math.min(screenPosition.y + 12, window.innerHeight - 360);

  return (
    <div
      ref={containerRef}
      className="fixed z-[9999]"
      style={{ left, top, width: PICKER_W }}
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl ring-1 ring-slate-900/5">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-medium text-slate-700">
            {loading ? `Searching for "${query}"…` : `Top results for "${query}"`}
          </p>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 size={22} className="animate-spin text-blue-400" />
          </div>
        ) : error ? (
          <p className="px-2 py-8 text-center text-xs text-slate-500">{error}</p>
        ) : (
          <>
            <div className="grid grid-cols-5 gap-2">
              {results.map((r) => {
                const isSelected = selected.has(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => toggle(r.id)}
                    className={`group relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${
                      isSelected
                        ? "border-blue-500 ring-2 ring-blue-300 ring-offset-1"
                        : "border-transparent hover:border-slate-300"
                    }`}
                    title={r.title}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.thumbnail}
                      alt={r.title}
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                    {isSelected && (
                      <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white shadow">
                        <Check size={12} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 px-1">
              <p className="text-xs text-slate-400">
                Click to select · {selected.size} chosen
              </p>
              <button
                onClick={handleConfirm}
                disabled={selected.size === 0}
                className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-blue-500"
              >
                Add {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
