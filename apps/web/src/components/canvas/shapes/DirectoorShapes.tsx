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
  ShapeUtil,
  HTMLContainer,
  RecordProps,
  TLBaseShape,
  T,
  Rectangle2d,
  Polyline2d,
  Vec,
  Geometry2d,
  useEditor,
  useValue,
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
  // CRITICAL: must use useValue so the component re-renders when
  // editor.getEditingShapeId() changes. Without it, the shape never
  // knows it entered edit mode.
  const isEditing = useValue(
    "isEditing",
    () => editor.getEditingShapeId() === (shapeId as never),
    [editor, shapeId],
  );
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
  const isEditing = useValue(
    "isEditing",
    () => editor.getEditingShapeId() === (shapeId as never),
    [editor, shapeId],
  );
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
    const shape = editor.getShape(shapeId as never);
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
// Properly extends ShapeUtil (NOT BaseBoxShapeUtil — arrows aren't boxes).
// Stores absolute page-coordinate endpoints + optional shape-id bindings.
// Path & arrowheads render in an overflow:visible SVG so they show outside
// the shape's notional bounds.

interface DirectoorArrowProps {
  /** Absolute page-coordinate endpoints. Always populated. */
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  /** Optional bindings to source/target shapes. Empty string = unbound. */
  fromShapeId: string;
  toShapeId: string;
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

/** Pick the anchor point on a shape's page bounds for a given side. */
function anchorOnBounds(
  b: { x: number; y: number; w: number; h: number },
  side: DirectoorArrowProps["fromAnchor"],
  otherPoint: { x: number; y: number },
): { x: number; y: number } {
  if (side === "top")    return { x: b.x + b.w / 2, y: b.y };
  if (side === "bottom") return { x: b.x + b.w / 2, y: b.y + b.h };
  if (side === "left")   return { x: b.x,           y: b.y + b.h / 2 };
  if (side === "right")  return { x: b.x + b.w,     y: b.y + b.h / 2 };
  // auto: pick the side closest to `otherPoint`
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = otherPoint.x - cx;
  const dy = otherPoint.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? { x: b.x + b.w, y: cy } : { x: b.x, y: cy };
  }
  return dy > 0 ? { x: cx, y: b.y + b.h } : { x: cx, y: b.y };
}

export class DirectoorArrowShapeUtil extends ShapeUtil<DirectoorArrowShape> {
  static override type = "directoor-arrow" as const;
  static override props = arrowProps as RecordProps<DirectoorArrowShape>;

  override canEdit(): boolean { return true; }
  override canResize(): boolean { return false; }
  override hideResizeHandles(): boolean { return true; }
  override hideRotateHandle(): boolean { return true; }

  override getDefaultProps(): DirectoorArrowProps {
    return arrowDefaults;
  }

  /** Resolve the actual page-coordinate endpoints, accounting for bindings. */
  computeEndpoints(shape: DirectoorArrowShape): { sx: number; sy: number; ex: number; ey: number } {
    const editor = this.editor;
    const props = shape.props;
    // NaN guards — validate every numeric prop before use
    const safe = (n: unknown, fallback: number) => Number.isFinite(n as number) ? (n as number) : fallback;
    let sx = safe(props.startX, 0);
    let sy = safe(props.startY, 0);
    let ex = safe(props.endX, 200);
    let ey = safe(props.endY, 0);

    // Tentative "other points" for auto-anchor
    const tentativeEnd = (() => {
      if (!props.toShapeId) return { x: ex, y: ey };
      const b = editor.getShapePageBounds(props.toShapeId as never);
      return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: ex, y: ey };
    })();

    if (props.fromShapeId) {
      const b = editor.getShapePageBounds(props.fromShapeId as never);
      if (b) {
        const a = anchorOnBounds(b, props.fromAnchor, tentativeEnd);
        sx = a.x; sy = a.y;
      }
    }
    if (props.toShapeId) {
      const b = editor.getShapePageBounds(props.toShapeId as never);
      if (b) {
        const a = anchorOnBounds(b, props.toAnchor, { x: sx, y: sy });
        ex = a.x; ey = a.y;
      }
    }
    return { sx, sy, ex, ey };
  }

  /**
   * Geometry is a Polyline along the actual arrow path (NOT a filled
   * rectangle bounding box). This means hit-testing only activates when
   * the user clicks ON the line — not anywhere inside the diagonal bbox.
   * Critical for diagrams where many arrows cross: each arrow is
   * independently clickable even when their bounding rectangles overlap.
   */
  override getGeometry(shape: DirectoorArrowShape): Geometry2d {
    const { sx, sy, ex, ey } = this.computeEndpoints(shape);
    const shapeX = Number.isFinite(shape.x) ? shape.x : 0;
    const shapeY = Number.isFinite(shape.y) ? shape.y : 0;
    const path = shape.props.path;

    // Path points in shape-local coordinates
    const p0 = new Vec(sx - shapeX, sy - shapeY);
    const p1 = new Vec(ex - shapeX, ey - shapeY);

    if (path === "elbow") {
      const midX = (p0.x + p1.x) / 2;
      return new Polyline2d({
        points: [
          p0,
          new Vec(midX, p0.y),
          new Vec(midX, p1.y),
          p1,
        ],
      });
    }
    return new Polyline2d({ points: [p0, p1] });
  }

  override component(shape: DirectoorArrowShape) {
    return <DirectoorArrowComponent util={this} shape={shape} />;
  }

  override indicator(shape: DirectoorArrowShape) {
    const { sx, sy, ex, ey } = this.computeEndpoints(shape);
    const lsx = sx - shape.x;
    const lsy = sy - shape.y;
    const lex = ex - shape.x;
    const ley = ey - shape.y;
    return <line x1={lsx} y1={lsy} x2={lex} y2={ley} strokeWidth={2} />;
  }
}

/**
 * Arrow component — separated so we can use hooks (useEditor, useValue).
 *
 * Subscribes to bound shape positions via useValue, so the arrow re-renders
 * when either endpoint shape moves.
 */
function DirectoorArrowComponent({ util, shape }: { util: DirectoorArrowShapeUtil; shape: DirectoorArrowShape }) {
  const editor = useEditor();
  const { color, strokeWidth, dash, startHead, endHead, path, label } = shape.props;
  const dashArray = strokeDashArray(dash);

  // useValue subscribes to ALL relevant atoms (shape props + bound shape positions),
  // so the arrow follows bound shapes when they move.
  const endpoints = useValue(
    "arrow-endpoints",
    () => util.computeEndpoints(shape),
    [util, shape],
  );

  const isEditing = useValue(
    "isEditing",
    () => editor.getEditingShapeId() === shape.id,
    [editor, shape.id],
  );

  // Convert to shape-local coordinates
  const sx = endpoints.sx - shape.x;
  const sy = endpoints.sy - shape.y;
  const ex = endpoints.ex - shape.x;
  const ey = endpoints.ey - shape.y;

  // SVG canvas — give it big padding so arrowheads & label aren't clipped
  const PAD = 30;
  const minX = Math.min(sx, ex) - PAD;
  const minY = Math.min(sy, ey) - PAD;
  const maxX = Math.max(sx, ex) + PAD;
  const maxY = Math.max(sy, ey) + PAD;
  const svgW = maxX - minX;
  const svgH = maxY - minY;

  // Coordinates inside the SVG
  const lsx = sx - minX;
  const lsy = sy - minY;
  const lex = ex - minX;
  const ley = ey - minY;

  // Build path
  let pathD: string;
  if (path === "elbow") {
    const midX = (lsx + lex) / 2;
    pathD = `M ${lsx} ${lsy} L ${midX} ${lsy} L ${midX} ${ley} L ${lex} ${ley}`;
  } else {
    pathD = `M ${lsx} ${lsy} L ${lex} ${ley}`;
  }

  // Arrowhead angles
  const headSize = 11;
  const lastFromX = path === "elbow" ? (lsx + lex) / 2 : lsx;
  const lastFromY = path === "elbow" ? ley : lsy;
  const angleEnd = Math.atan2(ley - lastFromY, lex - lastFromX);
  const firstToX = path === "elbow" ? (lsx + lex) / 2 : lex;
  const firstToY = path === "elbow" ? lsy : ley;
  const angleStart = Math.atan2(lsy - firstToY, lsx - firstToX);

  const headPath = (x: number, y: number, angle: number) => {
    const a1 = angle + Math.PI - Math.PI / 6;
    const a2 = angle + Math.PI + Math.PI / 6;
    return `M ${x} ${y} L ${x + headSize * Math.cos(a1)} ${y + headSize * Math.sin(a1)} L ${x + headSize * Math.cos(a2)} ${y + headSize * Math.sin(a2)} Z`;
  };

  // ─── Label position & rotation ─────────────────────────
  // Position the label at the midpoint of the "main" segment and
  // offset it PERPENDICULAR to the line so the label sits OVER (above)
  // the arrow, not on top of it.
  let labelMidX: number;
  let labelMidY: number;
  let labelAngleRad: number;

  if (path === "elbow") {
    // Use the longer of the two horizontal segments as the label anchor
    const midX = (lsx + lex) / 2;
    labelMidX = midX;
    labelMidY = (lsy + ley) / 2;
    labelAngleRad = 0; // elbow arrows — horizontal label is always fine
  } else {
    labelMidX = (lsx + lex) / 2;
    labelMidY = (lsy + ley) / 2;
    labelAngleRad = Math.atan2(ley - lsy, lex - lsx);
  }

  // Perpendicular offset so the label sits ABOVE the line by 14px
  const perpOffset = 14;
  // Perpendicular direction: rotate line vector by -90° (up/left in screen coords)
  const lineLen = Math.hypot(lex - lsx, ley - lsy) || 1;
  const perpDx = -((ley - lsy) / lineLen);
  const perpDy = (lex - lsx) / lineLen;
  // We want the offset to go "up" on screen (negative Y). Flip if needed.
  const offsetSign = perpDy < 0 ? 1 : -1;
  const labelX = labelMidX + perpDx * perpOffset * offsetSign;
  const labelY = labelMidY + perpDy * perpOffset * offsetSign;

  // Keep text readable — if angle is steep enough that text would be upside
  // down, flip by 180° so it always reads left-to-right.
  let labelRotDeg = (labelAngleRad * 180) / Math.PI;
  if (labelRotDeg > 90) labelRotDeg -= 180;
  if (labelRotDeg < -90) labelRotDeg += 180;

  return (
    <HTMLContainer style={{ width: 1, height: 1, pointerEvents: "none", overflow: "visible" }}>
      <svg
        style={{
          position: "absolute",
          left: minX,
          top: minY,
          width: svgW,
          height: svgH,
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        {/* Hit path — narrower than before (8px) so adjacent arrows don't overlap click targets */}
        <path
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(8, strokeWidth + 4)}
          style={{ pointerEvents: "stroke" }}
        />
        {/* Visible path */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "stroke" }}
        />
        {endHead === "arrow" && (
          <path d={headPath(lex, ley, angleEnd)} fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />
        )}
        {startHead === "arrow" && (
          <path d={headPath(lsx, lsy, angleStart)} fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />
        )}
      </svg>
      <ArrowLabel
        shapeId={shape.id}
        label={label}
        isEditing={isEditing}
        absX={minX + labelX}
        absY={minY + labelY}
        rotateDeg={labelRotDeg}
      />
    </HTMLContainer>
  );
}

/** Editable label that floats over the middle of the arrow path */
function ArrowLabel({
  shapeId,
  label,
  isEditing,
  absX,
  absY,
  rotateDeg,
}: {
  shapeId: string;
  label: string;
  isEditing: boolean;
  absX: number;
  absY: number;
  rotateDeg: number;
}) {
  const editor = useEditor();
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
    const shape = editor.getShape(shapeId as never);
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
          left: absX,
          top: absY,
          transform: `translate(-50%, -50%) rotate(${rotateDeg}deg)`,
          transformOrigin: "center center",
          minWidth: 60,
          padding: "2px 8px",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: "#0f172a",
          background: "rgba(255,255,255,0.98)",
          outline: "2px solid #3b82f6",
          outlineOffset: 1,
          borderRadius: 4,
          textAlign: "center",
          whiteSpace: "nowrap",
          pointerEvents: "all",
          userSelect: "text",
          cursor: "text",
          zIndex: 10,
        }}
      >
        {label}
      </div>
    );
  }

  // Always render a label container — empty arrows still need a click target
  // so users can double-click to add a label.
  return (
    <div
      style={{
        position: "absolute",
        left: absX,
        top: absY,
        transform: `translate(-50%, -50%) rotate(${rotateDeg}deg)`,
        transformOrigin: "center center",
        minWidth: 24,
        minHeight: 16,
        padding: label ? "1px 6px" : "0",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 12,
        fontWeight: 600,
        color: "#0f172a",
        background: label ? "rgba(255,255,255,0.92)" : "transparent",
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
