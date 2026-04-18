"use client";

import type { Editor } from "tldraw";
import type { AnimationRegionData } from "@/components/animation/AnimationRegion";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

/**
 * Animation export pipeline.
 *
 * For each step in `region.sequence`:
 *   1. Update shape opacities so only the revealed-so-far shapes are visible
 *   2. Render the region's bounding box to a PNG bitmap via editor.toImage
 *   3. Push that bitmap into the encoder for `stepDurationMs` ms
 *
 * After encoding, opacities are restored to their original values.
 *
 * Two encoders are exposed:
 *   - exportRegionAsGif  → uses gifenc (no worker, ESM)
 *   - exportRegionAsWebm → uses MediaRecorder on a hidden canvas (no deps)
 *
 * Both download the result via a synthetic anchor click.
 */

interface ExportOptions {
  stepDurationMs: number;
  loop: boolean;
  onProgress?: (frac: number) => void;
}

const PADDING = 24;
const SCALE = 2;
const MAX_WIDTH = 1280;

async function captureFrames(
  editor: Editor,
  region: AnimationRegionData,
  opts: ExportOptions,
): Promise<{ bitmaps: ImageBitmap[]; widthPx: number; heightPx: number; frameDelayMs: number }> {
  const shapeIds = region.shapeIds;
  if (shapeIds.length === 0) throw new Error("Region has no shapes");
  if (region.sequence.length === 0) throw new Error("Region has no sequence");

  // Snapshot original opacities
  const originalOpacity = new Map<string, number>();
  for (const id of shapeIds) {
    const s = editor.getShape(id);
    if (s) originalOpacity.set(id, (s as { opacity?: number }).opacity ?? 1);
  }

  const setOpacity = (id: typeof shapeIds[number], op: number) => {
    const s = editor.getShape(id);
    if (s) editor.updateShape({ id, type: s.type, opacity: op });
  };

  const restoreAll = () => {
    for (const id of shapeIds) {
      const s = editor.getShape(id);
      if (s) editor.updateShape({ id, type: s.type, opacity: originalOpacity.get(id) ?? 1 });
    }
  };

  const bitmaps: ImageBitmap[] = [];
  let widthPx = 0;
  let heightPx = 0;

  try {
    const totalSteps = region.sequence.length;
    for (let step = 0; step < totalSteps; step++) {
      // Reveal up to and including step `step`
      const reveal = new Set(region.sequence.slice(0, step + 1));
      for (let i = 0; i < shapeIds.length; i++) {
        const oneBased = i + 1;
        setOpacity(shapeIds[i]!, reveal.has(oneBased) ? 1 : 0);
      }

      // Force tldraw to flush pending edits before rendering
      await new Promise(requestAnimationFrame);

      const result = await editor.toImage(shapeIds as never, {
        format: "png",
        background: true,
        padding: PADDING,
        scale: SCALE,
      });
      if (!result?.blob) throw new Error("Failed to render frame");

      // Cap width to keep file size sane
      const naturalW = result.width ?? 0;
      const naturalH = result.height ?? 0;
      let targetW = naturalW;
      let targetH = naturalH;
      if (naturalW > MAX_WIDTH) {
        targetW = MAX_WIDTH;
        targetH = Math.round(naturalH * (MAX_WIDTH / naturalW));
      }

      const bitmap = await createImageBitmap(result.blob, {
        resizeWidth: targetW,
        resizeHeight: targetH,
        resizeQuality: "high",
      });
      bitmaps.push(bitmap);
      widthPx = bitmap.width;
      heightPx = bitmap.height;

      opts.onProgress?.((step + 1) / (totalSteps * 2));
    }
  } finally {
    restoreAll();
  }

  return { bitmaps, widthPx, heightPx, frameDelayMs: opts.stepDurationMs };
}

export async function exportRegionAsGif(
  editor: Editor,
  region: AnimationRegionData,
  opts: ExportOptions,
): Promise<void> {
  const { bitmaps, widthPx, heightPx, frameDelayMs } = await captureFrames(editor, region, opts);

  const gif = GIFEncoder();
  const offscreen = new OffscreenCanvas(widthPx, heightPx);
  const ctx = offscreen.getContext("2d", { willReadFrequently: true })!;

  for (let i = 0; i < bitmaps.length; i++) {
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.drawImage(bitmaps[i]!, 0, 0);
    const imgData = ctx.getImageData(0, 0, widthPx, heightPx);
    const palette = quantize(imgData.data, 256);
    const indexed = applyPalette(imgData.data, palette);
    gif.writeFrame(indexed, widthPx, heightPx, {
      palette,
      delay: frameDelayMs,
      // Repeat loop count: 0 = forever, -1 = play once
      repeat: opts.loop ? 0 : -1,
    });
    opts.onProgress?.(0.5 + (i + 1) / (bitmaps.length * 2));
    bitmaps[i]!.close();
  }
  gif.finish();

  // Copy into a fresh ArrayBuffer to satisfy strict BlobPart typing
  // (gifenc returns Uint8Array<ArrayBufferLike>, Blob wants ArrayBuffer)
  const bytes = gif.bytes();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: "image/gif" });
  download(blob, `directoor-animation-${region.id}.gif`);
}

export async function exportRegionAsWebm(
  editor: Editor,
  region: AnimationRegionData,
  opts: ExportOptions,
): Promise<void> {
  const { bitmaps, widthPx, heightPx, frameDelayMs } = await captureFrames(editor, region, opts);

  // Build via MediaRecorder on a captured canvas stream
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d")!;
  const stream = canvas.captureStream(0); // 0 = manual frame requests
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack & {
    requestFrame?: () => void;
  };

  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";

  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start();

  // Push each frame for `stepDurationMs`
  const drawFrame = (i: number) => {
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.drawImage(bitmaps[i]!, 0, 0);
    track.requestFrame?.();
  };

  for (let i = 0; i < bitmaps.length; i++) {
    drawFrame(i);
    await new Promise((r) => setTimeout(r, frameDelayMs));
    opts.onProgress?.(0.5 + (i + 1) / (bitmaps.length * 2));
  }

  recorder.stop();
  await stopped;
  for (const b of bitmaps) b.close();

  const blob = new Blob(chunks, { type: mime });
  download(blob, `directoor-animation-${region.id}.webm`);
}

/**
 * exportRegionAsSlides — exports each animation step as a self-contained
 * HTML slideshow file that supports arrow-key navigation.
 *
 * The HTML file embeds all frames as base64 data-URIs, so it works
 * offline and can be opened in any browser. Pressing the right arrow
 * key (or clicking) advances to the next frame — identical behaviour
 * to presenting a PowerPoint deck in Slide Show mode.
 *
 * The user can also import the individual slide images into PowerPoint:
 *   Insert → Photo Album → add each PNG as a new slide.
 */
export async function exportRegionAsSlides(
  editor: Editor,
  region: AnimationRegionData,
  opts: ExportOptions,
): Promise<void> {
  const { bitmaps, widthPx, heightPx } = await captureFrames(editor, region, opts);

  // Convert each ImageBitmap → PNG data-URI (for embedding in HTML)
  const offscreen = new OffscreenCanvas(widthPx, heightPx);
  const ctx = offscreen.getContext("2d")!;
  const dataUrls: string[] = [];

  for (let i = 0; i < bitmaps.length; i++) {
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.drawImage(bitmaps[i]!, 0, 0);
    const blob = await offscreen.convertToBlob({ type: "image/png" });
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    dataUrls.push(dataUrl);
    bitmaps[i]!.close();
    opts.onProgress?.((i + 1) / bitmaps.length);
  }

  // Build a minimal self-contained HTML slideshow
  const total = dataUrls.length;
  const slidesJson = JSON.stringify(dataUrls);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Directoor Animation (${total} steps)</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #1e293b;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    font-family: system-ui, sans-serif;
    color: #94a3b8;
    user-select: none;
  }
  #slide {
    max-width: 95vw;
    max-height: 85vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.5);
    cursor: pointer;
  }
  #counter {
    margin-top: 16px;
    font-size: 13px;
    letter-spacing: 0.05em;
  }
  #hint {
    margin-top: 6px;
    font-size: 11px;
    opacity: 0.55;
  }
</style>
</head>
<body>
<img id="slide" src="" alt="Animation slide" />
<div id="counter"></div>
<div id="hint">Click or press → to advance · ← to go back</div>
<script>
const slides = ${slidesJson};
let idx = 0;
const img = document.getElementById('slide');
const counter = document.getElementById('counter');
function show(i) {
  idx = Math.max(0, Math.min(slides.length - 1, i));
  img.src = slides[idx];
  counter.textContent = 'Step ' + (idx + 1) + ' / ' + slides.length;
}
show(0);
document.addEventListener('keydown', function(e) {
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); show(idx + 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
});
img.addEventListener('click', function() { show(idx + 1); });
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  download(blob, `directoor-slides-${region.id}.html`);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
