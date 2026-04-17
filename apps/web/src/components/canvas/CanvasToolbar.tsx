"use client";

import { useState, useEffect } from "react";
import {
  Download, Image as ImageIcon, Code, Copy, Share2, Check, Loader2, Film,
  ChevronRight, ChevronLeft,
} from "lucide-react";
import type { Editor } from "tldraw";
import { exportAsPng, exportAsSvg, copyCanvasToClipboard } from "@/lib/export";

interface CanvasToolbarProps {
  editor: Editor | null;
  canvasId: string | null;
  /** True when the user is on the free tier — adds watermark to exports */
  watermark?: boolean;
  onShare?: () => void;
  onExportAnimation?: () => void;
  hasAnimation?: boolean;
}

const STORAGE_KEY = "directoor.canvasToolbar.collapsed";

/**
 * CanvasToolbar — floating toolbar pinned to the top-right of the
 * canvas. Houses export (PNG / SVG / Copy), share, and animation export
 * buttons.
 *
 * Collapsible: a chevron at the left of the toolbar collapses it down to
 * a tiny pill. State is persisted to localStorage so the user's choice
 * survives reloads. The toolbar publishes its current width as a CSS
 * variable (--ds-toolbar-w) so the page-edge mask leaves a gap for it
 * rather than sliding underneath.
 */
export function CanvasToolbar({
  editor,
  watermark,
  onShare,
  onExportAnimation,
  hasAnimation,
}: CanvasToolbarProps) {
  const [busy, setBusy] = useState<null | "png" | "svg" | "copy">(null);
  const [justCopied, setJustCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Restore collapsed state from localStorage (client-side only).
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "1") setCollapsed(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch { /* ignore */ }
  }, [collapsed]);

  // Publish current toolbar width as a CSS variable. The mask uses this
  // to leave a gap on the right side of the page (else it would slide
  // visually under the toolbar).
  // Width estimates include 16px right offset (right-4) + visible content.
  useEffect(() => {
    // collapsed: 36px chevron pill + 16px offset = 52px
    // expanded: ~280-360px depending on Share/GIF visibility + 16px offset
    const w = collapsed ? 52 : 360;
    document.documentElement.style.setProperty("--ds-toolbar-w", `${w}px`);
  }, [collapsed, hasAnimation, onShare]);

  const handlePng = async () => {
    if (!editor) return;
    setBusy("png");
    try { await exportAsPng(editor, { watermark }); } finally { setBusy(null); }
  };
  const handleSvg = async () => {
    if (!editor) return;
    setBusy("svg");
    try { await exportAsSvg(editor, { watermark }); } finally { setBusy(null); }
  };
  const handleCopy = async () => {
    if (!editor) return;
    setBusy("copy");
    try {
      const ok = await copyCanvasToClipboard(editor, { watermark });
      if (ok) {
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 1400);
      }
    } finally {
      setBusy(null);
    }
  };

  // ─── Collapsed state: tiny chevron pill ─────────────────────────────
  if (collapsed) {
    return (
      <div className="fixed right-4 top-4 z-[9994] rounded-xl border border-slate-200 bg-white/95 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm">
        <button
          onClick={() => setCollapsed(false)}
          title="Show toolbar"
          className="flex items-center gap-1 rounded-xl px-2.5 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <ChevronLeft size={16} />
        </button>
      </div>
    );
  }

  // ─── Expanded state: full toolbar ───────────────────────────────────
  return (
    <div className="fixed right-4 top-4 z-[9994] flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 px-1.5 py-1 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm">
      <button
        onClick={() => setCollapsed(true)}
        title="Collapse toolbar"
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <ChevronRight size={14} />
      </button>
      <div className="mx-0.5 h-5 w-px bg-slate-200" />

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
