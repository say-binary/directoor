"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { OBJECT_LIBRARY, type IconShape, type SemanticObjectDefinition } from "@directoor/core";
import type { Editor } from "tldraw";
import { createShapeId } from "tldraw";
import { iconShapeToTldrawType } from "@/components/canvas/shapes/DirectoorShapes";

interface ShapeLibraryProps {
  editor: Editor | null;
}

/**
 * Visual shape archetypes. The user drags a SHAPE (not a concept) onto the
 * canvas, then names it whatever they want. Each archetype lists example
 * things it can represent — also used for search.
 */
export interface Archetype {
  iconShape: IconShape;
  displayName: string;
  /** Short description shown under the shape */
  exampleUses: string[];
  /** Default size + colors used on drop */
  defaultWidth: number;
  defaultHeight: number;
  defaultStroke: string;
  defaultFill: string;
}

const ARCHETYPES: Archetype[] = [
  {
    iconShape: "cylinder",
    displayName: "Cylinder",
    exampleUses: ["database", "postgres", "mysql", "mongodb", "redis", "cache", "storage", "s3", "snowflake", "bigquery", "vector db", "queue", "topic", "kafka topic"],
    defaultWidth: 140, defaultHeight: 80,
    defaultStroke: "#3B82F6", defaultFill: "#EFF6FF",
  },
  {
    iconShape: "hexagon",
    displayName: "Hexagon",
    exampleUses: ["microservice", "service mesh", "service", "module", "domain"],
    defaultWidth: 130, defaultHeight: 110,
    defaultStroke: "#16A34A", defaultFill: "#F0FDF4",
  },
  {
    iconShape: "actor",
    displayName: "User",
    exampleUses: ["user", "actor", "person", "customer", "admin", "end user", "human"],
    defaultWidth: 100, defaultHeight: 110,
    defaultStroke: "#E11D48", defaultFill: "#FFF1F2",
  },
  {
    iconShape: "cloud",
    displayName: "Cloud",
    exampleUses: ["external", "cloud service", "third-party", "cdn", "oauth provider", "dns", "stripe", "twilio"],
    defaultWidth: 150, defaultHeight: 85,
    defaultStroke: "#94A3B8", defaultFill: "#F8FAFC",
  },
  {
    iconShape: "document",
    displayName: "Document",
    exampleUses: ["document", "log", "file", "report", "jwt", "policy", "webhook payload"],
    defaultWidth: 110, defaultHeight: 130,
    defaultStroke: "#475569", defaultFill: "#F1F5F9",
  },
  {
    iconShape: "stack",
    displayName: "Stack",
    exampleUses: ["cluster", "kafka broker", "pod", "replicated", "worker pool", "zookeeper", "replicas"],
    defaultWidth: 130, defaultHeight: 100,
    defaultStroke: "#D97706", defaultFill: "#FEF3C7",
  },
  {
    iconShape: "rectangle",
    displayName: "Rectangle",
    exampleUses: ["service", "api gateway", "load balancer", "function", "lambda", "worker", "container", "generic box"],
    defaultWidth: 140, defaultHeight: 80,
    defaultStroke: "#334155", defaultFill: "#FFFFFF",
  },
  {
    iconShape: "circle",
    displayName: "Circle",
    exampleUses: ["event", "state", "endpoint"],
    defaultWidth: 100, defaultHeight: 100,
    defaultStroke: "#CBD5E1", defaultFill: "#F8FAFC",
  },
  {
    iconShape: "diamond",
    displayName: "Decision",
    exampleUses: ["decision", "condition", "if", "branch"],
    defaultWidth: 110, defaultHeight: 100,
    defaultStroke: "#D97706", defaultFill: "#FEF3C7",
  },
  {
    iconShape: "pill",
    displayName: "Pill",
    exampleUses: ["endpoint", "api route", "port", "version", "tag"],
    defaultWidth: 130, defaultHeight: 50,
    defaultStroke: "#7C3AED", defaultFill: "#F5F3FF",
  },
  {
    iconShape: "layer",
    displayName: "Layer",
    exampleUses: ["ml layer", "input layer", "hidden layer", "output layer", "dense"],
    defaultWidth: 90, defaultHeight: 160,
    defaultStroke: "#1D4ED8", defaultFill: "#EFF6FF",
  },
  {
    iconShape: "arrow",
    displayName: "Arrow",
    exampleUses: ["connection", "edge", "data flow", "relationship"],
    defaultWidth: 200, defaultHeight: 0,
    defaultStroke: "#334155", defaultFill: "#FFFFFF",
  },
  {
    iconShape: "line",
    displayName: "Line",
    exampleUses: ["plain line", "separator", "divider", "undirected"],
    defaultWidth: 200, defaultHeight: 0,
    defaultStroke: "#334155", defaultFill: "#FFFFFF",
  },
];

/** Convert plain text to tldraw's richText format */
function toRichText(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

export function ShapeLibrary({ editor }: ShapeLibraryProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ARCHETYPES;
    return ARCHETYPES.filter((a) => {
      if (a.displayName.toLowerCase().includes(q)) return true;
      if (a.iconShape.toLowerCase().includes(q)) return true;
      return a.exampleUses.some((u) => u.toLowerCase().includes(q));
    });
  }, [query]);

  const handleDragStart = (a: Archetype, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/x-directoor-archetype", a.iconShape);
  };

  const handleClick = (a: Archetype) => {
    if (!editor) return;
    const viewport = editor.getViewportPageBounds();
    const x = viewport.x + viewport.w / 2 - a.defaultWidth / 2;
    const y = viewport.y + viewport.h / 2 - a.defaultHeight / 2;
    createArchetypeShape(editor, a, { x, y });
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
            placeholder="Search shapes (try &ldquo;database&rdquo;)"
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
          />
        </div>
        <p className="mt-1.5 px-0.5 text-[10px] text-slate-400 leading-snug">
          Drag a shape onto the canvas, then name it whatever you want.
        </p>
      </div>

      {/* Shape tiles */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-400">
            No shapes match &ldquo;{query}&rdquo;
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filtered.map((a) => (
              <ArchetypeTile
                key={a.iconShape}
                archetype={a}
                onDragStart={(e) => handleDragStart(a, e)}
                onClick={() => handleClick(a)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tile ────────────────────────────────────────────────────────────

function ArchetypeTile({
  archetype,
  onDragStart,
  onClick,
}: {
  archetype: Archetype;
  onDragStart: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="group flex flex-col items-center gap-1 p-2 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 cursor-grab active:cursor-grabbing transition-colors"
      title={`${archetype.displayName}\n\nUse for: ${archetype.exampleUses.slice(0, 6).join(", ")}...`}
    >
      <ArchetypeIcon archetype={archetype} />
      <span className="text-[11px] font-medium text-slate-700 text-center leading-tight">
        {archetype.displayName}
      </span>
      <span className="text-[9px] text-slate-400 text-center leading-tight line-clamp-2">
        {archetype.exampleUses.slice(0, 3).join(", ")}
      </span>
    </div>
  );
}

// ─── Mini SVG preview for each archetype ─────────────────────────────

function ArchetypeIcon({ archetype }: { archetype: Archetype }) {
  const color = archetype.defaultStroke;
  const fill = archetype.defaultFill;
  const w = 56, h = 36;

  switch (archetype.iconShape) {
    case "cylinder": {
      const ry = 5;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path d={`M 2,${ry} L 2,${h - ry} A ${w / 2 - 2},${ry} 0 0 0 ${w - 2},${h - ry} L ${w - 2},${ry}`} fill={fill} stroke={color} strokeWidth={1.8} />
          <ellipse cx={w / 2} cy={ry} rx={w / 2 - 2} ry={ry} fill={fill} stroke={color} strokeWidth={1.8} />
        </svg>
      );
    }
    case "hexagon": {
      const inset = w * 0.22;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <polygon
            points={`${inset},2 ${w - inset},2 ${w - 2},${h / 2} ${w - inset},${h - 2} ${inset},${h - 2} 2,${h / 2}`}
            fill={fill} stroke={color} strokeWidth={1.8} strokeLinejoin="round"
          />
        </svg>
      );
    }
    case "actor": {
      const cx = w / 2;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <circle cx={cx} cy={8} r={4} fill="none" stroke={color} strokeWidth={1.8} />
          <line x1={cx} y1={12} x2={cx} y2={25} stroke={color} strokeWidth={1.8} />
          <line x1={cx - 8} y1={17} x2={cx + 8} y2={17} stroke={color} strokeWidth={1.8} />
          <line x1={cx} y1={25} x2={cx - 5} y2={32} stroke={color} strokeWidth={1.8} />
          <line x1={cx} y1={25} x2={cx + 5} y2={32} stroke={color} strokeWidth={1.8} />
        </svg>
      );
    }
    case "cloud":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path
            d={`M ${w * 0.2},${h * 0.8} C ${w * 0.05},${h * 0.8} ${w * 0.05},${h * 0.5} ${w * 0.22},${h * 0.5} C ${w * 0.18},${h * 0.2} ${w * 0.5},${h * 0.1} ${w * 0.55},${h * 0.4} C ${w * 0.62},${h * 0.18} ${w * 0.92},${h * 0.25} ${w * 0.85},${h * 0.55} C ${w * 0.98},${h * 0.6} ${w * 0.95},${h * 0.8} ${w * 0.78},${h * 0.8} Z`}
            fill={fill} stroke={color} strokeWidth={1.8} strokeLinejoin="round"
          />
        </svg>
      );
    case "document": {
      const fold = 9;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path
            d={`M 7,2 L ${w - fold - 7},2 L ${w - 7},${fold + 2} L ${w - 7},${h - 2} L 7,${h - 2} Z`}
            fill={fill} stroke={color} strokeWidth={1.8} strokeLinejoin="round"
          />
          <path d={`M ${w - fold - 7},2 L ${w - fold - 7},${fold + 2} L ${w - 7},${fold + 2}`} fill="none" stroke={color} strokeWidth={1.8} />
        </svg>
      );
    }
    case "stack":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <rect x={5} y={2} width={w - 12} height={h - 12} rx={2.5} fill={fill} stroke={color} strokeWidth={1.8} opacity={0.85} />
          <rect x={3} y={5} width={w - 12} height={h - 12} rx={2.5} fill={fill} stroke={color} strokeWidth={1.8} opacity={0.85} />
          <rect x={1} y={8} width={w - 12} height={h - 12} rx={2.5} fill={fill} stroke={color} strokeWidth={1.8} />
        </svg>
      );
    case "circle":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 3} ry={h / 2 - 3} fill={fill} stroke={color} strokeWidth={1.8} />
        </svg>
      );
    case "diamond":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <polygon points={`${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`} fill={fill} stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        </svg>
      );
    case "pill":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <rect x={2} y={8} width={w - 4} height={h - 16} rx={(h - 16) / 2} fill={fill} stroke={color} strokeWidth={1.8} />
        </svg>
      );
    case "layer": {
      const stripeCount = 3;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <rect x={10} y={2} width={w - 20} height={h - 4} rx={4} fill={fill} stroke={color} strokeWidth={1.8} />
          {Array.from({ length: stripeCount - 1 }).map((_, i) => {
            const y = 2 + (h - 4) / stripeCount * (i + 1);
            return <line key={i} x1={14} x2={w - 14} y1={y} y2={y} stroke={color} strokeOpacity={0.4} strokeWidth={1} />;
          })}
        </svg>
      );
    }
    case "arrow":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <line x1={6} y1={h / 2} x2={w - 10} y2={h / 2} stroke={color} strokeWidth={2} strokeLinecap="round" />
          <polygon
            points={`${w - 10},${h / 2 - 5} ${w - 2},${h / 2} ${w - 10},${h / 2 + 5}`}
            fill={color}
          />
        </svg>
      );
    case "line":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <line x1={4} y1={h / 2} x2={w - 4} y2={h / 2} stroke={color} strokeWidth={2} strokeLinecap="round" />
        </svg>
      );
    case "rectangle":
    default:
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <rect x={2} y={4} width={w - 4} height={h - 8} rx={5} fill={fill} stroke={color} strokeWidth={1.8} />
        </svg>
      );
  }
}

// ─── Create a generic shape from an archetype ────────────────────────

export function createArchetypeShape(
  editor: Editor,
  archetype: Archetype,
  position: { x: number; y: number },
) {
  const tlId = createShapeId();

  if (archetype.iconShape === "arrow" || archetype.iconShape === "line") {
    // Both Arrow and Line use the DirectoorArrow shape — Line just sets
    // both arrowheads to "none" so it's a plain connector.
    const isLine = archetype.iconShape === "line";
    editor.createShape({
      id: tlId,
      type: "directoor-arrow",
      x: 0,
      y: 0,
      props: {
        startX: position.x,
        startY: position.y + 40,
        endX: position.x + 200,
        endY: position.y + 40,
        fromShapeId: "",
        toShapeId: "",
        fromAnchor: "auto",
        toAnchor: "auto",
        color: archetype.defaultStroke,
        strokeWidth: 2,
        dash: "solid",
        startHead: "none",
        endHead: isLine ? "none" : "arrow",
        path: "straight",
        label: "",
        labelPosition: 0.5,
      },
    });
    // Arrows/lines don't get auto-edit (empty label by default)
    setTimeout(() => editor.select(tlId), 50);
    return tlId;
  }

  // Every other archetype maps to one of our Directoor custom shapes
  const customType = iconShapeToTldrawType(archetype.iconShape);
  editor.createShape({
    id: tlId,
    type: customType,
    x: position.x,
    y: position.y,
    props: {
      w: archetype.defaultWidth,
      h: archetype.defaultHeight,
      label: archetype.displayName,
      color: archetype.defaultStroke,
      fill: archetype.defaultFill,
      dash: "solid",
    },
  });

  // Auto-enter edit mode so user can rename immediately
  setTimeout(() => {
    editor.select(tlId);
    editor.setEditingShape(tlId);
  }, 50);

  return tlId;
}

/**
 * Kept for backward compat with the drag-drop handler in DirectoorCanvas
 * which uses `application/x-directoor-shape` + a semanticType.
 * Maps the old data to an archetype and creates via createArchetypeShape.
 */
export function createShapeFromDefinition(
  editor: Editor,
  def: SemanticObjectDefinition,
  position: { x: number; y: number },
) {
  const archetype: Archetype = {
    iconShape: def.iconShape,
    displayName: def.displayName,
    exampleUses: def.aliases,
    defaultWidth: def.defaultSize.width,
    defaultHeight: def.defaultSize.height,
    defaultStroke: def.defaultStyle.stroke,
    defaultFill: def.defaultStyle.fill === "transparent" ? "#FFFFFF" : def.defaultStyle.fill,
  };
  return createArchetypeShape(editor, archetype, position);
}
