"use client";

import { useState } from "react";
import { Trash2, Search, ImageOff } from "lucide-react";
import type { Editor } from "tldraw";
import { createShapeId } from "tldraw";
import { useImageLibrary, imageLibrary } from "@/lib/image-library";

interface ImageLibraryPanelProps {
  editor: Editor | null;
}

const MAX_DROP_WIDTH = 320;

/**
 * ImageLibraryPanel — sidebar tab listing every image the user has
 * pulled onto a canvas via the inline command bar. Click a thumbnail
 * to drop it on the current canvas centered in the viewport (undoable).
 * Drag the thumbnail to drop it at a specific spot.
 */
export function ImageLibraryPanel({ editor }: ImageLibraryPanelProps) {
  const images = useImageLibrary();
  const [filter, setFilter] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);

  const filtered = filter
    ? images.filter(
        (i) =>
          i.title.toLowerCase().includes(filter.toLowerCase()) ||
          i.query.toLowerCase().includes(filter.toLowerCase()),
      )
    : images;

  const dropAtViewportCenter = (id: string) => {
    if (!editor) return;
    const img = images.find((i) => i.id === id);
    if (!img) return;
    const aspect = img.width > 0 && img.height > 0 ? img.width / img.height : 4 / 3;
    const w = Math.min(MAX_DROP_WIDTH, img.width || MAX_DROP_WIDTH);
    const h = Math.round(w / aspect);
    const center = editor.getViewportPageBounds().center;
    editor.markHistoryStoppingPoint("Drop image from library");
    const tlId = createShapeId();
    editor.createShape({
      id: tlId,
      type: "directoor-image",
      x: center.x - w / 2,
      y: center.y - h / 2,
      props: {
        w, h,
        src: img.url,
        alt: img.title,
        caption: "",
        sourceUrl: img.source ?? "",
        naturalAspect: aspect,
      },
    });
    editor.select(tlId);
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("application/x-directoor-library-image", id);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Search filter */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
          <Search size={13} className="text-slate-400" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter images…"
            className="flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <ImageOff size={28} className="mb-2 text-slate-300" />
            <p className="text-xs text-slate-400">
              {images.length === 0
                ? "No images yet. Double-click anywhere on the canvas and ask for one."
                : "No matches for that filter."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 px-1">
            {filtered.map((img) => (
              <div
                key={img.id}
                className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50 transition-shadow hover:border-blue-300 hover:shadow-md"
                onMouseEnter={() => setHoverId(img.id)}
                onMouseLeave={() => setHoverId(null)}
                draggable
                onDragStart={(e) => onDragStart(e, img.id)}
                onClick={() => dropAtViewportCenter(img.id)}
                title={`${img.title}\n(click to add, drag to position)`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.thumbnail}
                  alt={img.title}
                  className="h-full w-full cursor-pointer object-cover"
                  draggable={false}
                />
                {hoverId === img.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      imageLibrary.remove(img.id);
                    }}
                    className="absolute right-1 top-1 rounded bg-white/90 p-1 text-red-500 shadow hover:bg-red-50"
                    title="Remove from library"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-1.5 py-1">
                  <p className="truncate text-[10px] text-white/95">{img.title || img.query}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className="border-t border-slate-100 px-3 py-2">
          <p className="text-[10px] text-slate-400">
            {images.length} image{images.length === 1 ? "" : "s"} · stored in your library
          </p>
        </div>
      )}
    </div>
  );
}
