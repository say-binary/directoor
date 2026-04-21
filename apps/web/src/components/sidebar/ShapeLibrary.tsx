"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { OBJECT_LIBRARY, type IconShape, type SemanticObjectDefinition } from "@directoor/core";
import type { Editor } from "tldraw";
import { createShapeId, toRichText } from "tldraw";
import {
  iconShapeToTldrawType,
  hexToTldrawColor,
  fillFromLegacy,
} from "@/components/canvas/shapes/DirectoorShapes";

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

/**
 * Central catalog of every Directoor shape that the user can create via
 * the UI. Adding a new shape = appending one entry here. The catalog is
 * consumed by:
 *   - The shape picker popup in the bottom toolbar (DirectoorShapePicker)
 *   - The drag-and-drop handler in DirectoorCanvas (when legacy)
 *   - Anywhere we need a human-friendly name + default size + default
 *     stroke/fill for a given iconShape.
 *
 * Kept as a single source of truth to honour the "keep the geo property
 * extensible" requirement.
 */
export const ARCHETYPES: Archetype[] = [
  {
    iconShape: "cylinder",
    displayName: "Cylinder",
    exampleUses: ["database", "postgres", "mysql", "mongodb", "redis", "cache", "storage", "s3", "snowflake", "bigquery", "vector db", "topic", "kafka topic"],
    defaultWidth: 140, defaultHeight: 80,
    defaultStroke: "#3B82F6", defaultFill: "#EFF6FF",
  },
  {
    iconShape: "actor",
    displayName: "Human",
    exampleUses: ["user", "actor", "person", "customer", "admin", "end user", "human"],
    defaultWidth: 100, defaultHeight: 110,
    defaultStroke: "#E11D48", defaultFill: "#FFF1F2",
  },
  {
    iconShape: "document",
    displayName: "File",
    exampleUses: ["file", "document", "log", "report", "jwt", "policy", "webhook payload"],
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
    iconShape: "queue",
    displayName: "Queue",
    exampleUses: ["queue", "fifo", "buffer", "message queue", "task queue", "inbox", "outbox", "topic", "stream"],
    defaultWidth: 170, defaultHeight: 60,
    defaultStroke: "#0EA5E9", defaultFill: "#F0F9FF",
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
    iconShape: "gear",
    displayName: "Gear",
    exampleUses: ["processing", "compute", "pipeline", "transform", "etl", "job", "worker"],
    defaultWidth: 110, defaultHeight: 110,
    defaultStroke: "#475569", defaultFill: "#F1F5F9",
  },
  {
    iconShape: "error",
    displayName: "Error",
    exampleUses: ["error", "failure", "exception", "warning", "alert", "incident"],
    defaultWidth: 110, defaultHeight: 100,
    defaultStroke: "#DC2626", defaultFill: "#FEF2F2",
  },
  {
    iconShape: "success",
    displayName: "Success",
    exampleUses: ["success", "completed", "ok", "done", "healthy", "pass"],
    defaultWidth: 100, defaultHeight: 100,
    defaultStroke: "#16A34A", defaultFill: "#F0FDF4",
  },
];

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

export function ArchetypeIcon({ archetype }: { archetype: Archetype }) {
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
    case "queue": {
      // Three queued items inside a rounded container, with a thin
      // outgoing arrow on the right to convey FIFO / flow-through.
      const itemCount = 3;
      const pad = 4;
      const arrowTip = 6;
      const containerW = w - arrowTip - pad;
      const itemW = (containerW - pad * 2) / itemCount - 2;
      const itemH = h - 10;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <rect x={1} y={5} width={containerW} height={h - 10} rx={4} fill={fill} stroke={color} strokeWidth={1.8} />
          {Array.from({ length: itemCount }).map((_, i) => (
            <rect
              key={i}
              x={pad + i * (itemW + 2)}
              y={5 + (h - 10 - itemH) / 2}
              width={itemW}
              height={itemH}
              rx={1.5}
              fill="none"
              stroke={color}
              strokeOpacity={0.5}
              strokeWidth={1}
            />
          ))}
          <line x1={containerW + 1} y1={h / 2} x2={w - 2} y2={h / 2} stroke={color} strokeWidth={1.5} />
          <polygon points={`${w - arrowTip - 1},${h / 2 - 3} ${w - 2},${h / 2} ${w - arrowTip - 1},${h / 2 + 3}`} fill={color} />
        </svg>
      );
    }
    case "gear": {
      // Gear icon — teeth around a central circle. Represents
      // processing / compute / a configurable step.
      const cx = w / 2;
      const cy = h / 2;
      const rOuter = Math.min(w, h) / 2 - 2;
      const rInner = rOuter * 0.65;
      const rHole = rOuter * 0.22;
      const teeth = 8;
      const toothDepth = rOuter * 0.18;
      const path = [];
      for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 0.5) / teeth) * Math.PI * 2 - Math.PI / 2;
        const a2 = ((i + 1) / teeth) * Math.PI * 2 - Math.PI / 2;
        // Tip of this tooth
        const tipOuter = rInner + toothDepth;
        const xT0 = cx + Math.cos(a0) * tipOuter;
        const yT0 = cy + Math.sin(a0) * tipOuter;
        const xT1 = cx + Math.cos(a1) * tipOuter;
        const yT1 = cy + Math.sin(a1) * tipOuter;
        // Valley between teeth
        const xV = cx + Math.cos(a2) * rInner;
        const yV = cy + Math.sin(a2) * rInner;
        if (i === 0) path.push(`M ${xT0} ${yT0}`);
        path.push(`L ${xT1} ${yT1}`);
        path.push(`L ${xV} ${yV}`);
      }
      path.push("Z");
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path d={path.join(" ")} fill={fill} stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
          <circle cx={cx} cy={cy} r={rHole} fill="none" stroke={color} strokeWidth={1.6} />
        </svg>
      );
    }
    case "error": {
      // Warning triangle with a vertical ! inside. Red stroke, pale
      // red fill — standard ISO 7010 W-series warning visual.
      const stroke = "#DC2626";
      const inset = 2;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <polygon
            points={`${w / 2},${inset} ${w - inset},${h - inset} ${inset},${h - inset}`}
            fill="#FEF2F2"
            stroke={stroke}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          <line
            x1={w / 2}
            y1={h * 0.38}
            x2={w / 2}
            y2={h * 0.68}
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle cx={w / 2} cy={h * 0.82} r={1.4} fill={stroke} />
        </svg>
      );
    }
    case "success": {
      // Green circle with a white checkmark inside. Pairs visually
      // with the error triangle.
      const stroke = "#16A34A";
      const cx = w / 2;
      const cy = h / 2;
      const r = Math.min(w, h) / 2 - 2;
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <circle cx={cx} cy={cy} r={r} fill="#16A34A" stroke={stroke} strokeWidth={1.8} />
          <path
            d={`M ${cx - r * 0.5} ${cy} L ${cx - r * 0.1} ${cy + r * 0.35} L ${cx + r * 0.55} ${cy - r * 0.35}`}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    }
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
    case "text":
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <text
            x={w / 2}
            y={h / 2 + 5}
            fontFamily="Inter, system-ui, sans-serif"
            fontSize={16}
            fontWeight={700}
            textAnchor="middle"
            fill={color}
          >
            T
          </text>
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
    // Arrow + Line both use DirectoorArrow. Line is just an arrow with
    // both heads set to "none". Squiggle used to be a variant here but
    // was removed per user request — old squiggle shapes still render
    // (back-compat in DirectoorArrowComponent); we just no longer offer
    // it from the picker.
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
        color: hexToTldrawColor(archetype.defaultStroke),
        strokeWidth: 2,
        dash: "solid",
        startHead: "none",
        endHead: isLine ? "none" : "arrow",
        path: "straight",
        squiggleOffset: 0,
        bend1Offset: 0,
        bend2Offset: 0,
        bend3Offset: 0,
        label: "",
        labelPosition: 0.5,
      },
    });
    setTimeout(() => editor.select(tlId), 50);
    return tlId;
  }

  if (archetype.iconShape === "text") {
    // When user drags Text from the library, default to PROSE mode
    // (flow-wrap, resize-reflow). Larger default so the user has room
    // to type a paragraph. contentType="prose" means text will also
    // flow around any shape dropped onto it.
    editor.createShape({
      id: tlId,
      type: "directoor-text",
      x: position.x,
      y: position.y,
      props: {
        w: 400,
        h: 120,
        text: "",
        color: archetype.defaultStroke,
        size: "m",
        weight: "normal",
        align: "left",
        background: "none",
        contentType: "prose",
      },
    });
    setTimeout(() => {
      editor.select(tlId);
      editor.setEditingShape(tlId);
    }, 50);
    return tlId;
  }

  // Every other archetype maps to one of our Directoor custom shapes.
  // Build props with the NEW sharedProps shape (richText, enum styles).
  // Hex → tldraw color name / fill enum via our helpers.
  const customType = iconShapeToTldrawType(archetype.iconShape);
  editor.createShape({
    id: tlId,
    type: customType,
    x: position.x,
    y: position.y,
    props: {
      w: archetype.defaultWidth,
      h: archetype.defaultHeight,
      richText: toRichText(archetype.displayName),
      color: hexToTldrawColor(archetype.defaultStroke),
      fill: fillFromLegacy(archetype.defaultFill),
      dash: "solid",
      font: "draw",
      size: "m",
      align: "middle",
      verticalAlign: "middle",
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
