"use client";

import { useEffect, useState } from "react";
import { useEditor, useValue } from "tldraw";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code2,
  Link as LinkIcon,
  List,
  ListOrdered,
  Type,
} from "lucide-react";

/**
 * Directoor's rich-text contextual toolbar.
 *
 * A standalone floating formatting bar anchored to the editing shape's
 * page bounds. Visible for the whole edit session — not just when a
 * range is highlighted — so users can click a format before typing,
 * the way Notion / Google Docs behave. Applied uniformly to every
 * shape that hosts rich text: the native text shape, sticky notes,
 * and directoor shape labels (database / queue / service / ...).
 * The underlying TipTap commands (bold, italic, underline, lists,
 * font size, link, …) work identically across all three so a single
 * toolbar surface is enough.
 */
export function DirectoorRichTextToolbar() {
  const editor = useEditor();
  const editingShapeId = useValue(
    "editingShapeId",
    () => editor.getEditingShapeId(),
    [editor],
  );

  if (!editingShapeId) return null;
  return <TextShapeFloatingToolbar shapeId={editingShapeId} />;
}

function TextShapeFloatingToolbar({ shapeId }: { shapeId: string }) {
  const editor = useEditor();
  const textEditor = useValue(
    "textEditor",
    () => editor.getRichTextEditor(),
    [editor],
  );

  // Track screen-space anchor. We use the shape's top-centre in page
  // coords so the toolbar can centre itself above the shape instead of
  // hanging off the left edge (which clipped out of the viewport for
  // small text shapes). Camera pan/zoom doesn't trigger React re-renders
  // in tldraw, so we poll.
  const [anchor, setAnchor] = useState<{ cx: number; top: number } | null>(null);
  useEffect(() => {
    const update = () => {
      const b = editor.getShapePageBounds(shapeId as Parameters<typeof editor.getShapePageBounds>[0]);
      if (!b) {
        setAnchor(null);
        return;
      }
      const pt = editor.pageToScreen({ x: b.x + b.w / 2, y: b.y });
      setAnchor({ cx: pt.x, top: pt.y });
    };
    update();
    const iv = setInterval(update, 150);
    return () => clearInterval(iv);
  }, [editor, shapeId]);

  // Re-render on TipTap selection / content changes so isActive() styles refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!textEditor) return;
    const kick = () => setTick((t) => t + 1);
    textEditor.on("update", kick);
    textEditor.on("selectionUpdate", kick);
    return () => {
      textEditor.off("update", kick);
      textEditor.off("selectionUpdate", kick);
    };
  }, [textEditor]);

  if (!textEditor || !anchor) return null;

  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    textEditor.isActive(name, attrs);

  const currentFontSize = ((textEditor.getAttributes("textStyle") as {
    fontSize?: string;
  }).fontSize ?? "") as string;

  // Wrap every chain call so its focus isn't stolen from the contenteditable.
  const chain = () => (textEditor.chain() as unknown as {
    focus: () => {
      toggleBold: () => { run: () => void };
      toggleItalic: () => { run: () => void };
      toggleUnderline: () => { run: () => void };
      toggleStrike: () => { run: () => void };
      toggleCode: () => { run: () => void };
      toggleBulletList: () => { run: () => void };
      toggleOrderedList: () => { run: () => void };
      setMark: (name: string, attrs: Record<string, unknown>) => {
        run: () => void;
        removeEmptyTextStyle: () => { run: () => void };
      };
      extendMarkRange: (name: string) => {
        setLink: (attrs: Record<string, unknown>) => { run: () => void };
      };
      unsetLink: () => { run: () => void };
    };
  }).focus();

  // Place the toolbar above the shape with an 8px gap; if that'd push it
  // off the top of the viewport, drop it below the shape instead.
  // Horizontally centre it over the shape but clamp to stay inside the
  // viewport so the right-hand buttons don't get clipped for text
  // shapes near the page edges.
  const TOOLBAR_H = 38;
  const TOOLBAR_W = 440; // approx — enough slack for clamping
  const above = anchor.top - TOOLBAR_H - 8;
  const top = above < 8 ? anchor.top + 32 : above;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const half = TOOLBAR_W / 2;
  const left = Math.max(8, Math.min(anchor.cx - half, vw - TOOLBAR_W - 8));

  const btnGuard = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn();
  };

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1 py-1 shadow-lg"
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 9998,
        pointerEvents: "all",
      }}
      // Don't let pointerdown steal focus from the contenteditable — the
      // TipTap editor loses selection otherwise and commands no-op.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolbarButton title="Bold (⌘B)" active={isActive("bold")} onClick={btnGuard(() => chain().toggleBold().run())}>
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton title="Italic (⌘I)" active={isActive("italic")} onClick={btnGuard(() => chain().toggleItalic().run())}>
        <Italic size={14} />
      </ToolbarButton>
      <ToolbarButton title="Underline (⌘U)" active={isActive("underline")} onClick={btnGuard(() => chain().toggleUnderline().run())}>
        <UnderlineIcon size={14} />
      </ToolbarButton>
      <ToolbarButton title="Strikethrough" active={isActive("strike")} onClick={btnGuard(() => chain().toggleStrike().run())}>
        <Strikethrough size={14} />
      </ToolbarButton>
      <ToolbarButton title="Inline code" active={isActive("code")} onClick={btnGuard(() => chain().toggleCode().run())}>
        <Code2 size={14} />
      </ToolbarButton>
      <Divider />
      <ToolbarButton title="Bullet list" active={isActive("bulletList")} onClick={btnGuard(() => chain().toggleBulletList().run())}>
        <List size={14} />
      </ToolbarButton>
      <ToolbarButton title="Numbered list" active={isActive("orderedList")} onClick={btnGuard(() => chain().toggleOrderedList().run())}>
        <ListOrdered size={14} />
      </ToolbarButton>
      <Divider />
      <label title="Font size" className="flex items-center gap-1 pl-1 pr-1.5 text-slate-600">
        <Type size={13} />
        <select
          className="bg-transparent text-[12px] outline-none"
          value={currentFontSize}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run();
            } else {
              chain().setMark("textStyle", { fontSize: v }).run();
            }
          }}
        >
          <option value="">auto</option>
          {["12px", "14px", "16px", "18px", "20px", "24px", "32px", "40px", "56px"].map((sz) => (
            <option key={sz} value={sz}>{sz}</option>
          ))}
        </select>
      </label>
      <Divider />
      <ToolbarButton
        title="Link (⌘K)"
        active={isActive("link")}
        onClick={btnGuard(() => {
          const existing = (textEditor.getAttributes("link") as { href?: string }).href ?? "";
          const href = window.prompt("Link URL", existing);
          if (href === null) return;
          if (!href) {
            chain().unsetLink().run();
            return;
          }
          chain().extendMarkRange("link").setLink({ href }).run();
        })}
      >
        <LinkIcon size={14} />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  active,
  title,
  children,
  onClick,
}: {
  active?: boolean;
  title: string;
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active ? "true" : "false"}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        active
          ? "bg-blue-100 text-blue-700"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-0.5 h-5 w-px bg-slate-200" />;
}
