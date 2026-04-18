"use client";

import { useCallback, useMemo } from "react";
import { useEditor, useValue, type TLShape } from "tldraw";

/**
 * DirectoorStylePanel — style controls for Directoor's custom shapes.
 *
 * Tldraw's DefaultStylePanel only surfaces standard tldraw styles
 * (`DefaultColorStyle`, `DefaultSizeStyle`, etc.). Our custom shapes use
 * their own props (`color` = stroke hex, `fill` = fill hex, `dash` =
 * solid|dashed|dotted), so DefaultStylePanel renders only the opacity
 * slider and nothing else when a Directoor shape is selected.
 *
 * This panel renders the controls that actually drive our shape props.
 * Used by ConditionalStylePanel in DirectoorCanvas when the selection
 * contains any shape whose props include these fields.
 */

// ─── Palettes ───────────────────────────────────────────────────────────
// Stroke colours paired with a matching paler fill, same index = match.
// Keeping them in sync makes it trivial for the user to pick "red shape"
// and get both the stroke and fill to agree. Last entry is "no fill"
// (transparent / white) so the user can opt out of a tinted fill.

const STROKE_COLORS = [
  "#334155", // slate-700 (default neutral)
  "#3B82F6", // blue-500
  "#0EA5E9", // sky-500
  "#16A34A", // green-600
  "#D97706", // amber-600
  "#E11D48", // rose-600
  "#7C3AED", // violet-600
  "#94A3B8", // slate-400 (soft neutral)
];

const FILL_COLORS = [
  "#FFFFFF", // pure white — neutral "no fill"
  "#EFF6FF", // blue-50
  "#F0F9FF", // sky-50
  "#F0FDF4", // green-50
  "#FEF3C7", // amber-100
  "#FFF1F2", // rose-50
  "#F5F3FF", // violet-50
  "#F1F5F9", // slate-100
];

const DASH_OPTIONS: { value: "solid" | "dashed" | "dotted"; label: string; pattern: string }[] = [
  { value: "solid", label: "Solid", pattern: "" },
  { value: "dashed", label: "Dashed", pattern: "8 4" },
  { value: "dotted", label: "Dotted", pattern: "2 3" },
];

// ─── Helpers ────────────────────────────────────────────────────────────

interface DirectoorLikeProps {
  color?: string;
  fill?: string;
  dash?: "solid" | "dashed" | "dotted";
}

/**
 * Check if a shape carries any Directoor-style prop. Used for filtering
 * a mixed selection down to the ones this panel can control.
 */
function hasDirectoorStyleProps(shape: TLShape): boolean {
  const p = shape.props as DirectoorLikeProps | undefined;
  if (!p) return false;
  return (
    typeof p.color === "string" ||
    typeof p.fill === "string" ||
    typeof p.dash === "string"
  );
}

/**
 * Reduce a list of shapes to a single common value for a given prop key.
 * Returns the value if all shapes share it, or undefined if they differ.
 * Used to light up swatches that match the current shared state.
 */
function commonValue<K extends keyof DirectoorLikeProps>(
  shapes: TLShape[],
  key: K,
): DirectoorLikeProps[K] | undefined {
  if (shapes.length === 0) return undefined;
  const first = (shapes[0]!.props as DirectoorLikeProps)[key];
  for (let i = 1; i < shapes.length; i++) {
    if ((shapes[i]!.props as DirectoorLikeProps)[key] !== first) return undefined;
  }
  return first;
}

// ─── Panel ──────────────────────────────────────────────────────────────

export function DirectoorStylePanel() {
  const editor = useEditor();

  // Re-render whenever the selection changes OR any selected shape is
  // updated (so swatches light up to reflect the current shared state
  // after a color is applied).
  const shapes = useValue(
    "selectedDirectoorShapes",
    () => {
      const ids = editor.getSelectedShapeIds();
      const out: TLShape[] = [];
      for (const id of ids) {
        const s = editor.getShape(id);
        if (s && hasDirectoorStyleProps(s)) out.push(s);
      }
      return out;
    },
    [editor],
  );

  const sharedColor = useMemo(() => commonValue(shapes, "color"), [shapes]);
  const sharedFill  = useMemo(() => commonValue(shapes, "fill"),  [shapes]);
  const sharedDash  = useMemo(() => commonValue(shapes, "dash"),  [shapes]);

  // Any shape with each kind of prop — determines whether that section
  // should render. A selection of arrows (no fill) still gets the color
  // + dash sections, for example.
  const anyHasColor = shapes.some((s) => typeof (s.props as DirectoorLikeProps).color === "string");
  const anyHasFill  = shapes.some((s) => typeof (s.props as DirectoorLikeProps).fill  === "string");
  const anyHasDash  = shapes.some((s) => typeof (s.props as DirectoorLikeProps).dash  === "string");

  const apply = useCallback(
    (key: keyof DirectoorLikeProps, value: string) => {
      editor.markHistoryStoppingPoint("Change style");
      const updates = shapes
        .filter((s) => typeof (s.props as DirectoorLikeProps)[key] !== "undefined")
        .map((s) => ({
          id: s.id,
          type: s.type,
          props: { ...(s.props as Record<string, unknown>), [key]: value },
        }));
      // updateShapes takes readonly TLShapePartial[]
      editor.updateShapes(updates as never);
    },
    [editor, shapes],
  );

  if (shapes.length === 0) return null;

  return (
    <div className="directoor-style-panel rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg ring-1 ring-slate-900/5 backdrop-blur-sm">
      {anyHasColor && (
        <Section label="Stroke">
          <SwatchRow
            values={STROKE_COLORS}
            active={sharedColor}
            onPick={(c) => apply("color", c)}
            ringed
          />
        </Section>
      )}

      {anyHasFill && (
        <Section label="Fill">
          <SwatchRow
            values={FILL_COLORS}
            active={sharedFill}
            onPick={(c) => apply("fill", c)}
          />
        </Section>
      )}

      {anyHasDash && (
        <Section label="Line">
          <div className="flex gap-1">
            {DASH_OPTIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => apply("dash", d.value)}
                title={d.label}
                aria-label={d.label}
                className={`flex h-7 w-8 items-center justify-center rounded-md border transition-colors ${
                  sharedDash === d.value
                    ? "border-blue-500 bg-blue-50 text-blue-600"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <svg width="22" height="8" viewBox="0 0 22 8">
                  <line
                    x1="1"
                    y1="4"
                    x2="21"
                    y2="4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray={d.pattern || undefined}
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-1 py-1.5">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      {children}
    </div>
  );
}

function SwatchRow({
  values,
  active,
  onPick,
  ringed,
}: {
  values: string[];
  active: string | undefined;
  onPick: (v: string) => void;
  /** If true, active swatch shows a ring (better contrast on dark strokes). */
  ringed?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {values.map((c) => {
        const isActive = active === c;
        return (
          <button
            key={c}
            onClick={() => onPick(c)}
            title={c}
            aria-label={`Set to ${c}`}
            className={`h-6 w-6 rounded-md border transition-transform hover:scale-110 ${
              isActive
                ? ringed
                  ? "ring-2 ring-blue-500 ring-offset-1 border-white"
                  : "border-blue-500 ring-2 ring-blue-300"
                : "border-slate-200"
            }`}
            style={{ background: c }}
          />
        );
      })}
    </div>
  );
}
