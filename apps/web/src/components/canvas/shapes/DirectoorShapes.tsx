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
  DefaultColorStyle,
  DefaultFillStyle,
  DefaultDashStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  DefaultHorizontalAlignStyle,
  DefaultVerticalAlignStyle,
  RichTextLabel,
  toRichText,
  richTextValidator,
  renderPlaintextFromRichText,
  type TLDefaultColorStyle,
  type TLDefaultFillStyle,
  type TLDefaultDashStyle,
  type TLDefaultFontStyle,
  type TLDefaultSizeStyle,
  type TLDefaultHorizontalAlignStyle,
  type TLDefaultVerticalAlignStyle,
  type TLRichText,
} from "tldraw";
import { useEffect, useMemo, useRef, useState } from "react";

// ─── Shared shape props ──────────────────────────────────────────────
//
// Directoor geometric shapes now use tldraw's STANDARD style properties
// (DefaultColorStyle, DefaultFillStyle, DefaultDashStyle). Because these
// are declared as style props, tldraw's built-in DefaultStylePanel
// automatically renders the exact same UI you get for native tldraw
// shapes — color swatches, fill toggle, dash selector — with no extra
// code. The rendering layer maps the color-enum name + fill-enum into
// actual stroke/fill hex values via resolveShapeColors() below.
//
// Dash: we don't use tldraw's "draw" style (which looks sketched).
// "solid"/"dashed"/"dotted" still flow through and render as real SVG
// dashes so diagrams stay crisp.

interface DirectoorShapeProps {
  w: number;
  h: number;
  /** Rich-text label rendered inside the shape via tldraw's RichTextLabel.
   *  Supports multi-line, indentation, bold, italic — the same editor the
   *  native geo / text / note shapes use. */
  richText: TLRichText;
  color: TLDefaultColorStyle;
  fill: TLDefaultFillStyle;
  dash: TLDefaultDashStyle;
  font: TLDefaultFontStyle;
  size: TLDefaultSizeStyle;
  align: TLDefaultHorizontalAlignStyle;
  verticalAlign: TLDefaultVerticalAlignStyle;
}

const sharedProps: RecordProps<TLBaseShape<string, DirectoorShapeProps>> = {
  w: T.number,
  h: T.number,
  richText: richTextValidator,
  color: DefaultColorStyle,
  fill: DefaultFillStyle,
  dash: DefaultDashStyle,
  font: DefaultFontStyle,
  size: DefaultSizeStyle,
  align: DefaultHorizontalAlignStyle,
  verticalAlign: DefaultVerticalAlignStyle,
};

const defaultProps: DirectoorShapeProps = {
  w: 140,
  h: 80,
  richText: toRichText(""),
  color: "grey",
  fill: "none",
  dash: "solid",
  font: "draw",
  size: "m",
  align: "middle",
  verticalAlign: "middle",
};

// Label font sizes in px per tldraw size enum — matches native geo shape.
const LABEL_FONT_SIZES: Record<TLDefaultSizeStyle, number> = {
  s: 18,
  m: 24,
  l: 36,
  xl: 48,
};
const LABEL_LINE_HEIGHT = 1.3;
const LABEL_PADDING = 10;

// ─── Color / fill resolver ──────────────────────────────────────────
// Tldraw's color names → the actual hex Directoor has always rendered.
// Keeping our palette intentionally means existing diagrams look
// unchanged (same blues, greens, etc.) while the UI gains the native
// style panel.
const TL_COLOR_HEX: Record<TLDefaultColorStyle, string> = {
  black: "#0F172A",
  grey: "#334155",
  "light-violet": "#A78BFA",
  violet: "#7C3AED",
  blue: "#3B82F6",
  "light-blue": "#0EA5E9",
  yellow: "#EAB308",
  orange: "#D97706",
  green: "#16A34A",
  "light-green": "#84CC16",
  "light-red": "#F472B6",
  red: "#E11D48",
  white: "#FFFFFF",
};

// Paler fill variant used when fill === "solid" on light-weight shapes,
// so text stays readable on the tinted background.
const TL_FILL_HEX: Record<TLDefaultColorStyle, string> = {
  black: "#F1F5F9",
  grey: "#F8FAFC",
  "light-violet": "#F5F3FF",
  violet: "#F5F3FF",
  blue: "#EFF6FF",
  "light-blue": "#F0F9FF",
  yellow: "#FEFCE8",
  orange: "#FEF3C7",
  green: "#F0FDF4",
  "light-green": "#F7FEE7",
  "light-red": "#FDF2F8",
  red: "#FFF1F2",
  white: "#FFFFFF",
};

/**
 * Resolve the enum-based `color` + `fill` props to concrete hex values
 * for SVG rendering. Fill enum values:
 *   - "none"    → transparent (unfilled outline)
 *   - "semi"    → 30% tint of the stroke colour
 *   - "solid"   → full pale fill (Directoor's traditional look)
 *   - "pattern" → hatch-style; we treat it like "semi" for simplicity
 */
export function resolveShapeColors(
  color: TLDefaultColorStyle,
  fill: TLDefaultFillStyle,
): { stroke: string; fill: string } {
  const stroke = TL_COLOR_HEX[color] ?? TL_COLOR_HEX.grey;
  if (fill === "none") return { stroke, fill: "transparent" };
  if (fill === "solid") return { stroke, fill: TL_FILL_HEX[color] ?? TL_FILL_HEX.white };
  // "semi" / "pattern" → translucent tint of the stroke
  return { stroke, fill: `${stroke}33` };
}

// ─── Legacy-value normalisers ───────────────────────────────────────
// Old canvases + old LLM output + old sidebar drops all used hex strings
// for color/fill and "solid"|"dashed"|"dotted" for dash. These helpers
// snap any legacy value into the matching tldraw enum so the new-style
// props (DefaultColorStyle etc.) validate cleanly.

const HEX_TO_TL_COLOR: Record<string, TLDefaultColorStyle> = {
  "#0F172A": "black",
  "#000000": "black",
  "#334155": "grey",
  "#475569": "grey",
  "#64748B": "grey",
  "#94A3B8": "grey",
  "#CBD5E1": "grey",
  "#3B82F6": "blue",
  "#1D4ED8": "blue",
  "#2563EB": "blue",
  "#0EA5E9": "light-blue",
  "#38BDF8": "light-blue",
  "#16A34A": "green",
  "#22C55E": "green",
  "#10B981": "green",
  "#84CC16": "light-green",
  "#A3E635": "light-green",
  "#D97706": "orange",
  "#F59E0B": "orange",
  "#EAB308": "yellow",
  "#FACC15": "yellow",
  "#E11D48": "red",
  "#DC2626": "red",
  "#EF4444": "red",
  "#F472B6": "light-red",
  "#EC4899": "light-red",
  "#7C3AED": "violet",
  "#6D28D9": "violet",
  "#8B5CF6": "violet",
  "#A78BFA": "light-violet",
  "#C4B5FD": "light-violet",
  "#FFFFFF": "white",
};

/** Convert any hex string to the closest tldraw color name. */
export function hexToTldrawColor(input: string | undefined): TLDefaultColorStyle {
  if (!input) return "grey";
  const upper = input.toUpperCase();
  return HEX_TO_TL_COLOR[upper] ?? "grey";
}

/** Convert a legacy fill hex to the right DefaultFillStyle enum value. */
export function fillFromLegacy(input: string | undefined): TLDefaultFillStyle {
  if (!input) return "none";
  const upper = input.toUpperCase();
  if (upper === "TRANSPARENT" || upper === "NONE" || upper === "#FFFFFF") return "none";
  return "solid";
}

/**
 * Snap any directoor-geo or directoor-arrow shape's color/fill/dash props
 * into tldraw's enum world if they still hold legacy values. Safe no-op
 * if they're already enum values. Used by a before-create + before-change
 * side-effect handler so sidebar drops, LLM-generated shapes, and
 * snapshot loads all normalise on the way in.
 */
const DIRECTOOR_STYLED_TYPES = new Set([
  "directoor-rectangle",
  "directoor-hexagon",
  "directoor-cylinder",
  "directoor-circle",
  "directoor-diamond",
  "directoor-pill",
  "directoor-layer",
  "directoor-actor",
  "directoor-cloud",
  "directoor-document",
  "directoor-stack",
  "directoor-arrow",
]);

const VALID_TL_COLORS = new Set<TLDefaultColorStyle>([
  "black", "grey", "light-violet", "violet", "blue", "light-blue",
  "yellow", "orange", "green", "light-green", "light-red", "red", "white",
]);
const VALID_TL_FILLS = new Set<TLDefaultFillStyle>(["none", "semi", "solid", "pattern"]);
const VALID_TL_DASHES = new Set<TLDefaultDashStyle>(["draw", "solid", "dashed", "dotted"]);

const VALID_TL_FONTS = new Set<TLDefaultFontStyle>(["draw", "sans", "serif", "mono"]);
const VALID_TL_SIZES = new Set<TLDefaultSizeStyle>(["s", "m", "l", "xl"]);
const VALID_TL_H_ALIGNS = new Set<TLDefaultHorizontalAlignStyle>([
  "start", "middle", "end", "start-legacy", "end-legacy", "middle-legacy",
]);
const VALID_TL_V_ALIGNS = new Set<TLDefaultVerticalAlignStyle>(["start", "middle", "end"]);

export function normalizeDirectoorShapeStyles<T extends { type: string; props?: object }>(
  shape: T,
): T {
  if (!DIRECTOOR_STYLED_TYPES.has(shape.type)) return shape;
  const props = shape.props as Record<string, unknown> | undefined;
  if (!props) return shape;

  let changed = false;
  const next: Record<string, unknown> = { ...props };

  // color: hex → tldraw color name
  if (typeof props.color === "string" && !VALID_TL_COLORS.has(props.color as TLDefaultColorStyle)) {
    next.color = hexToTldrawColor(props.color);
    changed = true;
  }
  // fill: hex → fill enum (only for shapes that have a fill prop)
  if ("fill" in props && typeof props.fill === "string" && !VALID_TL_FILLS.has(props.fill as TLDefaultFillStyle)) {
    next.fill = fillFromLegacy(props.fill);
    changed = true;
  }
  // dash: keep solid/dashed/dotted, map unknowns to "solid"
  if (typeof props.dash === "string" && !VALID_TL_DASHES.has(props.dash as TLDefaultDashStyle)) {
    next.dash = "solid";
    changed = true;
  }

  // ─── Label → richText migration ───────────────────────────────────
  // Older canvases stored `label: string`. Wrap into tldraw's rich-text
  // shape so the new RichTextLabel editor can render/edit it. Arrows
  // (directoor-arrow) still use a plain string label by design — this
  // migration only applies to shapes that declare richText in their
  // new sharedProps.
  const isArrow = shape.type === "directoor-arrow";
  if (!isArrow) {
    if (typeof props.label === "string" && (!props.richText || !(props.richText as { type?: string })?.type)) {
      next.richText = toRichText(props.label);
      delete next.label;
      changed = true;
    } else if (!props.richText) {
      next.richText = toRichText("");
      changed = true;
    }

    // ─── Text-style props default-fill ────────────────────────────
    // Old shapes had no font/size/align; default them so validation
    // passes against the new sharedProps.
    if (typeof props.font !== "string" || !VALID_TL_FONTS.has(props.font as TLDefaultFontStyle)) {
      next.font = "draw";
      changed = true;
    }
    if (typeof props.size !== "string" || !VALID_TL_SIZES.has(props.size as TLDefaultSizeStyle)) {
      next.size = "m";
      changed = true;
    }
    if (typeof props.align !== "string" || !VALID_TL_H_ALIGNS.has(props.align as TLDefaultHorizontalAlignStyle)) {
      next.align = "middle";
      changed = true;
    }
    if (typeof props.verticalAlign !== "string" || !VALID_TL_V_ALIGNS.has(props.verticalAlign as TLDefaultVerticalAlignStyle)) {
      next.verticalAlign = "middle";
      changed = true;
    }
  }

  return changed ? { ...shape, props: next as T["props"] } : shape;
}

/**
 * Return the plaintext contents of a Directoor shape's label. Returns ""
 * for shapes without a richText prop. Used by the `getText()` override
 * on each shape util so tldraw's search / export features see our labels.
 */
export function getDirectoorShapeText(
  editor: import("tldraw").Editor,
  shape: { props?: { richText?: TLRichText } },
): string {
  const rt = shape.props?.richText;
  if (!rt) return "";
  return renderPlaintextFromRichText(editor, rt);
}

function strokeDashArray(dash: DirectoorShapeProps["dash"]): string {
  if (dash === "dashed") return "8,4";
  if (dash === "dotted") return "2,3";
  if (dash === "draw") return "0"; // treat tldraw's sketchy "draw" as solid
  return "0";
}

/**
 * DirectoorShapeLabel — unified label renderer for every Directoor shape.
 *
 * Wraps tldraw's <RichTextLabel/>, which:
 *   - Renders multi-line, indent-preserving rich text using tldraw's own
 *     ProseMirror-based editor (same component native geo/text/note use).
 *   - Enters edit mode automatically when tldraw's editing-shape id
 *     matches ours. No contentEditable juggling.
 *   - Writes changes back via editor.updateShape({ props: { richText } })
 *     itself — our shape utils only need canEdit() => true.
 *
 * Reads font / size / align / verticalAlign straight off the shape's
 * own props (which come from tldraw's standard style enums), so the
 * DefaultStylePanel controls drive the label appearance with no extra
 * wiring per shape.
 *
 * `bottomAnchored` forces verticalAlign to "end" — used by shapes whose
 * body draws above the label area (actor, document).
 */
function DirectoorShapeLabel({
  shape,
  bottomAnchored = false,
}: {
  shape: {
    id: import("tldraw").TLShapeId;
    type: string;
    props: DirectoorShapeProps;
  };
  bottomAnchored?: boolean;
}) {
  const editor = useEditor();
  const isOnlySelected = useValue(
    "isOnlySelected",
    () => editor.getOnlySelectedShapeId() === shape.id,
    [editor, shape.id],
  );
  const { richText, color, font, size, align, verticalAlign } = shape.props;
  return (
    <RichTextLabel
      shapeId={shape.id}
      type={shape.type}
      richText={richText}
      font={font}
      fontSize={LABEL_FONT_SIZES[size]}
      lineHeight={LABEL_LINE_HEIGHT}
      padding={LABEL_PADDING}
      align={align}
      verticalAlign={bottomAnchored ? "end" : verticalAlign}
      isSelected={isOnlySelected}
      labelColor={TL_COLOR_HEX[color] ?? TL_COLOR_HEX.grey}
      wrap
    />
  );
}

/**
 * Thin wrapper around DirectoorShapeLabel that positions the label on the
 * front-most layer of a Stack shape. Needed because Stack draws offset
 * rectangles and the label should sit inside the frontmost one, not fill
 * the whole shape.
 */
function StackLabel({
  shape,
  topOffset,
  innerW,
  innerH,
}: {
  shape: { id: import("tldraw").TLShapeId; type: string; props: DirectoorShapeProps };
  topOffset: number;
  innerW: number;
  innerH: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: topOffset,
        width: innerW,
        height: innerH,
      }}
    >
      <DirectoorShapeLabel shape={shape} />
    </div>
  );
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
    const { w, h, dash } = shape.props;
    const { stroke: color, fill } = resolveShapeColors(shape.props.color, shape.props.fill);
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
        <DirectoorShapeLabel shape={shape} />
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
    const { w, h, dash } = shape.props;
    const { stroke: color, fill } = resolveShapeColors(shape.props.color, shape.props.fill);
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
        <DirectoorShapeLabel shape={shape} />
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
    const { w, h, dash } = shape.props;
    const { stroke: color, fill } = resolveShapeColors(shape.props.color, shape.props.fill);
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
        <DirectoorShapeLabel shape={shape} bottomAnchored />
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
    const { w, h, dash } = shape.props;
    const { stroke: color, fill } = resolveShapeColors(shape.props.color, shape.props.fill);
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
        <DirectoorShapeLabel shape={shape} />
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
    const { w, h, dash } = shape.props;
    const { stroke: color, fill } = resolveShapeColors(shape.props.color, shape.props.fill);
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
        <DirectoorShapeLabel shape={shape} bottomAnchored />
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
    const { w, h, dash } = shape.props;
    const { stroke: color, fill } = resolveShapeColors(shape.props.color, shape.props.fill);
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
          shape={shape}
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
    const { w, h, dash } = shape.props;
    const { stroke: color, fill } = resolveShapeColors(shape.props.color, shape.props.fill);
    const dashArray = strokeDashArray(dash);
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={6}
            fill={fill} stroke={color} strokeWidth={2} strokeDasharray={dashArray} />
        </svg>
        <DirectoorShapeLabel shape={shape} />
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
    const { w, h, dash } = shape.props;
    const { stroke: color, fill } = resolveShapeColors(shape.props.color, shape.props.fill);
    const dashArray = strokeDashArray(dash);
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 2} ry={h / 2 - 2}
            fill={fill} stroke={color} strokeWidth={2} strokeDasharray={dashArray} />
        </svg>
        <DirectoorShapeLabel shape={shape} />
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
    const { w, h, dash } = shape.props;
    const { stroke: color, fill } = resolveShapeColors(shape.props.color, shape.props.fill);
    const dashArray = strokeDashArray(dash);
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <polygon points={`${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`}
            fill={fill} stroke={color} strokeWidth={2} strokeDasharray={dashArray} strokeLinejoin="round" />
        </svg>
        <DirectoorShapeLabel shape={shape} />
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
    const { w, h, dash } = shape.props;
    const { stroke: color, fill } = resolveShapeColors(shape.props.color, shape.props.fill);
    const dashArray = strokeDashArray(dash);
    const radius = Math.min(h / 2, 999);
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={radius}
            fill={fill} stroke={color} strokeWidth={2} strokeDasharray={dashArray} />
        </svg>
        <DirectoorShapeLabel shape={shape} />
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
    const { w, h, dash } = shape.props;
    const { stroke: color, fill } = resolveShapeColors(shape.props.color, shape.props.fill);
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
        <DirectoorShapeLabel shape={shape} />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorLayerShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} />;
  }
}

// ─── Image Shape (web image dropped onto canvas) ────────────────────
// A first-class image shape: resizable, movable, rotatable, and
// participates in prose-text wrapping (treated as an obstacle by
// DirectoorText in "prose" contentType). Stores the image URL plus a
// metadata caption that can be overlaid as a corner label.

interface DirectoorImageProps {
  w: number;
  h: number;
  src: string;
  alt: string;
  /** Optional human-readable caption shown as a corner overlay */
  caption: string;
  /** Source attribution URL (link to original page) */
  sourceUrl: string;
  /** Natural aspect ratio (w/h) at the time of placement, for resize hinting */
  naturalAspect: number;
}

const imageProps: RecordProps<TLBaseShape<"directoor-image", DirectoorImageProps>> = {
  w: T.number,
  h: T.number,
  src: T.string,
  alt: T.string,
  caption: T.string,
  sourceUrl: T.string,
  naturalAspect: T.number,
};

const imageDefaults: DirectoorImageProps = {
  w: 240, h: 180,
  src: "",
  alt: "",
  caption: "",
  sourceUrl: "",
  naturalAspect: 4 / 3,
};

export type DirectoorImageShape = TLBaseShape<"directoor-image", DirectoorImageProps>;

export class DirectoorImageShapeUtil extends BaseBoxShapeUtil<DirectoorImageShape> {
  static override type = "directoor-image" as const;
  static override props = imageProps as RecordProps<DirectoorImageShape>;

  override canEdit(): boolean { return true; }
  override canResize(): boolean { return true; }

  override getDefaultProps(): DirectoorImageProps {
    return imageDefaults;
  }

  override getGeometry(shape: DirectoorImageShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorImageShape) {
    const { w, h, src, alt, caption } = shape.props;
    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <div
          style={{
            width: w,
            height: h,
            position: "relative",
            borderRadius: 6,
            overflow: "hidden",
            background: "#F1F5F9",
            boxShadow: "0 1px 3px rgba(15,23,42,0.12)",
          }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={alt}
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                // "contain" preserves the full image and letterboxes empty
                // space against the container's grey background. The user
                // never loses content on resize — opposite of "cover" which
                // crops to fill.
                objectFit: "contain",
                display: "block",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          ) : (
            <div style={{
              width: "100%", height: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#94A3B8", fontSize: 11,
            }}>No image</div>
          )}
          {caption && (
            <div
              style={{
                position: "absolute",
                left: 0, right: 0, bottom: 0,
                padding: "4px 8px",
                background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)",
                color: "#FFFFFF",
                fontSize: 11,
                fontFamily: "Inter, system-ui, sans-serif",
                lineHeight: 1.3,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {caption}
            </div>
          )}
        </div>
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorImageShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} />;
  }
}

// ─── Text Shape (standalone, movable, editable, rotatable) ──────────
// Decoupled text — a standalone shape that can be placed anywhere,
// moved, resized, rotated, and edited independently of other shapes.
// Used as the label for arrows/lines (bridge creates one alongside the
// connection when the LLM provides a label). Also available as an
// archetype in the sidebar library for manual placement.

interface DirectoorTextProps {
  w: number;
  h: number;
  text: string;
  /** Text color as hex */
  color: string;
  /** Text size preset */
  size: "xs" | "s" | "m" | "l" | "xl";
  /** Font weight */
  weight: "normal" | "bold";
  /** Text alignment */
  align: "left" | "center" | "right";
  /** Optional background */
  background: "none" | "subtle" | "solid";
  /**
   * "inline" — a compact label (e.g. arrow label). Single-line, no flow-wrap.
   * "prose"  — a paragraph container. Word-wraps to shape width, reflows
   *            on resize, and flows around sibling shapes whose bounds
   *            intersect its own.
   */
  contentType: "inline" | "prose";
}

const textProps: RecordProps<TLBaseShape<"directoor-text", DirectoorTextProps>> = {
  w: T.number,
  h: T.number,
  text: T.string,
  color: T.string,
  size: T.literalEnum("xs", "s", "m", "l", "xl"),
  weight: T.literalEnum("normal", "bold"),
  align: T.literalEnum("left", "center", "right"),
  background: T.literalEnum("none", "subtle", "solid"),
  contentType: T.literalEnum("inline", "prose"),
};

const textDefaults: DirectoorTextProps = {
  w: 120, h: 28,
  text: "Text",
  color: "#0F172A",
  size: "m",
  weight: "normal",
  align: "center",
  background: "none",
  contentType: "inline",
};

const TEXT_SIZE_MAP: Record<DirectoorTextProps["size"], number> = {
  xs: 10, s: 12, m: 14, l: 18, xl: 24,
};

export type DirectoorTextShape = TLBaseShape<"directoor-text", DirectoorTextProps>;

export class DirectoorTextShapeUtil extends BaseBoxShapeUtil<DirectoorTextShape> {
  static override type = "directoor-text" as const;
  static override props = textProps as RecordProps<DirectoorTextShape>;

  override canEdit(): boolean { return true; }

  override getDefaultProps(): DirectoorTextProps {
    return textDefaults;
  }

  override getGeometry(shape: DirectoorTextShape): Geometry2d {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override component(shape: DirectoorTextShape) {
    const { w, h, text, color, size, weight, align, background, contentType } = shape.props;
    const fontSize = TEXT_SIZE_MAP[size];

    const bgStyles: Record<DirectoorTextProps["background"], React.CSSProperties> = {
      none: { background: "transparent" },
      subtle: { background: "rgba(255,255,255,0.88)", borderRadius: 4 },
      solid: { background: "#FFFFFF", borderRadius: 4, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" },
    };

    return (
      <HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
        <DirectoorTextInner
          shape={shape}
          text={text}
          w={w}
          h={h}
          fontSize={fontSize}
          weight={weight}
          align={align}
          color={color}
          bgStyle={bgStyles[background]}
          contentType={contentType}
        />
      </HTMLContainer>
    );
  }

  override indicator(shape: DirectoorTextShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} />;
  }
}

/**
 * Inner text body.
 *
 * Two rendering modes:
 *  - "inline": compact single-line label (used as arrow labels, annotations).
 *    Centered flex layout, no wrapping beyond natural line breaks.
 *  - "prose":  a flowing paragraph container. The text is left-aligned,
 *    word-wraps to the shape's current width, reflows on resize, and
 *    flows AROUND any sibling shape whose page-bounds intersect this
 *    shape's bounds (CSS `shape-outside` with per-side float obstacles).
 */
function DirectoorTextInner({
  shape,
  text,
  w,
  h,
  fontSize,
  weight,
  align,
  color,
  bgStyle,
  contentType,
}: {
  shape: DirectoorTextShape;
  text: string;
  w: number;
  h: number;
  fontSize: number;
  weight: "normal" | "bold";
  align: "left" | "center" | "right";
  color: string;
  bgStyle: React.CSSProperties;
  contentType: "inline" | "prose";
}) {
  const editor = useEditor();
  const shapeId = shape.id;
  const isEditing = useValue(
    "text-isEditing",
    () => editor.getEditingShapeId() === shapeId,
    [editor, shapeId],
  );
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLDivElement | null>(null);

  // Obstacles = sibling shapes whose page-bounds intersect ours.
  // Stored as shape-local rects so the layout engine can subtract them
  // from each line's available width.
  const obstacles = useValue<Array<{ x: number; y: number; w: number; h: number }>>(
    "text-obstacles",
    () => {
      if (contentType !== "prose") return [];
      const selfBounds = editor.getShapePageBounds(shapeId);
      if (!selfBounds) return [];
      const result: Array<{ x: number; y: number; w: number; h: number }> = [];
      const shapes = editor.getCurrentPageShapes();
      for (const s of shapes) {
        if (s.id === shapeId) continue;
        if (s.type === "directoor-arrow") continue;    // arrows don't block flow
        if (s.type === "directoor-text") continue;     // don't wrap around other text
        const b = editor.getShapePageBounds(s.id);
        if (!b) continue;
        const overlapX = Math.max(0, Math.min(b.x + b.w, selfBounds.x + selfBounds.w) - Math.max(b.x, selfBounds.x));
        const overlapY = Math.max(0, Math.min(b.y + b.h, selfBounds.y + selfBounds.h) - Math.max(b.y, selfBounds.y));
        if (overlapX <= 0 || overlapY <= 0) continue;
        // Shape-local coords — the intersection of the two rects
        const lx = Math.max(0, b.x - selfBounds.x);
        const ly = Math.max(0, b.y - selfBounds.y);
        const lx2 = Math.min(w, b.x + b.w - selfBounds.x);
        const ly2 = Math.min(h, b.y + b.h - selfBounds.y);
        result.push({ x: lx, y: ly, w: lx2 - lx, h: ly2 - ly });
      }
      return result;
    },
    [editor, shapeId, contentType, w, h],
  );

  useEffect(() => {
    if (isEditing) {
      setDraft(text);
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
  }, [isEditing, text]);

  const commit = () => {
    const s = editor.getShape(shapeId);
    if (!s) return;
    const trimmed = draft.trim();
    if (trimmed !== text) {
      editor.updateShape({
        id: s.id,
        type: s.type,
        props: { ...(s.props as Record<string, unknown>), text: trimmed },
      });
    }
    editor.setEditingShape(null);
  };

  // ─── Inline mode (original label behaviour) ──────────────────
  if (contentType === "inline") {
    const baseStyle: React.CSSProperties = {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
      padding: "2px 6px",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize,
      fontWeight: weight === "bold" ? 700 : 500,
      color,
      lineHeight: 1.2,
      textAlign: align,
      ...bgStyle,
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
            ...baseStyle,
            outline: "2px solid #3b82f6",
            outlineOffset: 1,
            borderRadius: 4,
            background: "rgba(255,255,255,0.98)",
            pointerEvents: "all",
            userSelect: "text",
            cursor: "text",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {text}
        </div>
      );
    }

    return (
      <div style={{ ...baseStyle, pointerEvents: "none", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {text || <span style={{ opacity: 0.35, fontStyle: "italic" }}>Text</span>}
      </div>
    );
  }

  // ─── Prose mode (magazine-style flow container) ──────────────
  // CSS float/shape-outside can only anchor obstacles to the left or
  // right of a block — it cannot handle a shape placed in the MIDDLE
  // of the text. For true magazine wrapping we run a custom line-by-line
  // layout engine:
  //
  //   For each line at y position:
  //     1. Find obstacles intersecting this line's y-band
  //     2. Compute "allowed segments" — horizontal gaps between obstacles
  //     3. Pack words into those segments, left to right, one word at a time
  //     4. If a segment is exhausted and there's still text, move to next
  //        segment on same line; if line exhausted, move to next line
  //
  // Words are measured via canvas 2D context for accurate widths.
  // The output is a list of absolutely-positioned <span>s.
  const proseBase: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    padding: 0,
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize,
    fontWeight: weight === "bold" ? 700 : 400,
    color,
    textAlign: align,
    ...bgStyle,
  };

  const PADDING = 14;
  const GUTTER = 8; // breathing room between obstacle and text
  const LINE_HEIGHT = Math.round(fontSize * 1.5);

  // Auto-grow: after layout, if content exceeds shape height, request a
  // resize so the container fits. Done via useEffect to avoid re-render loops.
  const containerWidth = Math.max(60, w - PADDING * 2);
  const maxLayoutHeight = h - PADDING * 2;

  const layout = useMemo(() => {
    if (!text) return { words: [] as LaidOutWord[], totalHeight: 0 };
    return layoutProse({
      text,
      width: containerWidth,
      fontSize,
      fontWeight: weight === "bold" ? 700 : 400,
      fontFamily: "Inter, system-ui, sans-serif",
      lineHeight: LINE_HEIGHT,
      obstacles: obstacles.map((o) => ({
        x: Math.max(0, o.x - PADDING - GUTTER),
        y: Math.max(0, o.y - PADDING - GUTTER),
        w: o.w + GUTTER * 2,
        h: o.h + GUTTER * 2,
      })),
    });
  }, [text, containerWidth, fontSize, weight, LINE_HEIGHT, obstacles]);

  // Auto-grow: if the laid-out text overflows the shape, grow the shape.
  useEffect(() => {
    if (contentType !== "prose") return;
    const neededH = layout.totalHeight + PADDING * 2 + 4;
    if (neededH > h + 0.5) {
      const currentShape = editor.getShape(shapeId);
      if (currentShape) {
        editor.updateShape({
          id: currentShape.id,
          type: currentShape.type,
          props: { ...(currentShape.props as Record<string, unknown>), h: neededH },
        });
      }
    }
  }, [layout.totalHeight, h, contentType, editor, shapeId]);

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
          if (e.key === "Escape") { e.preventDefault(); editor.setEditingShape(null); }
          e.stopPropagation();
        }}
        style={{
          ...proseBase,
          padding: `${PADDING}px`,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          lineHeight: 1.5,
          outline: "2px solid #3b82f6",
          outlineOffset: 1,
          borderRadius: 4,
          background: "rgba(255,255,255,0.98)",
          pointerEvents: "all",
          userSelect: "text",
          cursor: "text",
        }}
      >
        {text}
      </div>
    );
  }

  if (!text) {
    return (
      <div style={{ ...proseBase, padding: PADDING, pointerEvents: "none" }}>
        <span style={{ opacity: 0.35, fontStyle: "italic" }}>Text</span>
      </div>
    );
  }

  return (
    <div style={{ ...proseBase, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: PADDING }}>
        {layout.words.map((word, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: word.x,
              top: word.y,
              whiteSpace: "pre",
            }}
          >
            {word.text}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Prose layout engine ─────────────────────────────────────────────
// Line-by-line text layout that flows around arbitrary rectangular
// obstacles anywhere inside the container. Measures word widths using
// a canvas 2D context (accurate to the actual browser font rendering).

interface LaidOutWord {
  text: string;
  x: number;
  y: number;
}

interface LayoutInput {
  text: string;
  width: number;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  lineHeight: number;
  obstacles: Array<{ x: number; y: number; w: number; h: number }>;
}

/** Shared canvas for text measurement — reused across calls. */
let _measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!_measureCtx) {
    const c = document.createElement("canvas");
    _measureCtx = c.getContext("2d");
  }
  return _measureCtx;
}

/**
 * Compute the horizontal "allowed segments" at a given y-band.
 * Given the container width and obstacle rects intersecting the band,
 * returns a list of [start, end] ranges where text can flow.
 */
function computeAllowedSegments(
  containerWidth: number,
  bandY: number,
  bandHeight: number,
  obstacles: Array<{ x: number; y: number; w: number; h: number }>,
): Array<[number, number]> {
  // Find obstacles intersecting the line's vertical band
  const blockers = obstacles
    .filter((o) => o.y < bandY + bandHeight && o.y + o.h > bandY)
    .map((o) => [Math.max(0, o.x), Math.min(containerWidth, o.x + o.w)] as [number, number])
    .filter(([s, e]) => e > s);
  blockers.sort((a, b) => a[0] - b[0]);

  // Merge overlapping blockers
  const merged: Array<[number, number]> = [];
  for (const b of blockers) {
    if (merged.length === 0) { merged.push(b); continue; }
    const last = merged[merged.length - 1]!;
    if (b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
    else merged.push(b);
  }

  // Gaps between blockers = allowed segments
  const allowed: Array<[number, number]> = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s > cursor) allowed.push([cursor, s]);
    cursor = e;
  }
  if (cursor < containerWidth) allowed.push([cursor, containerWidth]);

  // Drop segments too small to fit any word
  return allowed.filter(([s, e]) => e - s >= 8);
}

/**
 * Lay out prose text word-by-word, wrapping around obstacles.
 * Returns positioned words plus total content height (for auto-grow).
 */
function layoutProse(input: LayoutInput): { words: LaidOutWord[]; totalHeight: number } {
  const { text, width, fontSize, fontWeight, fontFamily, lineHeight, obstacles } = input;
  const ctx = getMeasureCtx();
  if (!ctx) {
    // Server-side render or canvas unavailable — just produce a rough fallback
    return { words: [], totalHeight: 0 };
  }
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  const spaceWidth = ctx.measureText(" ").width;
  const words: LaidOutWord[] = [];

  // Split into paragraphs (blank-line separated), each an array of tokens.
  // Preserve single newlines as explicit breaks.
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);

  let y = 0;
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const tokens = paragraphs[pi]!.split(/\s+/).filter(Boolean);
    let ti = 0;

    while (ti < tokens.length) {
      // For this line, compute allowed segments
      const segments = computeAllowedSegments(width, y, lineHeight, obstacles);

      if (segments.length === 0) {
        // Entire line blocked — skip down to next available band
        y += lineHeight;
        if (y > 10_000) break; // safety
        continue;
      }

      let placedThisLine = false;
      for (const [segStart, segEnd] of segments) {
        let cursor = segStart;
        const segRight = segEnd;

        while (ti < tokens.length) {
          const token = tokens[ti]!;
          const tokenW = ctx.measureText(token).width;

          // If the token is wider than the entire segment, hard-break it
          // onto its own line (fallback to whole-width).
          if (tokenW > segEnd - segStart && cursor === segStart) {
            // Place it anyway, it will overflow visually but at least won't freeze
            words.push({ text: token, x: segStart, y });
            cursor = segStart + tokenW + spaceWidth;
            ti++;
            placedThisLine = true;
            continue;
          }

          // Normal fit check
          const needed = tokenW + (cursor > segStart ? spaceWidth : 0);
          if (cursor + needed > segRight) break; // segment full

          const placeX = cursor + (cursor > segStart ? spaceWidth : 0);
          words.push({ text: token, x: placeX, y });
          cursor = placeX + tokenW;
          ti++;
          placedThisLine = true;
        }

        if (ti >= tokens.length) break;
      }

      // If nothing could be placed on this line (rare — e.g. super-narrow
      // segments), advance anyway to avoid infinite loop.
      if (!placedThisLine) ti++;

      y += lineHeight;
      if (y > 10_000) break; // safety
    }

    // Paragraph gap — add half a line height between paragraphs
    if (pi < paragraphs.length - 1) y += Math.round(lineHeight * 0.6);
  }

  return { words, totalHeight: y };
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
  /** Stroke colour using tldraw's standard color enum. Rendered via
   *  TL_COLOR_HEX in the draw code. Declared as a style prop so tldraw's
   *  DefaultStylePanel surfaces it when arrows are selected. */
  color: TLDefaultColorStyle;
  strokeWidth: number;
  dash: TLDefaultDashStyle;
  startHead: "none" | "arrow";
  endHead: "none" | "arrow";
  path: "straight" | "elbow";
  label: string;
  /** 0..1 position along the path where the label sits. 0 = start, 1 = end. */
  labelPosition: number;
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
  color: DefaultColorStyle,
  strokeWidth: T.number,
  dash: DefaultDashStyle,
  startHead: T.literalEnum("none", "arrow"),
  endHead: T.literalEnum("none", "arrow"),
  path: T.literalEnum("straight", "elbow"),
  label: T.string,
  labelPosition: T.number,
};

const arrowDefaults: DirectoorArrowProps = {
  startX: 0, startY: 0, endX: 200, endY: 0,
  fromShapeId: "", toShapeId: "",
  fromAnchor: "auto", toAnchor: "auto",
  color: "grey",
  strokeWidth: 2,
  dash: "solid",
  startHead: "none",
  endHead: "arrow",
  path: "elbow",
  label: "",
  labelPosition: 0.5,
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
  const { strokeWidth, dash, startHead, endHead, path } = shape.props;
  const color = TL_COLOR_HEX[shape.props.color] ?? TL_COLOR_HEX.grey;
  const dashArray = strokeDashArray(dash);

  // useValue subscribes to ALL relevant atoms (shape props + bound shape positions),
  // so the arrow follows bound shapes when they move.
  const endpoints = useValue(
    "arrow-endpoints",
    () => util.computeEndpoints(shape),
    [util, shape],
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

  // Labels are now decoupled — text is a separate directoor-text shape.
  // Arrows no longer render any embedded label. If the bridge/LLM created
  // a connection with a label, it also created a companion text shape
  // positioned at the arrow's midpoint. The user can move, rotate, edit,
  // or delete that text shape independently of the arrow.

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
    </HTMLContainer>
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
  DirectoorTextShapeUtil,
  DirectoorImageShapeUtil,
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
    case "line":     return "directoor-arrow"; // line = arrow with no heads
    case "text":     return "directoor-text";
    case "image":    return "directoor-image";
    case "rectangle":
    default:         return "directoor-rectangle";
  }
}
