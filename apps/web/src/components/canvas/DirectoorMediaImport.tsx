"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, Type, ImageIcon } from "lucide-react";
import type { Editor } from "tldraw";
import { createShapeId } from "tldraw";

/**
 * DirectoorMediaImport — floating button that sits to the RIGHT of the
 * DirectoorShapePicker (on the same baseline as tldraw's bottom toolbar
 * buttons). Opens a compact popup with two entries:
 *
 *   • Text   — opens a file picker for .txt/.md/.csv/.json/.log/.ts/.js
 *              files; reads the selected file's contents into a new
 *              directoor-text shape at the viewport centre.
 *   • Image  — opens a native file picker; reads the chosen file as a
 *              data-URL and creates a directoor-image shape at the
 *              centre of the current viewport.
 *
 * The native tldraw "asset" (image upload) button is hidden via CSS
 * (rules live in globals.css) so users have exactly ONE place to import
 * media from — this button.
 *
 * Styling (button + popup) mirrors DirectoorShapePicker so both floating
 * buttons read as a matching pair on the toolbar strip.
 */

interface DirectoorMediaImportProps {
  editor: Editor | null;
}

export function DirectoorMediaImport({ editor }: DirectoorMediaImportProps) {
  const [open, setOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  // ─── Position against tldraw's bottom toolbar ───────────────────────
  // Mirror DirectoorShapePicker but offset one button-width + gap so we
  // sit just to the right of it. We read the live button height from a
  // sample .tlui-button__tool so our pill matches tldraw's theme.
  const [pos, setPos] = useState<{ left: number; top: number; size: number } | null>(null);
  useEffect(() => {
    const update = () => {
      const toolbar = document.querySelector(".tlui-toolbar__inner");
      if (!toolbar) return;
      const sampleBtn = toolbar.querySelector<HTMLElement>(".tlui-button__tool, .tlui-button");
      const btnRect = sampleBtn?.getBoundingClientRect();
      const barRect = toolbar.getBoundingClientRect();
      const size = btnRect?.height ?? 40;
      const top = btnRect ? btnRect.top : barRect.top + (barRect.height - size) / 2;
      // Shape picker sits at (barRect.right + 6) with width=size.
      // We sit after it: + size + 6 more px.
      setPos({
        left: barRect.right + 6 + size + 6,
        top,
        size,
      });
    };
    update();
    const id = setInterval(update, 300);
    window.addEventListener("resize", update);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Close popup on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".directoor-media-import-popup")) return;
      if (target.closest(".directoor-media-import-button")) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // ─── Image upload ──────────────────────────────────────────────────
  const openImagePicker = useCallback(() => {
    setOpen(false);
    imageInputRef.current?.click();
  }, []);

  const handleImageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // reset so the same file can be re-selected
      if (!file || !editor) return;
      if (!file.type.startsWith("image/")) {
        alert("Please choose an image file.");
        return;
      }

      // Read as data-URL so the image is self-contained in the saved
      // canvas payload (no external hosting dependency).
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      // Measure the natural image dimensions so we can pick a sensible
      // initial size without squashing the aspect ratio.
      const { width: naturalW, height: naturalH } = await new Promise<{
        width: number; height: number;
      }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 320, height: 240 });
        img.src = dataUrl;
      });

      const aspect = naturalW > 0 && naturalH > 0 ? naturalW / naturalH : 4 / 3;
      const w = Math.min(320, naturalW || 320);
      const h = Math.round(w / aspect);

      // Place at the centre of the current viewport.
      const vp = editor.getViewportPageBounds();
      const x = vp.x + vp.w / 2 - w / 2;
      const y = vp.y + vp.h / 2 - h / 2;

      const id = createShapeId();
      editor.markHistoryStoppingPoint("Import image");
      editor.createShape({
        id,
        type: "directoor-image",
        x, y,
        props: {
          w, h,
          src: dataUrl,
          alt: file.name,
          caption: "",
          sourceUrl: "",
          naturalAspect: aspect,
        },
      });
      editor.select(id);
    },
    [editor],
  );

  // ─── Text file import ──────────────────────────────────────────────
  const openTextPicker = useCallback(() => {
    setOpen(false);
    textInputRef.current?.click();
  }, []);

  const handleTextChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !editor) return;

      // Accept text-ish files up to ~1 MB. Bigger than that likely
      // isn't useful to paste into a canvas text shape.
      const MAX_BYTES = 1_000_000;
      if (file.size > MAX_BYTES) {
        alert(`File is too large (${Math.round(file.size / 1024)} KB). Max 1000 KB.`);
        return;
      }

      const text = await file.text();

      // Size the text shape based on rough content length so short
      // snippets don't get a huge empty box and long docs scroll.
      const lineCount = text.split("\n").length;
      const maxLineLen = text.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
      const W = Math.min(720, Math.max(300, maxLineLen * 8));
      const H = Math.min(600, Math.max(120, lineCount * 22));

      // Place at the centre of the current viewport.
      const vp = editor.getViewportPageBounds();
      const x = vp.x + vp.w / 2 - W / 2;
      const y = vp.y + vp.h / 2 - H / 2;

      const id = createShapeId();
      editor.markHistoryStoppingPoint(`Import text · ${file.name}`);
      editor.createShape({
        id,
        type: "directoor-text",
        x, y,
        props: {
          w: W,
          h: H,
          text,
          color: "#0F172A",
          size: "m",
          weight: "normal",
          align: "left",
          background: "none",
          contentType: "prose",
        },
      });
      editor.select(id);
    },
    [editor],
  );

  if (!pos) return null;

  return (
    <>
      {/* Hidden file inputs — one for images, one for text files */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageChange}
        style={{ display: "none" }}
      />
      <input
        ref={textInputRef}
        type="file"
        // Broad text-ish MIME + common extensions. `text/*` covers
        // .txt/.md/.csv/.log/.html/.xml; the explicit list after it
        // picks up source files that some OSes don't label as text.
        accept="text/*,.md,.markdown,.csv,.json,.log,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.rb,.sh,.yml,.yaml,.toml,.ini,.html,.xml,.sql"
        onChange={handleTextChange}
        style={{ display: "none" }}
      />

      {/* Trigger button — same dimensions/shadow/border as ShapePicker */}
      <button
        ref={anchorRef}
        onClick={() => setOpen((v) => !v)}
        className="directoor-media-import-button"
        title="Import text or image"
        style={{
          position: "fixed",
          left: pos.left,
          top: pos.top,
          zIndex: 9994,
          width: pos.size,
          height: pos.size,
          borderRadius: 8,
          background: open ? "#3B82F6" : "white",
          color: open ? "white" : "#334155",
          border: "1px solid #E2E8F0",
          boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "background 120ms, color 120ms",
          padding: 0,
        }}
      >
        <Upload size={Math.round(pos.size * 0.45)} />
      </button>

      {/* Popup — 2 large tiles side-by-side */}
      {open &&
        createPortal(
          <div
            className="directoor-media-import-popup"
            style={{
              position: "fixed",
              left: pos.left,
              bottom: window.innerHeight - pos.top + 8,
              zIndex: 9995,
              background: "white",
              borderRadius: 12,
              boxShadow:
                "0 8px 32px rgba(15,23,42,0.16), 0 2px 8px rgba(15,23,42,0.06)",
              padding: 8,
              display: "grid",
              gridTemplateColumns: "repeat(2, 92px)",
              gap: 4,
            }}
          >
            <MediaTile
              label="Text"
              onClick={openTextPicker}
              icon={<Type size={22} strokeWidth={2} />}
            />
            <MediaTile
              label="Image"
              onClick={openImagePicker}
              icon={<ImageIcon size={22} strokeWidth={2} />}
            />
          </div>,
          document.body,
        )}

    </>
  );
}

function MediaTile({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: 92,
        height: 72,
        borderRadius: 8,
        background: "transparent",
        border: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        cursor: "pointer",
        transition: "background 120ms",
        padding: 4,
        color: "#334155",
        fontSize: 11,
        fontWeight: 500,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#F1F5F9"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
