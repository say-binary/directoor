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
} from "tldraw";

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

// Common label rendering — used by all custom shapes
function ShapeLabel({ label, w, h }: { label: string; w: number; h: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        padding: 8,
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: Math.min(16, Math.max(10, h / 6)),
        fontWeight: 600,
        color: "#0f172a",
        textAlign: "center",
        wordBreak: "break-word",
        lineHeight: 1.2,
      }}
    >
      {label}
    </div>
  );
}

// ─── Cylinder Shape (databases, topics, storage) ─────────────────────

export type DirectoorCylinderShape = TLBaseShape<"directoor-cylinder", DirectoorShapeProps>;

export class DirectoorCylinderShapeUtil extends BaseBoxShapeUtil<DirectoorCylinderShape> {
  static override type = "directoor-cylinder" as const;
  static override props = sharedProps as RecordProps<DirectoorCylinderShape>;

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
        <ShapeLabel label={label} w={w} h={h} />
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
        <ShapeLabel label={label} w={w} h={h} />
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
        {/* Label below the figure */}
        <div style={{
          position: "absolute",
          left: 0, right: 0, bottom: 4,
          textAlign: "center",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 12,
          fontWeight: 600,
          color: "#0f172a",
          padding: "0 4px",
          wordBreak: "break-word",
          pointerEvents: "none",
        }}>{label}</div>
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
        <ShapeLabel label={label} w={w} h={h} />
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
        <div style={{
          position: "absolute",
          left: 0, right: 0, bottom: 6,
          textAlign: "center",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 11,
          fontWeight: 600,
          color: "#0f172a",
          padding: "0 4px",
          wordBreak: "break-word",
          pointerEvents: "none",
        }}>{label}</div>
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
        {/* Label is on the front-most layer */}
        <div style={{
          position: "absolute",
          left: 0,
          top: offset * (layers - 1) + 2,
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
          pointerEvents: "none",
        }}>{label}</div>
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorStackShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />;
  }
}

// ─── Aggregate export — all custom shape utils ───────────────────────

export const DIRECTOOR_SHAPE_UTILS = [
  DirectoorCylinderShapeUtil,
  DirectoorHexagonShapeUtil,
  DirectoorActorShapeUtil,
  DirectoorCloudShapeUtil,
  DirectoorDocumentShapeUtil,
  DirectoorStackShapeUtil,
];

/** Map an IconShape to the corresponding tldraw custom shape type, if any. */
export function iconShapeToTldrawType(iconShape: string): string | null {
  switch (iconShape) {
    case "cylinder": return "directoor-cylinder";
    case "hexagon": return "directoor-hexagon";
    case "actor": return "directoor-actor";
    case "cloud": return "directoor-cloud";
    case "document": return "directoor-document";
    case "stack": return "directoor-stack";
    default: return null; // fall back to native geo shape
  }
}
