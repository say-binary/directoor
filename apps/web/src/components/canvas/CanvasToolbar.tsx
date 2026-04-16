"use client";

import { useState } from "react";
import { Download, Image as ImageIcon, Code, Copy, Share2, Check, Loader2, Film } from "lucide-react";
import type { Editor } from "tldraw";
import { exportAsPng, exportAsSvg, copyCanvasToClipboard } from "@/lib/export";

interface CanvasToolbarProps {
  editor: Editor | null;
  canvasId: string | null;
  onShare?: () => void;
  onExportAnimation?: () => void;
  hasAnimation?: boolean;
}

/**
 * CanvasToolbar — floating toolbar pinned to the top-right of the
 * canvas. Houses export (PNG / SVG / Copy), share, and animation export
 * buttons. Each action is independent — the toolbar carries no business
 * state of its own.
 */
export function CanvasToolbar({
  editor,
  onShare,
  onExportAnimation,
  hasAnimation,
}: CanvasToolbarProps) {
  const [busy, setBusy] = useState<null | "png" | "svg" | "copy">(null);
  const [justCopied, setJustCopied] = useState(false);

  const handlePng = async () => {
    if (!editor) return;
    setBusy("png");
    try { await exportAsPng(editor); } finally { setBusy(null); }
  };
  const handleSvg = async () => {
    if (!editor) return;
    setBusy("svg");
    try { await exportAsSvg(editor); } finally { setBusy(null); }
  };
  const handleCopy = async () => {
    if (!editor) return;
    setBusy("copy");
    try {
      const ok = await copyCanvasToClipboard(editor);
      if (ok) {
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 1400);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed right-4 top-4 z-[9994] flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 px-1.5 py-1 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm">
      <ToolbarButton
        onClick={handlePng}
        disabled={!editor || busy !== null}
        loading={busy === "png"}
        icon={<ImageIcon size={15} />}
        label="PNG"
        title="Download as PNG"
      />
      <ToolbarButton
        onClick={handleSvg}
        disabled={!editor || busy !== null}
        loading={busy === "svg"}
        icon={<Code size={15} />}
        label="SVG"
        title="Download as SVG"
      />
      <ToolbarButton
        onClick={handleCopy}
        disabled={!editor || busy !== null}
        loading={busy === "copy"}
        icon={justCopied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />}
        label={justCopied ? "Copied!" : "Copy"}
        title="Copy canvas image to clipboard"
      />

      {hasAnimation && onExportAnimation && (
        <>
          <div className="mx-0.5 h-5 w-px bg-slate-200" />
          <ToolbarButton
            onClick={onExportAnimation}
            disabled={!editor}
            icon={<Film size={15} />}
            label="GIF"
            title="Export animation as GIF"
          />
        </>
      )}

      {onShare && (
        <>
          <div className="mx-0.5 h-5 w-px bg-slate-200" />
          <ToolbarButton
            onClick={onShare}
            icon={<Share2 size={15} />}
            label="Share"
            title="Share this canvas with a public link"
            primary
          />
        </>
      )}
    </div>
  );
}

function ToolbarButton({
  onClick,
  disabled,
  loading,
  icon,
  label,
  title,
  primary,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon: React.ReactNode;
  label: string;
  title: string;
  primary?: boolean;
}) {
  const base = "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const styles = primary
    ? "bg-blue-500 text-white hover:bg-blue-600"
    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${styles}`}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// Re-export so consumers can drop a custom Download glyph
export { Download };
