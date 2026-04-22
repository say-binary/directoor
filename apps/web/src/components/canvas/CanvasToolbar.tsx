"use client";

import { useState, useEffect } from "react";
import {
  Download, Image as ImageIcon, Code, Copy, Share2, Check, Loader2, Film,
  ChevronRight, ChevronLeft,
} from "lucide-react";
import type { Editor } from "tldraw";
import { exportAsPng, exportAsSvg, copyCanvasToClipboard } from "@/lib/export";
import { COLLAPSED_CHIP_WIDTH } from "./DirectoorCanvas";

interface CanvasToolbarProps {
  editor: Editor | null;
  canvasId: string | null;
  /** True when the user is on the free tier — adds watermark to exports */
  watermark?: boolean;
  onShare?: () => void;
  onExportAnimation?: () => void;
  hasAnimation?: boolean;
}

// Bumped storage key so previous users (who had an expanded preference
// saved) also get the new collapsed-by-default behaviour.
const STORAGE_KEY = "directoor.canvasToolbar.collapsed.v2";

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
  // Default: collapsed. User can expand via the "Share" pill; their
  // preference is then persisted. Only an explicit "0" in storage
  // keeps it expanded on next load.
  const [collapsed, setCollapsed] = useState(true);

  // Restore collapsed state from localStorage (client-side only).
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "0") setCollapsed(false);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch { /* ignore */ }
  }, [collapsed]);

  // Toolbar is purely floating — it does NOT reserve layout space.
  // Position is anchored to the PAGE's right edge via the CSS variable
  // --ds-page-right-x (published by DirectoorCanvas). This way the
  // toolbar sits visually inside the white page area, not over the
  // surrounding grey desk, and canvas width is unaffected by collapse.

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

  // Anchor to the PAGE's right edge (not the viewport) via CSS var.
  // fallback 100vw means "pin to viewport right" until the var is
  // published (first paint before canvas mount).
  const floatingStyle: React.CSSProperties = {
    position: "fixed",
    top: 16,
    right: "calc(100vw - var(--ds-page-right-x, 100vw) + 16px)",
    zIndex: 9994,
  };

  // ─── Collapsed state: "Share" pill with Download icon ───────────────
  // This is the default. Single, obvious entry point for all export +
  // share actions (PNG, SVG, Copy, GIF, Share) — one click expands the
  // full toolbar. Keeps the canvas chrome out of the user's way until
  // they actually need to download or share.
  if (collapsed) {
    // Width matches the collapsed "Styles" pill in DirectoorCanvas
    // (COLLAPSED_CHIP_WIDTH) so the two chips in the right-column look
    // like equal-width siblings.
    return (
      <div
        style={{ ...floatingStyle, width: COLLAPSED_CHIP_WIDTH }}
        className="rounded-xl border border-slate-200 bg-white/95 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm"
      >
        <button
          onClick={() => setCollapsed(false)}
          title="Download / Copy / Share"
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Share2 size={13} />
          <span>Share</span>
          <ChevronLeft size={12} className="text-slate-400" />
        </button>
      </div>
    );
  }

  // ─── Expanded state: full toolbar ───────────────────────────────────
  return (
    <div
      style={floatingStyle}
      className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 px-1.5 py-1 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm"
    >
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
