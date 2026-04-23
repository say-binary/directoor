"use client";

import { useEffect, useState } from "react";
import {
  DefaultRichTextToolbar,
  DefaultRichTextToolbarContent,
  useEditor,
  useValue,
} from "tldraw";
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
 * Custom rich-text contextual toolbar. For the native `text` shape we
 * render an extended button set (underline, strike, lists, font size).
 * For every other rich-text host (note, directoor shape labels) we fall
 * back to tldraw's stock toolbar so existing behaviour is unchanged.
 */
export function DirectoorRichTextToolbar() {
  const editor = useEditor();
  const editingShapeId = useValue(
    "editingShapeId",
    () => editor.getEditingShapeId(),
    [editor],
  );
  const editingShapeType = editingShapeId
    ? editor.getShape(editingShapeId)?.type
    : undefined;

  if (editingShapeType !== "text") {
    // Fall back to tldraw's default content for notes + shape labels.
    return <DefaultRichTextToolbar />;
  }

  return (
    <DefaultRichTextToolbar>
      <TextShapeToolbarContent />
    </DefaultRichTextToolbar>
  );
}

/**
 * The inside of the contextual toolbar when the user is editing a `text`
 * shape. We wire each button straight to TipTap commands on the active
 * rich-text editor — same pattern tldraw uses for its own default
 * content.
 */
function TextShapeToolbarContent() {
  const editor = useEditor();
  const textEditor = useValue(
    "textEditor",
    () => editor.getRichTextEditor(),
    [editor],
  );

  // Force re-render when the selection or content changes so active state
  // reflects the current cursor.
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

  if (!textEditor) return null;

  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    textEditor.isActive(name, attrs);

  const currentFontSize = (textEditor.getAttributes("textStyle") as {
    fontSize?: string;
  }).fontSize ?? "";

  const runCmd = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    fn();
  };

  return (
    <div
      // pointer-events are re-enabled on the toolbar itself because
      // tldraw's contextual toolbar wrapper sets pointer-events: none on
      // its outer shell.
      className="flex items-center gap-0.5 px-1 py-1"
      style={{ pointerEvents: "all" }}
    >
      <ToolbarButton
        title="Bold (⌘B)"
        active={isActive("bold")}
        onPointerDown={(e) => e.preventDefault()}
        onClick={runCmd(() => (textEditor.chain() as any).focus().toggleBold().run())}
      >
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton
        title="Italic (⌘I)"
        active={isActive("italic")}
        onPointerDown={(e) => e.preventDefault()}
        onClick={runCmd(() => (textEditor.chain() as any).focus().toggleItalic().run())}
      >
        <Italic size={14} />
      </ToolbarButton>
      <ToolbarButton
        title="Underline (⌘U)"
        active={isActive("underline")}
        onPointerDown={(e) => e.preventDefault()}
        onClick={runCmd(() => (textEditor.chain() as any).focus().toggleUnderline().run())}
      >
        <UnderlineIcon size={14} />
      </ToolbarButton>
      <ToolbarButton
        title="Strikethrough"
        active={isActive("strike")}
        onPointerDown={(e) => e.preventDefault()}
        onClick={runCmd(() => (textEditor.chain() as any).focus().toggleStrike().run())}
      >
        <Strikethrough size={14} />
      </ToolbarButton>
      <ToolbarButton
        title="Inline code"
        active={isActive("code")}
        onPointerDown={(e) => e.preventDefault()}
        onClick={runCmd(() => (textEditor.chain() as any).focus().toggleCode().run())}
      >
        <Code2 size={14} />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        title="Bullet list"
        active={isActive("bulletList")}
        onPointerDown={(e) => e.preventDefault()}
        onClick={runCmd(() => (textEditor.chain() as any).focus().toggleBulletList().run())}
      >
        <List size={14} />
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        active={isActive("orderedList")}
        onPointerDown={(e) => e.preventDefault()}
        onClick={runCmd(() => (textEditor.chain() as any).focus().toggleOrderedList().run())}
      >
        <ListOrdered size={14} />
      </ToolbarButton>
      <Divider />
      <label
        title="Font size"
        className="flex items-center gap-1 pl-1 pr-1.5 text-slate-600"
      >
        <Type size={13} />
        <select
          className="bg-transparent text-[12px] outline-none"
          value={currentFontSize}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              (textEditor.chain() as any).focus()
                .setMark("textStyle", { fontSize: null })
                .removeEmptyTextStyle()
                .run();
            } else {
              (textEditor.chain() as any).focus()
                .setMark("textStyle", { fontSize: v })
                .run();
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
        onPointerDown={(e) => e.preventDefault()}
        onClick={runCmd(() => {
          const existing = (textEditor.getAttributes("link") as { href?: string }).href ?? "";
          const href = window.prompt("Link URL", existing);
          if (href === null) return;
          if (!href) {
            (textEditor.chain() as any).focus().unsetLink().run();
            return;
          }
          (textEditor.chain() as any).focus().extendMarkRange("link").setLink({ href }).run();
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
  onPointerDown,
}: {
  active?: boolean;
  title: string;
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active ? "true" : "false"}
      onPointerDown={onPointerDown}
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

export { DefaultRichTextToolbarContent };
