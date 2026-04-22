"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, Type, ImageIcon, X as CloseIcon } from "lucide-react";
import type { Editor } from "tldraw";
import { createShapeId } from "tldraw";

/**
 * DirectoorMediaImport — floating button that sits to the RIGHT of the
 * DirectoorShapePicker (on the same baseline as tldraw's bottom toolbar
 * buttons). Opens a compact popup with two entries:
 *
 *   • Text   — arms a "click-to-drop" mode; the next click on the canvas
 *              creates a directoor-text shape at that point and
 *              immediately enters edit mode so the user can start typing.
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

type ArmedKind = "text" | null;

export function DirectoorMediaImport({ editor }: DirectoorMediaImportProps) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState<ArmedKind>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  // ─── Armed "text" mode: next canvas click creates a text shape ─────
  useEffect(() => {
    if (armed !== "text" || !editor) return;

    const container = document.querySelector(".tldraw-container");
    if (!container) return;

    const handlePointerDown = (e: Event) => {
      const pe = e as PointerEvent;
      if (pe.button !== 0) return;
      const target = pe.target as HTMLElement;
      if (!target.closest(".tl-canvas")) return;
      if (target.closest(".directoor-media-import-popup")) return;
      if (target.closest(".directoor-media-import-armed-pill")) return;

      pe.preventDefault();
      pe.stopPropagation();

      const pagePoint = editor.screenToPage({ x: pe.clientX, y: pe.clientY });
      const W = 400;
      const H = 120;
      const id = createShapeId();
      editor.markHistoryStoppingPoint("Add text");
      editor.createShape({
        id,
        type: "directoor-text",
        x: pagePoint.x - W / 2,
        y: pagePoint.y - H / 2,
        props: {
          w: W,
          h: H,
          text: "",
          color: "#0F172A",
          size: "m",
          weight: "normal",
          align: "left",
          background: "none",
          contentType: "prose",
        },
      });
      // Jump straight into edit mode so the user can start typing.
      setTimeout(() => {
        editor.select(id);
        editor.setEditingShape(id);
      }, 50);
      setArmed(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setArmed(null);
      }
    };

    container.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [armed, editor]);

  // Body cursor while armed, so the user sees they're in "place mode".
  useEffect(() => {
    if (!armed) return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = "crosshair";
    return () => { document.body.style.cursor = prev; };
  }, [armed]);

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
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
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

  const armText = useCallback(() => {
    setOpen(false);
    setArmed("text");
  }, []);

  const disarm = useCallback(() => setArmed(null), []);

  if (!pos) return null;

  return (
    <>
      {/* Hidden file input for image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
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
              onClick={armText}
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

      {/* Armed pill (Text mode only — Image triggers immediately) */}
      {armed === "text" &&
        createPortal(
          <div
            className="directoor-media-import-armed-pill"
            style={{
              position: "fixed",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 9996,
              background: "#1e293b",
              color: "white",
              borderRadius: 999,
              padding: "6px 10px 6px 12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              fontWeight: 500,
              boxShadow: "0 4px 16px rgba(15,23,42,0.25)",
              pointerEvents: "all",
            }}
          >
            <span>Click canvas to place <b>Text</b></span>
            <button
              onClick={disarm}
              title="Cancel (Esc)"
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.15)",
                color: "white",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <CloseIcon size={11} />
            </button>
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
