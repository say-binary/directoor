/**
 * Custom tldraw shape utils for Directoor.
 *
 * Six visual archetypes that map from our semantic types:
 * - cylinder  → Database, Topic, Storage, Snowflake, BigQuery, etc.
 * - hexagon   → Microservice, Service Mesh
 * - actor     → User, Producer, Consumer (people-like roles)
 * - cloud     → External System, OAuth Provider, CDN, Observability
 * - document  → Logs, JWT, files
 * - stack     → Kafka Broker, K8s Pod cluster, replicated compute
 *
 * Each shape:
 * - Resizable like a box
 * - Holds a label (rendered as HTML inside HTMLContainer)
 * - Holds a color hex string for stroke + fill tint
 * - Exports cleanly to PNG/SVG via tldraw's renderer
 */

import {
  BaseBoxShapeUtil,
  HTMLContainer,
  RecordProps,
  TLBaseShape,
  T,
  Rectangle2d,
  Geometry2d,
  useEditor,
  stopEventPropagation,
} from "tldraw";
import { useEffect, useRef, useState } from "react";

// ─── Shared shape props ──────────────────────────────────────────────

interface DirectoorShapeProps {
  w: number;
  h: number;
  label: string;
  /** Stroke color as hex, e.g. "#3B82F6" */
  color: string;
  /** Fill color as hex, e.g. "#EFF6FF" */
  fill: string;
  /** Optional dash style */
  dash: "solid" | "dashed" | "dotted";
}

const sharedProps: RecordProps<TLBaseShape<string, DirectoorShapeProps>> = {
  w: T.number,
  h: T.number,
  label: T.string,
  color: T.string,
  fill: T.string,
  dash: T.literalEnum("solid", "dashed", "dotted"),
};

const defaultProps: DirectoorShapeProps = {
  w: 140,
  h: 80,
  label: "",
  color: "#334155",
  fill: "#FFFFFF",
  dash: "solid",
};

function strokeDashArray(dash: DirectoorShapeProps["dash"]): string {
  if (dash === "dashed") return "8,4";
  if (dash === "dotted") return "2,3";
  return "0";
}

/**
 * Editable label for all Directoor custom shapes.
 *
 * Behavior:
 * - Shows the label as static text by default
 * - When tldraw marks this shape as being edited (editor.getEditingShapeId() === shape.id),
 *   renders a contentEditable div that auto-focuses and commits on blur / Enter
 * - Escape cancels the edit
 *
 * This requires the shape util to override canEdit() => true so tldraw
 * enters edit mode on double-click.
 */
function EditableLabel({
  shapeId,
  label,
  w,
  h,
  bottomAnchored = false,
}: {
  shapeId: string;
  label: string;
  w: number;
  h: number;
  /** If true, label sits at the bottom (used by actor / document shapes) */
  bottomAnchored?: boolean;
}) {
  const editor = useEditor();
  const isEditing = editor.getEditingShapeId() === shapeId;
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLDivElement | null>(null);

  // Reset draft whenever we enter edit mode
  useEffect(() => {
    if (isEditing) {
      setDraft(label);
      // Focus + select-all after mount
      const t = setTimeout(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 0);
      return () => clearTimeout(t);
    }
  }, [isEditing, label]);

  const commit = () => {
    const shape = editor.getShape(shapeId);
    if (!shape) return;
    const trimmed = draft.trim();
    if (trimmed !== label) {
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        props: { ...(shape.props as Record<string, unknown>), label: trimmed },
      });
    }
    editor.setEditingShape(null);
  };

  const cancel = () => {
    setDraft(label);
    editor.setEditingShape(null);
  };

  // Shared label style
  const fontSize = Math.min(16, Math.max(10, h / 6));
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    ...(bottomAnchored
      ? { left: 0, right: 0, bottom: 4, textAlign: "center", padding: "0 4px" }
      : { inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }),
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: bottomAnchored ? 12 : fontSize,
    fontWeight: 600,
    color: "#0f172a",
    lineHeight: 1.2,
    wordBreak: "break-word",
  };

  if (isEditing) {
    return (
      <div
        ref={inputRef}
        contentEditable
        suppressContentEditableWarning
        onPointerDown={stopEventPropagation}
        onMouseDown={stopEventPropagation}
        onClick={stopEventPropagation}
        onInput={(e) => setDraft((e.target as HTMLDivElement).innerText)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
          e.stopPropagation();
        }}
        style={{
          ...baseStyle,
          cursor: "text",
          outline: "2px solid #3b82f6",
          outlineOffset: 2,
          borderRadius: 4,
          background: "rgba(255,255,255,0.95)",
          whiteSpace: "pre-wrap",
          pointerEvents: "all",
          userSelect: "text",
        }}
      >
        {label}
      </div>
    );
  }

  return (
    <div style={{ ...baseStyle, pointerEvents: "none", textAlign: "center" }}>
      {label}
    </div>
  );
}

// Kept for backward compat with existing call sites that don't need edit
function ShapeLabel({ shapeId, label, w, h }: { shapeId: string; label: string; w: number; h: number }) {
  return <EditableLabel shapeId={shapeId} label={label} w={w} h={h} />;
}

/**
 * Editable label positioned to the front-most layer of the Stack shape.
 * Uses the same editing logic as EditableLabel but with custom positioning.
 */
function StackLabel({
  shapeId,
  label,
  topOffset,
  innerW,
  innerH,
}: {
  shapeId: string;
  label: string;
  topOffset: number;
  innerW: number;
  innerH: number;
}) {
  const editor = useEditor();
  const isEditing = editor.getEditingShapeId() === shapeId;
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(label);
      const t = setTimeout(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 0);
      return () => clearTimeout(t);
    }
  }, [isEditing, label]);

  const commit = () => {
    const shape = editor.getShape(shapeId);
    if (!shape) return;
    const trimmed = draft.trim();
    if (trimmed !== label) {
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        props: { ...(shape.props as Record<string, unknown>), label: trimmed },
      });
    }
    editor.setEditingShape(null);
  };

  const cancel = () => {
    setDraft(label);
    editor.setEditingShape(null);
  };

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: topOffset,
    width: innerW,
    height: innerH,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: Math.min(15, Math.max(10, innerH / 6)),
    fontWeight: 600,
    color: "#0f172a",
    textAlign: "center",
    padding: 6,
    wordBreak: "break-word",
    lineHeight: 1.2,
  };

  if (isEditing) {
    return (
      <div
        ref={inputRef}
        contentEditable
        suppressContentEditableWarning
        onPointerDown={stopEventPropagation}
        onMouseDown={stopEventPropagation}
        onClick={stopEventPropagation}
        onInput={(e) => setDraft((e.target as HTMLDivElement).innerText)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
          e.stopPropagation();
        }}
        style={{
          ...baseStyle,
          cursor: "text",
          outline: "2px solid #3b82f6",
          outlineOffset: 2,
          borderRadius: 4,
          background: "rgba(255,255,255,0.95)",
          whiteSpace: "pre-wrap",
          pointerEvents: "all",
          userSelect: "text",
        }}
      >
        {label}
      </div>
    );
  }

  return <div style={{ ...baseStyle, pointerEvents: "none" }}>{label}</div>;
}

// ─── Cylinder Shape (databases, topics, storage) ─────────────────────

export type DirectoorCylinderShape = TLBaseShape<"directoor-cylinder", DirectoorShapeProps>;

export class DirectoorCylinderShapeUtil extends BaseBoxShapeUtil<DirectoorCylinderShape> {
  static override type = "directoor-cylinder" as const;
  static override props = sharedProps as RecordProps<DirectoorCylinderShape>;

  override canEdit(): boolean {
    return true;
  }

  override getDefaultProps(): DirectoorShapeProps {
    return defaultProps;
  }

  override getGeometry(shape: DirectoorCylinderShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorCylinderShape) {
    const { w, h, label, color, fill, dash } = shape.props;
    const ellipseRY = Math.min(h * 0.12, 18);
    const dashArray = strokeDashArray(dash);

    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          {/* Body */}
          <path
            d={`M 1,${ellipseRY} L 1,${h - ellipseRY} A ${w / 2 - 1},${ellipseRY} 0 0 0 ${w - 1},${h - ellipseRY} L ${w - 1},${ellipseRY}`}
            fill={fill}
            stroke={color}
            strokeWidth={2}
            strokeDasharray={dashArray}
          />
          {/* Top ellipse */}
          <ellipse
            cx={w / 2}
            cy={ellipseRY}
            rx={w / 2 - 1}
            ry={ellipseRY}
            fill={fill}
            stroke={color}
            strokeWidth={2}
            strokeDasharray={dashArray}
          />
        </svg>
        <ShapeLabel shapeId={shape.id} label={label} w={w} h={h} />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorCylinderShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />;
  }
}

// ─── Hexagon Shape (microservices, service mesh) ─────────────────────

export type DirectoorHexagonShape = TLBaseShape<"directoor-hexagon", DirectoorShapeProps>;

export class DirectoorHexagonShapeUtil extends BaseBoxShapeUtil<DirectoorHexagonShape> {
  static override type = "directoor-hexagon" as const;
  static override props = sharedProps as RecordProps<DirectoorHexagonShape>;

  override canEdit(): boolean {
    return true;
  }

  override getDefaultProps(): DirectoorShapeProps {
    return { ...defaultProps, w: 130, h: 110 };
  }

  override getGeometry(shape: DirectoorHexagonShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorHexagonShape) {
    const { w, h, label, color, fill, dash } = shape.props;
    const dashArray = strokeDashArray(dash);
    const inset = w * 0.18;
    const points = [
      `${inset},1`,
      `${w - inset},1`,
      `${w - 1},${h / 2}`,
      `${w - inset},${h - 1}`,
      `${inset},${h - 1}`,
      `1,${h / 2}`,
    ].join(" ");

    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <polygon
            points={points}
            fill={fill}
            stroke={color}
            strokeWidth={2}
            strokeDasharray={dashArray}
            strokeLinejoin="round"
          />
        </svg>
        <ShapeLabel shapeId={shape.id} label={label} w={w} h={h} />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorHexagonShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />;
  }
}

// ─── Actor Shape (users, producers, consumers) ───────────────────────

export type DirectoorActorShape = TLBaseShape<"directoor-actor", DirectoorShapeProps>;

export class DirectoorActorShapeUtil extends BaseBoxShapeUtil<DirectoorActorShape> {
  static override type = "directoor-actor" as const;
  static override props = sharedProps as RecordProps<DirectoorActorShape>;

  override canEdit(): boolean {
    return true;
  }

  override getDefaultProps(): DirectoorShapeProps {
    return { ...defaultProps, w: 100, h: 110 };
  }

  override getGeometry(shape: DirectoorActorShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorActorShape) {
    const { w, h, label, color, fill, dash } = shape.props;
    const dashArray = strokeDashArray(dash);
    const headR = Math.min(w * 0.18, h * 0.18);
    const headCY = headR + 6;
    const bodyTop = headCY + headR + 4;
    const bodyBottom = h * 0.7;
    const armY = bodyTop + (bodyBottom - bodyTop) * 0.35;
    const cx = w / 2;

    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          {/* Background tint */}
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={8} fill={fill} stroke="none" opacity={0.4} />
          {/* Head */}
          <circle cx={cx} cy={headCY} r={headR} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray={dashArray} />
          {/* Body */}
          <line x1={cx} y1={bodyTop} x2={cx} y2={bodyBottom} stroke={color} strokeWidth={2.5} strokeDasharray={dashArray} />
          {/* Arms */}
          <line x1={cx - w * 0.25} y1={armY} x2={cx + w * 0.25} y2={armY} stroke={color} strokeWidth={2.5} strokeDasharray={dashArray} />
          {/* Legs */}
          <line x1={cx} y1={bodyBottom} x2={cx - w * 0.2} y2={bodyBottom + h * 0.18} stroke={color} strokeWidth={2.5} strokeDasharray={dashArray} />
          <line x1={cx} y1={bodyBottom} x2={cx + w * 0.2} y2={bodyBottom + h * 0.18} stroke={color} strokeWidth={2.5} strokeDasharray={dashArray} />
        </svg>
        {/* Label below the figure — editable */}
        <EditableLabel shapeId={shape.id} label={label} w={w} h={h} bottomAnchored />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorActorShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />;
  }
}

// ─── Cloud Shape (external/managed services) ─────────────────────────

export type DirectoorCloudShape = TLBaseShape<"directoor-cloud", DirectoorShapeProps>;

export class DirectoorCloudShapeUtil extends BaseBoxShapeUtil<DirectoorCloudShape> {
  static override type = "directoor-cloud" as const;
  static override props = sharedProps as RecordProps<DirectoorCloudShape>;

  override canEdit(): boolean {
    return true;
  }

  override getDefaultProps(): DirectoorShapeProps {
    return { ...defaultProps, w: 150, h: 90 };
  }

  override getGeometry(shape: DirectoorCloudShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorCloudShape) {
    const { w, h, label, color, fill, dash } = shape.props;
    const dashArray = strokeDashArray(dash);
    // A scalable "cloud" path: combination of arcs forming a fluffy outline
    const path = `
      M ${w * 0.2},${h * 0.85}
      C ${w * 0.05},${h * 0.85} ${w * 0.05},${h * 0.5} ${w * 0.22},${h * 0.5}
      C ${w * 0.18},${h * 0.2} ${w * 0.5},${h * 0.1} ${w * 0.55},${h * 0.4}
      C ${w * 0.62},${h * 0.18} ${w * 0.92},${h * 0.25} ${w * 0.85},${h * 0.55}
      C ${w * 0.98},${h * 0.6} ${w * 0.95},${h * 0.85} ${w * 0.78},${h * 0.85}
      Z
    `;

    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <path d={path} fill={fill} stroke={color} strokeWidth={2} strokeDasharray={dashArray} strokeLinejoin="round" />
        </svg>
        <ShapeLabel shapeId={shape.id} label={label} w={w} h={h} />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorCloudShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />;
  }
}

// ─── Document Shape (logs, files, JWT) ───────────────────────────────

export type DirectoorDocumentShape = TLBaseShape<"directoor-document", DirectoorShapeProps>;

export class DirectoorDocumentShapeUtil extends BaseBoxShapeUtil<DirectoorDocumentShape> {
  static override type = "directoor-document" as const;
  static override props = sharedProps as RecordProps<DirectoorDocumentShape>;

  override canEdit(): boolean {
    return true;
  }

  override getDefaultProps(): DirectoorShapeProps {
    return { ...defaultProps, w: 110, h: 130 };
  }

  override getGeometry(shape: DirectoorDocumentShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorDocumentShape) {
    const { w, h, label, color, fill, dash } = shape.props;
    const dashArray = strokeDashArray(dash);
    const fold = Math.min(w * 0.25, 24);

    // Document outline with folded top-right corner
    const path = `
      M 1,1
      L ${w - fold - 1},1
      L ${w - 1},${fold}
      L ${w - 1},${h - 1}
      L 1,${h - 1}
      Z
    `;
    const foldPath = `M ${w - fold - 1},1 L ${w - fold - 1},${fold} L ${w - 1},${fold}`;

    // Fake text lines
    const lineCount = 4;
    const lineGap = (h - fold - 24) / (lineCount + 1);

    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <path d={path} fill={fill} stroke={color} strokeWidth={2} strokeDasharray={dashArray} strokeLinejoin="round" />
          <path d={foldPath} fill="none" stroke={color} strokeWidth={2} strokeDasharray={dashArray} />
          {Array.from({ length: lineCount }).map((_, i) => (
            <line
              key={i}
              x1={10}
              x2={w - 14}
              y1={fold + 16 + lineGap * (i + 1)}
              y2={fold + 16 + lineGap * (i + 1)}
              stroke={color}
              strokeOpacity={0.3}
              strokeWidth={1.5}
            />
          ))}
        </svg>
        <EditableLabel shapeId={shape.id} label={label} w={w} h={h} bottomAnchored />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorDocumentShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />;
  }
}

// ─── Stack Shape (brokers, pod clusters, replicated compute) ────────

export type DirectoorStackShape = TLBaseShape<"directoor-stack", DirectoorShapeProps>;

export class DirectoorStackShapeUtil extends BaseBoxShapeUtil<DirectoorStackShape> {
  static override type = "directoor-stack" as const;
  static override props = sharedProps as RecordProps<DirectoorStackShape>;

  override canEdit(): boolean {
    return true;
  }

  override getDefaultProps(): DirectoorShapeProps {
    return { ...defaultProps, w: 130, h: 100 };
  }

  override getGeometry(shape: DirectoorStackShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorStackShape) {
    const { w, h, label, color, fill, dash } = shape.props;
    const dashArray = strokeDashArray(dash);
    const offset = 6;
    const layers = 3;
    const innerW = w - offset * (layers - 1);
    const innerH = h - offset * (layers - 1) - 4;

    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          {Array.from({ length: layers }).map((_, i) => {
            const x = offset * (layers - 1 - i);
            const y = offset * i + 2;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={innerW}
                height={innerH}
                rx={6}
                fill={fill}
                stroke={color}
                strokeWidth={2}
                strokeDasharray={dashArray}
                opacity={i === layers - 1 ? 1 : 0.85}
              />
            );
          })}
        </svg>
        {/* Label is on the front-most layer — editable */}
        <StackLabel
          shapeId={shape.id}
          label={label}
          topOffset={offset * (layers - 1) + 2}
          innerW={innerW}
          innerH={innerH}
        />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorStackShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />;
  }
}

// ─── Rectangle Shape (default for services, lambdas, gateways) ──────

export type DirectoorRectangleShape = TLBaseShape<"directoor-rectangle", DirectoorShapeProps>;

export class DirectoorRectangleShapeUtil extends BaseBoxShapeUtil<DirectoorRectangleShape> {
  static override type = "directoor-rectangle" as const;
  static override props = sharedProps as RecordProps<DirectoorRectangleShape>;

  override canEdit(): boolean { return true; }

  override getDefaultProps(): DirectoorShapeProps {
    return defaultProps;
  }

  override getGeometry(shape: DirectoorRectangleShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorRectangleShape) {
    const { w, h, label, color, fill, dash } = shape.props;
    const dashArray = strokeDashArray(dash);
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={6}
            fill={fill} stroke={color} strokeWidth={2} strokeDasharray={dashArray} />
        </svg>
        <ShapeLabel shapeId={shape.id} label={label} w={w} h={h} />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorRectangleShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} />;
  }
}

// ─── Circle Shape (neural nodes, events, states) ────────────────────

export type DirectoorCircleShape = TLBaseShape<"directoor-circle", DirectoorShapeProps>;

export class DirectoorCircleShapeUtil extends BaseBoxShapeUtil<DirectoorCircleShape> {
  static override type = "directoor-circle" as const;
  static override props = sharedProps as RecordProps<DirectoorCircleShape>;

  override canEdit(): boolean { return true; }

  override getDefaultProps(): DirectoorShapeProps {
    return { ...defaultProps, w: 80, h: 80 };
  }

  override getGeometry(shape: DirectoorCircleShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorCircleShape) {
    const { w, h, label, color, fill, dash } = shape.props;
    const dashArray = strokeDashArray(dash);
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 2} ry={h / 2 - 2}
            fill={fill} stroke={color} strokeWidth={2} strokeDasharray={dashArray} />
        </svg>
        <ShapeLabel shapeId={shape.id} label={label} w={w} h={h} />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorCircleShape) {
    return <ellipse cx={shape.props.w / 2} cy={shape.props.h / 2} rx={shape.props.w / 2} ry={shape.props.h / 2} />;
  }
}

// ─── Diamond Shape (decisions, conditions) ──────────────────────────

export type DirectoorDiamondShape = TLBaseShape<"directoor-diamond", DirectoorShapeProps>;

export class DirectoorDiamondShapeUtil extends BaseBoxShapeUtil<DirectoorDiamondShape> {
  static override type = "directoor-diamond" as const;
  static override props = sharedProps as RecordProps<DirectoorDiamondShape>;

  override canEdit(): boolean { return true; }

  override getDefaultProps(): DirectoorShapeProps {
    return { ...defaultProps, w: 110, h: 100 };
  }

  override getGeometry(shape: DirectoorDiamondShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorDiamondShape) {
    const { w, h, label, color, fill, dash } = shape.props;
    const dashArray = strokeDashArray(dash);
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <polygon points={`${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`}
            fill={fill} stroke={color} strokeWidth={2} strokeDasharray={dashArray} strokeLinejoin="round" />
        </svg>
        <ShapeLabel shapeId={shape.id} label={label} w={w} h={h} />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorDiamondShape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}

// ─── Pill Shape (endpoints, routes, ports) ──────────────────────────

export type DirectoorPillShape = TLBaseShape<"directoor-pill", DirectoorShapeProps>;

export class DirectoorPillShapeUtil extends BaseBoxShapeUtil<DirectoorPillShape> {
  static override type = "directoor-pill" as const;
  static override props = sharedProps as RecordProps<DirectoorPillShape>;

  override canEdit(): boolean { return true; }

  override getDefaultProps(): DirectoorShapeProps {
    return { ...defaultProps, w: 130, h: 50 };
  }

  override getGeometry(shape: DirectoorPillShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorPillShape) {
    const { w, h, label, color, fill, dash } = shape.props;
    const dashArray = strokeDashArray(dash);
    const radius = Math.min(h / 2, 999);
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={radius}
            fill={fill} stroke={color} strokeWidth={2} strokeDasharray={dashArray} />
        </svg>
        <ShapeLabel shapeId={shape.id} label={label} w={w} h={h} />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorPillShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={Math.min(shape.props.h / 2, 999)} />;
  }
}

// ─── Layer Shape (ML model layers, network layers with stripes) ─────

export type DirectoorLayerShape = TLBaseShape<"directoor-layer", DirectoorShapeProps>;

export class DirectoorLayerShapeUtil extends BaseBoxShapeUtil<DirectoorLayerShape> {
  static override type = "directoor-layer" as const;
  static override props = sharedProps as RecordProps<DirectoorLayerShape>;

  override canEdit(): boolean { return true; }

  override getDefaultProps(): DirectoorShapeProps {
    return { ...defaultProps, w: 90, h: 160 };
  }

  override getGeometry(shape: DirectoorLayerShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorLayerShape) {
    const { w, h, label, color, fill, dash } = shape.props;
    const dashArray = strokeDashArray(dash);
    const stripeCount = 4;
    const stripeGap = (h - 12) / stripeCount;

    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={6}
            fill={fill} stroke={color} strokeWidth={2} strokeDasharray={dashArray} />
          {Array.from({ length: stripeCount - 1 }).map((_, i) => {
            const y = 6 + stripeGap * (i + 1);
            return <line key={i} x1={6} x2={w - 6} y1={y} y2={y} stroke={color} strokeOpacity={0.35} strokeWidth={1.5} />;
          })}
        </svg>
        <ShapeLabel shapeId={shape.id} label={label} w={w} h={h} />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorLayerShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} />;
  }
}

// ─── Arrow Shape (replaces tldraw native arrow) ─────────────────────
// Stores absolute endpoints OR shape bindings. Renders straight or
// elbow path with optional arrowheads and an editable middle label.

interface DirectoorArrowProps {
  /** Absolute endpoints (canvas page coordinates) — used as fallback */
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  /** Optional binding to source shape (tldraw shape id as string, or empty) */
  fromShapeId: string;
  toShapeId: string;
  /** Side anchor on the bound shape: top|right|bottom|left|auto */
  fromAnchor: "top" | "right" | "bottom" | "left" | "auto";
  toAnchor: "top" | "right" | "bottom" | "left" | "auto";
  color: string;
  strokeWidth: number;
  dash: "solid" | "dashed" | "dotted";
  startHead: "none" | "arrow";
  endHead: "none" | "arrow";
  path: "straight" | "elbow";
  label: string;
}

const arrowProps: RecordProps<TLBaseShape<"directoor-arrow", DirectoorArrowProps>> = {
  startX: T.number,
  startY: T.number,
  endX: T.number,
  endY: T.number,
  fromShapeId: T.string,
  toShapeId: T.string,
  fromAnchor: T.literalEnum("top", "right", "bottom", "left", "auto"),
  toAnchor: T.literalEnum("top", "right", "bottom", "left", "auto"),
  color: T.string,
  strokeWidth: T.number,
  dash: T.literalEnum("solid", "dashed", "dotted"),
  startHead: T.literalEnum("none", "arrow"),
  endHead: T.literalEnum("none", "arrow"),
  path: T.literalEnum("straight", "elbow"),
  label: T.string,
};

const arrowDefaults: DirectoorArrowProps = {
  startX: 0, startY: 0, endX: 200, endY: 0,
  fromShapeId: "", toShapeId: "",
  fromAnchor: "auto", toAnchor: "auto",
  color: "#334155",
  strokeWidth: 2,
  dash: "solid",
  startHead: "none",
  endHead: "arrow",
  path: "elbow",
  label: "",
};

export type DirectoorArrowShape = TLBaseShape<"directoor-arrow", DirectoorArrowProps>;

/** Compute the anchor point on a shape's bounding box for a given side */
function anchorOnBounds(b: { x: number; y: number; w: number; h: number }, side: DirectoorArrowProps["fromAnchor"], otherPoint: { x: number; y: number }): { x: number; y: number } {
  if (side === "top")    return { x: b.x + b.w / 2, y: b.y };
  if (side === "bottom") return { x: b.x + b.w / 2, y: b.y + b.h };
  if (side === "left")   return { x: b.x,           y: b.y + b.h / 2 };
  if (side === "right")  return { x: b.x + b.w,     y: b.y + b.h / 2 };
  // auto: pick the closest of the 4 sides to the other endpoint
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = otherPoint.x - cx;
  const dy = otherPoint.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { x: b.x + b.w, y: cy }
      : { x: b.x,       y: cy };
  }
  return dy > 0
    ? { x: cx, y: b.y + b.h }
    : { x: cx, y: b.y };
}

export class DirectoorArrowShapeUtil extends BaseBoxShapeUtil<DirectoorArrowShape> {
  static override type = "directoor-arrow" as const;
  static override props = arrowProps as RecordProps<DirectoorArrowShape>;

  override canEdit(): boolean { return true; }

  override getDefaultProps(): DirectoorArrowProps {
    return arrowDefaults;
  }

  /** Geometry: bounding box of the path. Used for selection/hit-testing. */
  override getGeometry(shape: DirectoorArrowShape): Geometry2d {
    const { effectiveStart, effectiveEnd } = this.getEffectiveEndpoints(shape);
    const minX = Math.min(effectiveStart.x, effectiveEnd.x) - shape.x;
    const minY = Math.min(effectiveStart.y, effectiveEnd.y) - shape.y;
    const maxX = Math.max(effectiveStart.x, effectiveEnd.x) - shape.x;
    const maxY = Math.max(effectiveStart.y, effectiveEnd.y) - shape.y;
    return new Rectangle2d({
      x: minX,
      y: minY,
      width: Math.max(2, maxX - minX),
      height: Math.max(2, maxY - minY),
      isFilled: false,
    });
  }

  /** Resolve the actual page-coordinate endpoints, accounting for bindings. */
  getEffectiveEndpoints(shape: DirectoorArrowShape): { effectiveStart: { x: number; y: number }; effectiveEnd: { x: number; y: number } } {
    const editor = this.editor;
    const props = shape.props;

    // Compute "other point" for auto-anchor first (use absolute endpoints as a hint)
    let absStart = { x: props.startX, y: props.startY };
    let absEnd = { x: props.endX, y: props.endY };

    let effectiveStart = absStart;
    let effectiveEnd = absEnd;

    // If bound to source shape, snap start to its anchor
    if (props.fromShapeId) {
      const fromShape = editor.getShape(props.fromShapeId as never);
      if (fromShape) {
        const fromBounds = editor.getShapePageBounds(fromShape.id);
        if (fromBounds) {
          // Use the (possibly bound) end as the "other point" for auto-anchor
          const other = props.toShapeId
            ? (() => {
                const ts = editor.getShape(props.toShapeId as never);
                const tb = ts ? editor.getShapePageBounds(ts.id) : null;
                return tb ? { x: tb.x + tb.w / 2, y: tb.y + tb.h / 2 } : absEnd;
              })()
            : absEnd;
          effectiveStart = anchorOnBounds(fromBounds, props.fromAnchor, other);
        }
      }
    }
    if (props.toShapeId) {
      const toShape = editor.getShape(props.toShapeId as never);
      if (toShape) {
        const toBounds = editor.getShapePageBounds(toShape.id);
        if (toBounds) {
          effectiveEnd = anchorOnBounds(toBounds, props.toAnchor, effectiveStart);
        }
      }
    }
    return { effectiveStart, effectiveEnd };
  }

  override component(shape: DirectoorArrowShape) {
    const { color, strokeWidth, dash, startHead, endHead, path, label } = shape.props;
    const dashArray = strokeDashArray(dash);
    const { effectiveStart, effectiveEnd } = this.getEffectiveEndpoints(shape);

    // Convert page coords → coords relative to shape origin
    const sx = effectiveStart.x - shape.x;
    const sy = effectiveStart.y - shape.y;
    const ex = effectiveEnd.x - shape.x;
    const ey = effectiveEnd.y - shape.y;

    const minX = Math.min(sx, ex) - 20;
    const minY = Math.min(sy, ey) - 20;
    const maxX = Math.max(sx, ex) + 20;
    const maxY = Math.max(sy, ey) + 20;
    const svgW = Math.max(40, maxX - minX);
    const svgH = Math.max(40, maxY - minY);

    // Translate to local SVG coords
    const localSx = sx - minX;
    const localSy = sy - minY;
    const localEx = ex - minX;
    const localEy = ey - minY;

    // Build path
    let pathD: string;
    if (path === "elbow") {
      const midX = (localSx + localEx) / 2;
      pathD = `M ${localSx} ${localSy} L ${midX} ${localSy} L ${midX} ${localEy} L ${localEx} ${localEy}`;
    } else {
      pathD = `M ${localSx} ${localSy} L ${localEx} ${localEy}`;
    }

    // Compute arrowhead angle (using last segment direction)
    const headSize = 10;
    const lastSegStartX = path === "elbow" ? (localSx + localEx) / 2 : localSx;
    const lastSegStartY = path === "elbow" ? localEy : localSy;
    const angleEnd = Math.atan2(localEy - lastSegStartY, localEx - lastSegStartX);
    const firstSegEndX = path === "elbow" ? (localSx + localEx) / 2 : localEx;
    const firstSegEndY = path === "elbow" ? localSy : localEy;
    const angleStart = Math.atan2(localSy - firstSegEndY, localSx - firstSegEndX);

    const headPath = (x: number, y: number, angle: number) => {
      const a1 = angle + Math.PI - Math.PI / 6;
      const a2 = angle + Math.PI + Math.PI / 6;
      return `M ${x} ${y} L ${x + headSize * Math.cos(a1)} ${y + headSize * Math.sin(a1)} L ${x + headSize * Math.cos(a2)} ${y + headSize * Math.sin(a2)} Z`;
    };

    // Label position — middle of path
    const labelX = path === "elbow" ? (localSx + localEx) / 2 : (localSx + localEx) / 2;
    const labelY = path === "elbow" ? (localSy + localEy) / 2 : (localSy + localEy) / 2;

    return (
      <HTMLContainer style={{ width: svgW, height: svgH, position: "relative", pointerEvents: "all", transform: `translate(${minX}px, ${minY}px)` }}>
        <svg width={svgW} height={svgH} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={dashArray} strokeLinecap="round" strokeLinejoin="round" />
          {endHead === "arrow" && (
            <path d={headPath(localEx, localEy, angleEnd)} fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />
          )}
          {startHead === "arrow" && (
            <path d={headPath(localSx, localSy, angleStart)} fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />
          )}
        </svg>
        {/* Editable label overlay */}
        <ArrowLabel shapeId={shape.id} label={label} cx={labelX} cy={labelY} />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorArrowShape) {
    const { effectiveStart, effectiveEnd } = this.getEffectiveEndpoints(shape);
    const sx = effectiveStart.x - shape.x;
    const sy = effectiveStart.y - shape.y;
    const ex = effectiveEnd.x - shape.x;
    const ey = effectiveEnd.y - shape.y;
    return <line x1={sx} y1={sy} x2={ex} y2={ey} strokeWidth={2} />;
  }
}

/** Editable label that floats over the middle of the arrow path */
function ArrowLabel({ shapeId, label, cx, cy }: { shapeId: string; label: string; cx: number; cy: number }) {
  const editor = useEditor();
  const isEditing = editor.getEditingShapeId() === shapeId;
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(label);
      const t = setTimeout(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 0);
      return () => clearTimeout(t);
    }
  }, [isEditing, label]);

  const commit = () => {
    const shape = editor.getShape(shapeId);
    if (!shape) return;
    const trimmed = draft.trim();
    if (trimmed !== label) {
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        props: { ...(shape.props as Record<string, unknown>), label: trimmed },
      });
    }
    editor.setEditingShape(null);
  };

  // Empty label & not editing → render a tiny invisible click target
  if (!label && !isEditing) {
    return (
      <div
        style={{
          position: "absolute", left: cx - 10, top: cy - 8, width: 20, height: 16,
          pointerEvents: "none",
        }}
      />
    );
  }

  if (isEditing) {
    return (
      <div
        ref={inputRef}
        contentEditable
        suppressContentEditableWarning
        onPointerDown={stopEventPropagation}
        onMouseDown={stopEventPropagation}
        onClick={stopEventPropagation}
        onInput={(e) => setDraft((e.target as HTMLDivElement).innerText)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); editor.setEditingShape(null); }
          e.stopPropagation();
        }}
        style={{
          position: "absolute",
          left: cx, top: cy,
          transform: "translate(-50%, -50%)",
          minWidth: 60,
          padding: "2px 8px",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: "#0f172a",
          background: "rgba(255,255,255,0.95)",
          outline: "2px solid #3b82f6",
          outlineOffset: 1,
          borderRadius: 4,
          textAlign: "center",
          whiteSpace: "nowrap",
          pointerEvents: "all",
          userSelect: "text",
          cursor: "text",
        }}
      >
        {label}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        left: cx, top: cy,
        transform: "translate(-50%, -50%)",
        padding: "1px 6px",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
        fontWeight: 600,
        color: "#0f172a",
        background: "rgba(255,255,255,0.92)",
        borderRadius: 4,
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

// ─── Aggregate export — all custom shape utils ───────────────────────

export const DIRECTOOR_SHAPE_UTILS = [
  DirectoorRectangleShapeUtil,
  DirectoorCylinderShapeUtil,
  DirectoorHexagonShapeUtil,
  DirectoorActorShapeUtil,
  DirectoorCloudShapeUtil,
  DirectoorDocumentShapeUtil,
  DirectoorStackShapeUtil,
  DirectoorCircleShapeUtil,
  DirectoorDiamondShapeUtil,
  DirectoorPillShapeUtil,
  DirectoorLayerShapeUtil,
  DirectoorArrowShapeUtil,
];

/**
 * Map an IconShape to the corresponding Directoor custom shape type.
 * NEVER returns null — every iconShape resolves to a Directoor shape.
 */
export function iconShapeToTldrawType(iconShape: string): string {
  switch (iconShape) {
    case "cylinder": return "directoor-cylinder";
    case "hexagon":  return "directoor-hexagon";
    case "actor":    return "directoor-actor";
    case "cloud":    return "directoor-cloud";
    case "document": return "directoor-document";
    case "stack":    return "directoor-stack";
    case "circle":   return "directoor-circle";
    case "diamond":  return "directoor-diamond";
    case "pill":     return "directoor-pill";
    case "layer":    return "directoor-layer";
    case "arrow":    return "directoor-arrow";
    case "rectangle":
    default:         return "directoor-rectangle";
  }
}
