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
    // We emit ONE blank frame first (all shapes hidden), then one frame
    // per step in the sequence. That matches the on-canvas playback,
    // which starts from an empty stage and reveals shape-by-shape on
    // each step. Without the blank frame, the exported GIF/WebM/HTML
    // would start already showing step 1 instead of showing the "before"
    // state — a subtle UX regression the user called out.
    const totalFrames = region.sequence.length + 1;
    for (let step = 0; step < totalFrames; step++) {
      // Frame 0 = blank (revealCount = 0), Frame k = reveal sequence[0..k-1]
      const revealCount = step; // 0 on first pass → empty set
      const reveal = new Set(region.sequence.slice(0, revealCount));
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

      opts.onProgress?.((step + 1) / (totalFrames * 2));
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
 * exportRegionAsSlides — exports ONE animation region as a
 * self-contained HTML slideshow whose playback mirrors the canvas:
 *   • Arrow-key navigation (→ next, ← prev)
 *   • Space / Play button: auto-advance at the exported step duration
 *   • Loop toggle (initial state from the export dialog, changeable live)
 *   • Click the slide to advance
 *
 * The file embeds every captured frame as a base64 PNG data-URI, so
 * it works offline. Only the selected region's shapes are captured
 * (see captureFrames — it calls editor.toImage(region.shapeIds…)),
 * so the output is cleanly cropped to that region.
 *
 * Individual frames can also be extracted from the HTML and imported
 * into PowerPoint via Insert → Photo Album, if slide-deck workflow
 * is preferred over live HTML playback.
 */
export async function exportRegionAsSlides(
  editor: Editor,
  region: AnimationRegionData,
  opts: ExportOptions,
): Promise<void> {
  const { bitmaps, widthPx, heightPx, frameDelayMs } = await captureFrames(editor, region, opts);

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

  const total = dataUrls.length;
  const slidesJson = JSON.stringify(dataUrls);
  const initialLoop = opts.loop ? "true" : "false";
  // Step duration for auto-play — reuse the same delay the GIF/WebM
  // exports use so the three formats are perceptually identical.
  const stepMs = Math.max(100, Math.round(frameDelayMs));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Directoor Animation (${total} steps)</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    background: #1e293b;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #cbd5e1;
    user-select: none;
    padding: 24px;
  }
  #stage {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 0;
  }
  #slide {
    max-width: 100%;
    max-height: calc(100vh - 160px);
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.5);
    cursor: pointer;
    background: #fff;
  }
  #controls {
    margin-top: 24px;
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(15, 23, 42, 0.92);
    padding: 8px 12px;
    border-radius: 999px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  }
  #controls button {
    background: transparent;
    border: none;
    color: #cbd5e1;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 15px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 120ms, color 120ms;
  }
  #controls button:hover { background: rgba(255,255,255,0.08); color: #fff; }
  #controls button.active { color: #60a5fa; background: rgba(96,165,250,0.16); }
  #playBtn.playing { color: #60a5fa; }
  #counter {
    padding: 0 10px;
    font-size: 12px;
    letter-spacing: 0.05em;
    font-variant-numeric: tabular-nums;
    color: #94a3b8;
  }
  #hint {
    margin-top: 10px;
    font-size: 11px;
    opacity: 0.55;
    text-align: center;
  }
  kbd {
    background: rgba(255,255,255,0.08);
    border-radius: 3px;
    padding: 1px 5px;
    font-family: ui-monospace, monospace;
    font-size: 10px;
  }
</style>
</head>
<body>
<div id="stage"><img id="slide" alt="Animation slide" /></div>
<div id="controls">
  <button id="prevBtn" title="Previous (←)" aria-label="Previous">&#9664;&#9664;</button>
  <button id="playBtn" title="Play / Pause (Space)" aria-label="Play">&#9654;</button>
  <button id="nextBtn" title="Next (→)" aria-label="Next">&#9654;&#9654;</button>
  <span id="counter">1 / ${total}</span>
  <button id="loopBtn" title="Toggle loop (L)" aria-label="Toggle loop">&#8635;</button>
</div>
<div id="hint">
  <kbd>&rarr;</kbd> next &middot; <kbd>&larr;</kbd> prev &middot; <kbd>Space</kbd> play/pause &middot; <kbd>L</kbd> loop
</div>
<script>
(function () {
  var slides = ${slidesJson};
  var STEP_MS = ${stepMs};
  var idx = 0;
  var playing = false;
  var looping = ${initialLoop};
  var timer = null;

  var imgEl = document.getElementById('slide');
  var counterEl = document.getElementById('counter');
  var playBtn = document.getElementById('playBtn');
  var loopBtn = document.getElementById('loopBtn');
  var prevBtn = document.getElementById('prevBtn');
  var nextBtn = document.getElementById('nextBtn');

  function render() {
    imgEl.src = slides[idx];
    counterEl.textContent = (idx + 1) + ' / ' + slides.length;
    loopBtn.classList.toggle('active', looping);
    playBtn.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
    playBtn.classList.toggle('playing', playing);
  }

  function go(i) {
    if (i < 0) i = 0;
    if (i >= slides.length) i = slides.length - 1;
    idx = i;
    render();
  }

  function next() {
    if (idx < slides.length - 1) {
      idx++;
    } else if (looping) {
      idx = 0;
    } else {
      pause();
      return;
    }
    render();
  }

  function prev() {
    if (idx > 0) idx--;
    else if (looping) idx = slides.length - 1;
    render();
  }

  function play() {
    if (playing) return;
    playing = true;
    if (idx >= slides.length - 1 && !looping) idx = 0;
    render();
    timer = setInterval(next, STEP_MS);
  }

  function pause() {
    if (!playing) return;
    playing = false;
    if (timer) { clearInterval(timer); timer = null; }
    render();
  }

  function togglePlay() { playing ? pause() : play(); }
  function toggleLoop() { looping = !looping; render(); }

  prevBtn.addEventListener('click', function () { pause(); prev(); });
  nextBtn.addEventListener('click', function () { pause(); next(); });
  playBtn.addEventListener('click', togglePlay);
  loopBtn.addEventListener('click', toggleLoop);
  imgEl.addEventListener('click', function () { pause(); next(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); pause(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); pause(); prev(); }
    else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'l' || e.key === 'L') { e.preventDefault(); toggleLoop(); }
    else if (e.key === 'Home') { e.preventDefault(); pause(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); pause(); go(slides.length - 1); }
  });

  render();
})();
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  download(blob, `directoor-animation-${region.id}.html`);
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
