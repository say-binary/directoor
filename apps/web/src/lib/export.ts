"use client";

import type { Editor } from "tldraw";

/**
 * Export the current canvas as PNG.
 * Uses tldraw's built-in export, which renders to a canvas element.
 *
 * In tldraw v3+, editor.toImage returns `{ blob, width, height }`,
 * not a raw Blob — we unwrap it for the file download.
 */
export async function exportAsPng(editor: Editor): Promise<void> {
  const shapeIds = editor.getCurrentPageShapeIds();
  if (shapeIds.size === 0) {
    alert("Nothing to export — add some shapes first.");
    return;
  }

  const result = await editor.toImage([...shapeIds], {
    format: "png",
    background: true,
    padding: 32,
    scale: 2,
  });

  if (!result?.blob) return;
  downloadBlob(result.blob, "directoor-canvas.png");
}

/**
 * Export the current canvas as SVG.
 */
export async function exportAsSvg(editor: Editor): Promise<void> {
  const shapeIds = editor.getCurrentPageShapeIds();
  if (shapeIds.size === 0) {
    alert("Nothing to export — add some shapes first.");
    return;
  }

  const result = await editor.toImage([...shapeIds], {
    format: "svg",
    background: true,
    padding: 32,
  });

  if (!result?.blob) return;
  downloadBlob(result.blob, "directoor-canvas.svg");
}

/**
 * Copy the current canvas as a PNG to the system clipboard.
 * Used by the toolbar copy button — falls back to download if the
 * Clipboard API doesn't support image writes (Safari < 16, etc.).
 */
export async function copyCanvasToClipboard(editor: Editor): Promise<boolean> {
  const shapeIds = editor.getCurrentPageShapeIds();
  if (shapeIds.size === 0) return false;

  const result = await editor.toImage([...shapeIds], {
    format: "png",
    background: true,
    padding: 32,
    scale: 2,
  });
  if (!result?.blob) return false;

  // Try the Clipboard API first.
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": result.blob }),
      ]);
      return true;
    } catch {
      // Fall through to download
    }
  }

  // Fallback: trigger a download instead.
  downloadBlob(result.blob, "directoor-canvas.png");
  return true;
}

/** Helper to download a blob as a file */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
