"use client";

import type { Editor } from "tldraw";

/**
 * Export the current canvas as PNG.
 * Uses tldraw's built-in export, which renders to a canvas element.
 */
export async function exportAsPng(editor: Editor): Promise<void> {
  const shapeIds = editor.getCurrentPageShapeIds();
  if (shapeIds.size === 0) {
    alert("Nothing to export — add some shapes first.");
    return;
  }

  const blob = await editor.toImage([...shapeIds], {
    format: "png",
    background: true,
    padding: 32,
    scale: 2,
  });

  if (!blob) return;
  downloadBlob(blob, "directoor-canvas.png");
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

  const blob = await editor.toImage([...shapeIds], {
    format: "svg",
    background: true,
    padding: 32,
  });

  if (!blob) return;
  downloadBlob(blob, "directoor-canvas.svg");
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
