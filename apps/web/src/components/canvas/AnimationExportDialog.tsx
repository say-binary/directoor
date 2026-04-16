"use client";

import { useState } from "react";
import { X, Loader2, Film, Image as ImageIcon, Download } from "lucide-react";
import type { Editor } from "tldraw";
import type { AnimationRegionData } from "../animation/AnimationRegion";
import { exportRegionAsGif, exportRegionAsWebm } from "@/lib/animation-export";

interface AnimationExportDialogProps {
  editor: Editor;
  regions: AnimationRegionData[];
  onClose: () => void;
}

/**
 * AnimationExportDialog — pick a region and a format (GIF or WebM),
 * then render the animation client-side and trigger a download. The
 * heavy lifting (frame capture + encoding) lives in lib/animation-export.
 *
 * GIF uses gif.js (worker-based, MIT). WebM uses MediaRecorder on a
 * canvas — it ships in every evergreen browser and produces small files
 * suitable for Slack uploads.
 */
export function AnimationExportDialog({ editor, regions, onClose }: AnimationExportDialogProps) {
  const [regionId, setRegionId] = useState<string | null>(regions[0]?.id ?? null);
  const [format, setFormat] = useState<"gif" | "webm">("gif");
  const [stepDuration, setStepDuration] = useState(800);
  const [loop, setLoop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const region = regions.find((r) => r.id === regionId) ?? null;

  const handleExport = async () => {
    if (!region) return;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      if (format === "gif") {
        await exportRegionAsGif(editor, region, {
          stepDurationMs: stepDuration,
          loop,
          onProgress: setProgress,
        });
      } else {
        await exportRegionAsWebm(editor, region, {
          stepDurationMs: stepDuration,
          loop,
          onProgress: setProgress,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-900/10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Export animation</h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        {regions.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-slate-400">
            No animation regions yet. Select shapes and click <b>Animate</b> first.
          </p>
        ) : (
          <>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Region</span>
              <select
                value={regionId ?? ""}
                onChange={(e) => setRegionId(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-300"
              >
                {regions.map((r, i) => (
                  <option key={r.id} value={r.id}>
                    Region {i + 1} ({r.shapeIds.length} shapes, {r.sequence.length} steps)
                  </option>
                ))}
              </select>
            </label>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormat("gif")}
                disabled={busy}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  format === "gif"
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <ImageIcon size={13} />
                GIF
              </button>
              <button
                onClick={() => setFormat("webm")}
                disabled={busy}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  format === "webm"
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Film size={13} />
                WebM
              </button>
            </div>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                Step duration: {stepDuration}ms
              </span>
              <input
                type="range"
                min={200}
                max={2000}
                step={100}
                value={stepDuration}
                onChange={(e) => setStepDuration(Number(e.target.value))}
                disabled={busy}
                className="w-full accent-blue-500"
              />
            </label>

            <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={loop}
                onChange={(e) => setLoop(e.target.checked)}
                disabled={busy}
                className="accent-blue-500"
              />
              Loop forever {format === "webm" && <span className="text-xs text-slate-400">(WebM ignores loop flag — repeat in browser)</span>}
            </label>

            {busy ? (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-600">
                <Loader2 size={14} className="animate-spin" />
                Rendering… {Math.round(progress * 100)}%
              </div>
            ) : (
              <button
                onClick={handleExport}
                disabled={!region}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
              >
                <Download size={14} />
                Export {format.toUpperCase()}
              </button>
            )}

            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
