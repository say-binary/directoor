"use client";

import { useState, useMemo, useRef } from "react";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { OBJECT_LIBRARY, type SemanticObjectDefinition } from "@directoor/core";
import type { Editor } from "tldraw";
import { createShapeId } from "tldraw";
import { iconShapeToTldrawType } from "@/components/canvas/shapes/DirectoorShapes";

interface ShapeLibraryProps {
  editor: Editor | null;
}

type Category = SemanticObjectDefinition["category"];

const CATEGORY_ORDER: Category[] = [
  "architecture",
  "streaming",
  "compute",
  "data",
  "networking",
  "auth",
  "observability",
  "frontend",
  "primitive",
];

const CATEGORY_LABELS: Record<Category, string> = {
  architecture: "Architecture",
  streaming: "Streaming & Messaging",
  compute: "Compute",
  data: "Data & Analytics",
  networking: "Networking",
  auth: "Auth & Identity",
  observability: "Observability",
  frontend: "Frontend",
  primitive: "Primitives",
  custom: "Custom",
};

/** Convert plain text to tldraw's richText format */
function toRichText(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

export function ShapeLibrary({ editor }: ShapeLibraryProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<Category>>(
    new Set(["architecture", "streaming"]),
  );

  // Filter shapes by search query
  const filteredByCategory = useMemo(() => {
    const q = query.toLowerCase().trim();
    const all = Object.values(OBJECT_LIBRARY);

    const matches = q
      ? all.filter((obj) => {
          if (obj.semanticType.toLowerCase().includes(q)) return true;
          if (obj.displayName.toLowerCase().includes(q)) return true;
          if (obj.description.toLowerCase().includes(q)) return true;
          return obj.aliases.some((a) => a.toLowerCase().includes(q));
        })
      : all;

    const byCat = new Map<Category, SemanticObjectDefinition[]>();
    for (const obj of matches) {
      const cat = obj.category as Category;
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(obj);
    }
    return byCat;
  }, [query]);

  // When searching, auto-expand all matching categories
  const effectiveExpanded = useMemo(() => {
    if (query.trim()) return new Set(filteredByCategory.keys());
    return expanded;
  }, [query, expanded, filteredByCategory]);

  const toggleCategory = (cat: Category) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // ─── Drag-and-drop: create shape at drop position ────────────
  const dragRef = useRef<SemanticObjectDefinition | null>(null);

  const handleDragStart = (def: SemanticObjectDefinition, e: React.DragEvent) => {
    dragRef.current = def;
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/x-directoor-shape", def.semanticType);
  };

  // Click-to-add — drops the shape at the center of the current viewport
  const handleClick = (def: SemanticObjectDefinition) => {
    if (!editor) return;
    const viewport = editor.getViewportPageBounds();
    const x = viewport.x + viewport.w / 2 - def.defaultSize.width / 2;
    const y = viewport.y + viewport.h / 2 - def.defaultSize.height / 2;
    createShapeFromDefinition(editor, def, { x, y });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shapes..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {CATEGORY_ORDER.map((cat) => {
          const shapes = filteredByCategory.get(cat);
          if (!shapes || shapes.length === 0) return null;
          const isOpen = effectiveExpanded.has(cat);

          return (
            <div key={cat} className="mb-0.5">
              <button
                onClick={() => toggleCategory(cat)}
                className="flex items-center gap-1 w-full px-1.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-700 uppercase tracking-wide"
              >
                {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                {CATEGORY_LABELS[cat]}
                <span className="text-slate-400 font-normal ml-auto normal-case">
                  {shapes.length}
                </span>
              </button>
              {isOpen && (
                <div className="grid grid-cols-2 gap-1 px-1 pb-1">
                  {shapes.map((def) => (
                    <ShapePreview
                      key={def.semanticType}
                      def={def}
                      onDragStart={(e) => handleDragStart(def, e)}
                      onClick={() => handleClick(def)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {query.trim() && filteredByCategory.size === 0 && (
          <p className="px-3 py-6 text-center text-xs text-slate-400">
            No shapes match &ldquo;{query}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Shape preview tile ──────────────────────────────────────────────

function ShapePreview({
  def,
  onDragStart,
  onClick,
}: {
  def: SemanticObjectDefinition;
  onDragStart: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="group flex flex-col items-center gap-1 p-1.5 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 cursor-grab active:cursor-grabbing transition-colors"
      title={`${def.displayName}\n${def.description || ""}\nAliases: ${def.aliases.slice(0, 4).join(", ")}`}
    >
      <ShapeIcon def={def} />
      <span className="text-[10px] text-slate-600 text-center leading-tight line-clamp-2">
        {def.displayName}
      </span>
    </div>
  );
}

// ─── Mini SVG preview for each iconShape archetype ───────────────────

function ShapeIcon({ def }: { def: SemanticObjectDefinition }) {
  const color = def.defaultStyle.stroke;
  const fill = def.defaultStyle.fill === "transparent" ? "#FFFFFF" : def.defaultStyle.fill;
  const w = 48, h = 32;

  switch (def.iconShape) {
    case "cylinder": {
      const ry = 4;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path d={`M 2,${ry} L 2,${h - ry} A ${w / 2 - 2},${ry} 0 0 0 ${w - 2},${h - ry} L ${w - 2},${ry}`} fill={fill} stroke={color} strokeWidth={1.5} />
          <ellipse cx={w / 2} cy={ry} rx={w / 2 - 2} ry={ry} fill={fill} stroke={color} strokeWidth={1.5} />
        </svg>
      );
    }
    case "hexagon": {
      const inset = w * 0.22;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <polygon
            points={`${inset},1 ${w - inset},1 ${w - 1},${h / 2} ${w - inset},${h - 1} ${inset},${h - 1} 1,${h / 2}`}
            fill={fill} stroke={color} strokeWidth={1.5} strokeLinejoin="round"
          />
        </svg>
      );
    }
    case "actor": {
      const cx = w / 2;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <circle cx={cx} cy={7} r={4} fill="none" stroke={color} strokeWidth={1.5} />
          <line x1={cx} y1={11} x2={cx} y2={22} stroke={color} strokeWidth={1.5} />
          <line x1={cx - 7} y1={16} x2={cx + 7} y2={16} stroke={color} strokeWidth={1.5} />
          <line x1={cx} y1={22} x2={cx - 5} y2={29} stroke={color} strokeWidth={1.5} />
          <line x1={cx} y1={22} x2={cx + 5} y2={29} stroke={color} strokeWidth={1.5} />
        </svg>
      );
    }
    case "cloud":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path
            d={`M ${w * 0.2},${h * 0.8} C ${w * 0.05},${h * 0.8} ${w * 0.05},${h * 0.5} ${w * 0.22},${h * 0.5} C ${w * 0.18},${h * 0.2} ${w * 0.5},${h * 0.1} ${w * 0.55},${h * 0.4} C ${w * 0.62},${h * 0.18} ${w * 0.92},${h * 0.25} ${w * 0.85},${h * 0.55} C ${w * 0.98},${h * 0.6} ${w * 0.95},${h * 0.8} ${w * 0.78},${h * 0.8} Z`}
            fill={fill} stroke={color} strokeWidth={1.5} strokeLinejoin="round"
          />
        </svg>
      );
    case "document": {
      const fold = 8;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path
            d={`M 6,2 L ${w - fold - 6},2 L ${w - 6},${fold + 2} L ${w - 6},${h - 2} L 6,${h - 2} Z`}
            fill={fill} stroke={color} strokeWidth={1.5} strokeLinejoin="round"
          />
          <path d={`M ${w - fold - 6},2 L ${w - fold - 6},${fold + 2} L ${w - 6},${fold + 2}`} fill="none" stroke={color} strokeWidth={1.5} />
        </svg>
      );
    }
    case "stack":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <rect x={4} y={2} width={w - 10} height={h - 10} rx={2} fill={fill} stroke={color} strokeWidth={1.5} opacity={0.85} />
          <rect x={2} y={4} width={w - 10} height={h - 10} rx={2} fill={fill} stroke={color} strokeWidth={1.5} opacity={0.85} />
          <rect x={0} y={6} width={w - 10} height={h - 10} rx={2} fill={fill} stroke={color} strokeWidth={1.5} />
        </svg>
      );
    case "circle":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 2} ry={h / 2 - 2} fill={fill} stroke={color} strokeWidth={1.5} />
        </svg>
      );
    case "diamond":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <polygon points={`${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`} fill={fill} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
        </svg>
      );
    case "rectangle":
    default:
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <rect x={2} y={3} width={w - 4} height={h - 6} rx={4} fill={fill} stroke={color} strokeWidth={1.5} />
        </svg>
      );
  }
}

// ─── Create a shape on the canvas from a definition ──────────────────

export function createShapeFromDefinition(
  editor: Editor,
  def: SemanticObjectDefinition,
  position: { x: number; y: number },
) {
  const customType = iconShapeToTldrawType(def.iconShape);
  const tlId = createShapeId();

  if (customType) {
    editor.createShape({
      id: tlId,
      type: customType,
      x: position.x,
      y: position.y,
      props: {
        w: def.defaultSize.width,
        h: def.defaultSize.height,
        label: def.displayName,
        color: def.defaultStyle.stroke,
        fill: def.defaultStyle.fill === "transparent" ? "#FFFFFF" : def.defaultStyle.fill,
        dash: def.defaultStyle.strokeStyle,
      },
    });
  } else if (def.iconShape === "circle" || def.iconShape === "diamond" || def.iconShape === "rectangle") {
    editor.createShape({
      id: tlId,
      type: "geo",
      x: position.x,
      y: position.y,
      props: {
        w: def.defaultSize.width,
        h: def.defaultSize.height,
        geo: def.iconShape === "circle" ? "ellipse" : def.iconShape,
        color: "black",
        richText: toRichText(def.displayName),
        size: "m",
        font: "sans",
        dash: "solid",
        fill: "semi",
      },
    });
  }

  return tlId;
}
