"use client";

import type { Editor } from "tldraw";

/**
 * Canvas exporters. PNG/SVG come straight from tldraw.toImage; on the
 * free tier we composite a small "Made with Directoor" watermark in
 * the bottom-right corner of PNGs (SVG gets a text element instead).
 */

export interface ExportOpts {
  /** Apply the free-tier watermark */
  watermark?: boolean;
}

/**
 * Export the current canvas as PNG.
 */
export async function exportAsPng(editor: Editor, opts: ExportOpts = {}): Promise<void> {
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
  const finalBlob = opts.watermark
    ? await applyPngWatermark(result.blob)
    : result.blob;
  downloadBlob(finalBlob, "directoor-canvas.png");
}

/**
 * Export the current canvas as SVG.
 */
export async function exportAsSvg(editor: Editor, opts: ExportOpts = {}): Promise<void> {
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
  const finalBlob = opts.watermark
    ? await applySvgWatermark(result.blob)
    : result.blob;
  downloadBlob(finalBlob, "directoor-canvas.svg");
}

/**
 * Copy the current canvas as a PNG to the system clipboard.
 */
export async function copyCanvasToClipboard(editor: Editor, opts: ExportOpts = {}): Promise<boolean> {
  const shapeIds = editor.getCurrentPageShapeIds();
  if (shapeIds.size === 0) return false;

  const result = await editor.toImage([...shapeIds], {
    format: "png",
    background: true,
    padding: 32,
    scale: 2,
  });
  if (!result?.blob) return false;

  const finalBlob = opts.watermark
    ? await applyPngWatermark(result.blob)
    : result.blob;

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": finalBlob }),
      ]);
      return true;
    } catch {
      // Fall through to download
    }
  }
  downloadBlob(finalBlob, "directoor-canvas.png");
  return true;
}

// ─── Watermark helpers ─────────────────────────────────────

const WATERMARK_TEXT = "Made with Directoor";

async function applyPngWatermark(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0);

    // Watermark: small pill in bottom-right corner
    const fontSize = Math.max(11, Math.round(bitmap.width / 80));
    ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
    const padX = Math.round(fontSize * 0.8);
    const padY = Math.round(fontSize * 0.5);
    const textW = ctx.measureText(WATERMARK_TEXT).width;
    const pillW = textW + padX * 2;
    const pillH = fontSize + padY * 2;
    const x = bitmap.width - pillW - 16;
    const y = bitmap.height - pillH - 16;
    const r = pillH / 2;

    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    roundedRect(ctx, x, y, pillW, pillH, r);
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "middle";
    ctx.fillText(WATERMARK_TEXT, x + padX, y + pillH / 2 + 1);

    bitmap.close();
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? blob), "image/png"),
    );
  } catch {
    return blob;
  }
}

async function applySvgWatermark(blob: Blob): Promise<Blob> {
  try {
    const text = await blob.text();
    // Inject a <text> right before </svg>. We don't know the viewBox
    // perfectly, so anchor relative to bottom-right via text-anchor and
    // dominant-baseline.
    const insert = `\n  <g style="font-family:Inter,system-ui,sans-serif;font-size:11px;">\n    <rect x="98%" y="98%" width="0" height="0"/>\n    <text x="98%" y="98%" text-anchor="end" dominant-baseline="text-after-edge" fill="#0F172A" opacity="0.7">${WATERMARK_TEXT}</text>\n  </g>\n`;
    const out = text.includes("</svg>")
      ? text.replace("</svg>", `${insert}</svg>`)
      : text;
    return new Blob([out], { type: "image/svg+xml" });
  } catch {
    return blob;
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

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
