/**
 * tldraw Bridge
 *
 * Converts @directoor/core CanvasActions into tldraw editor operations.
 * This is the critical bridge between our Canvas State Engine (source of truth)
 * and tldraw (the rendering layer).
 *
 * Key problem solved here:
 * The LLM returns actions with its own IDs (e.g., "box1", "box2", "arrow1").
 * Our store generates real nanoid IDs. Connections reference objects by LLM IDs.
 * This bridge maps LLM IDs → store IDs → tldraw shape IDs.
 */

import {
  Editor,
  createShapeId,
  TLShapeId,
  TLTextShape,
  TLNoteShape,
  toRichText,
} from "tldraw";
import {
  hexToTldrawColor,
  fillFromLegacy,
} from "@/components/canvas/shapes/DirectoorShapes";
import type { CanvasAction } from "@directoor/core";
import { resolveIconShape, defaultStyleForSemanticType } from "@directoor/core";
import { iconShapeToTldrawType } from "@/components/canvas/shapes/DirectoorShapes";

/** Coerce a TLShapeId to a string for use as a prop value */
function tlIdAsString(id: TLShapeId | undefined): string {
  return id ? (id as unknown as string) : "";
}

/** Map a connection-point id ("top"/"right"/...) to our arrow's anchor enum */
function pointToAnchor(point: string): "top" | "right" | "bottom" | "left" | "auto" {
  if (point === "top" || point === "bottom" || point === "left" || point === "right") return point;
  return "auto";
}

// ─── ID Mapping ──────────────────────────────────────────────────────

// Maps: LLM ID → store ID (real nanoid)
const llmToStoreId = new Map<string, string>();
// Maps: store ID → tldraw shape ID
const storeToTldrawId = new Map<string, TLShapeId>();

function getOrCreateTldrawId(storeId: string): TLShapeId {
  let tlId = storeToTldrawId.get(storeId);
  if (!tlId) {
    tlId = createShapeId();
    storeToTldrawId.set(storeId, tlId);
  }
  return tlId;
}

/** Resolve an ID that might be LLM-assigned or a real store ID */
function resolveId(id: string): string {
  return llmToStoreId.get(id) ?? id;
}

/** Resolve to tldraw ID, trying LLM ID → store ID → tldraw ID */
function resolveTldrawId(id: string): TLShapeId | undefined {
  const storeId = resolveId(id);
  return storeToTldrawId.get(storeId);
}

// (No tldraw geo/color helpers needed — every semantic type now
//  routes through a Directoor custom shape with its own palette.)

// ─── Main Entry Point ────────────────────────────────────────────────

type StoreInstance = ReturnType<typeof import("@directoor/core").createCanvasStore>;

/**
 * Execute a batch of CanvasActions on both the store and tldraw editor.
 */
export function executeActions(
  actions: CanvasAction[],
  store: StoreInstance,
  editor: Editor,
): void {
  // Wrap the entire batch in a single undo entry so Cmd-Z reverses the
  // whole LLM response at once — matching the user's mental model that
  // one prompt = one undoable step. editor.run() collapses the batch
  // into a single history entry and markHistoryStoppingPoint labels it.
  editor.markHistoryStoppingPoint(
    actions.length === 1 ? describeAction(actions[0]) : `Apply ${actions.length} edits`,
  );
  editor.run(() => {
    for (const action of actions) {
      executeAction(action, store, editor);
    }
  });
}

/** Human-readable one-line summary of a single action, for the undo stack. */
function describeAction(a: CanvasAction): string {
  switch (a.type) {
    case "CREATE_OBJECT": return "Create shape";
    case "UPDATE_OBJECT": return "Update shape";
    case "DELETE_ELEMENT": return "Delete shape";
    case "CREATE_CONNECTION": return "Create connection";
    case "UPDATE_CONNECTION": return "Update connection";
    default: return "Canvas edit";
  }
}

/**
 * Execute a single CanvasAction.
 */
function executeAction(
  action: CanvasAction,
  store: StoreInstance,
  editor: Editor,
): void {
  switch (action.type) {
    case "CREATE_OBJECT": {
      // Get LLM-assigned ID — check both _llmId (normalized) and id (raw fallback)
      const md = action.payload.metadata as Record<string, unknown>;
      const llmId = (md?._llmId as string) ?? (md?.id as string) ?? undefined;

      // Dispatch to store (generates real ID)
      store.getState().dispatch(action, "ai-llm");

      // Find the newly created object (last one added)
      const objects = store.getState().canvas.objects;
      const objectIds = Object.keys(objects);
      const newStoreId = objectIds[objectIds.length - 1];
      if (!newStoreId) break;

      // Map LLM ID → store ID
      if (llmId) {
        llmToStoreId.set(llmId, newStoreId);
      }

      // Create tldraw shape
      const obj = objects[newStoreId]!;
      const tlId = getOrCreateTldrawId(newStoreId);

      if (obj.semanticType === "text") {
        editor.createShape<TLTextShape>({
          id: tlId,
          type: "text",
          x: obj.position.x,
          y: obj.position.y,
          props: {
            richText: toRichText(obj.label),
            size: "m",
            font: "sans",
            color: "black",
          },
        });
      } else if (obj.semanticType === "sticky-note") {
        editor.createShape<TLNoteShape>({
          id: tlId,
          type: "note",
          x: obj.position.x,
          y: obj.position.y,
          props: {
            richText: toRichText(obj.label),
            size: "m",
            font: "sans",
            color: "yellow",
          },
        });
      } else {
        // Resolve an iconShape from the semantic type. If tldraw's native
        // geo shape can render it (rectangle/ellipse/diamond/hexagon/
        // cloud), create a `geo` shape — this keeps the diagram using
        // familiar native shapes that the style panel + PPTX export +
        // geo tool all understand natively. Otherwise fall back to the
        // Directoor custom shape type for cases that tldraw doesn't
        // have (cylinder / actor / document / stack / pill / layer /
        // queue).
        const iconShape = resolveIconShape(obj.semanticType);
        const defaults = defaultStyleForSemanticType(obj.semanticType);
        const stroke = obj.style.stroke && obj.style.stroke !== "#334155"
          ? obj.style.stroke
          : defaults.stroke;
        const fill = obj.style.fill && obj.style.fill !== "transparent" && obj.style.fill !== "#FFFFFF"
          ? obj.style.fill
          : defaults.fill;
        const dash: "solid" | "dashed" | "dotted" =
          obj.style.strokeStyle === "dashed" || obj.style.strokeStyle === "dotted"
            ? obj.style.strokeStyle
            : "solid";

        // iconShape → tldraw native geo variant (if applicable)
        const NATIVE_GEO: Record<string, string | undefined> = {
          rectangle: "rectangle",
          circle: "ellipse",
          diamond: "diamond",
          hexagon: "hexagon",
          cloud: "cloud",
        };
        const nativeVariant = NATIVE_GEO[iconShape];

        if (nativeVariant) {
          // Native tldraw geo shape — uses the same style registry as
          // the DefaultStylePanel, and exports cleanly to PNG/SVG/PPTX.
          // Defaults: dash=solid, size=s, font=sans (per house style).
          editor.createShape({
            id: tlId,
            type: "geo",
            x: obj.position.x,
            y: obj.position.y,
            props: {
              w: obj.size.width,
              h: obj.size.height,
              geo: nativeVariant,
              color: hexToTldrawColor(stroke),
              fill: fillFromLegacy(fill),
              dash,
              size: "s",
              font: "sans",
              align: "middle",
              verticalAlign: "middle",
              richText: toRichText(obj.label ?? ""),
            },
          });
        } else {
          // Directoor-unique shape (cylinder, actor, document, stack,
          // pill, layer, queue). Same style enums as above so the
          // style panel and exports behave consistently.
          const customType = iconShapeToTldrawType(iconShape);
          editor.createShape({
            id: tlId,
            type: customType,
            x: obj.position.x,
            y: obj.position.y,
            props: {
              w: obj.size.width,
              h: obj.size.height,
              richText: toRichText(obj.label ?? ""),
              color: hexToTldrawColor(stroke),
              fill: fillFromLegacy(fill),
              dash,
              font: "sans",
              size: "s",
              align: "middle",
              verticalAlign: "middle",
              labelColor: "black",
              animated: false,
            },
          });
        }
      }
      break;
    }

    case "CREATE_CONNECTION": {
      const md = action.payload.metadata as Record<string, unknown>;
      const llmId = (md?._llmId as string) ?? (md?.id as string) ?? undefined;

      // Resolve LLM IDs to real store IDs for the endpoints
      const resolvedFromId = resolveId(action.payload.fromObjectId);
      const resolvedToId = resolveId(action.payload.toObjectId);

      // Update the action with resolved IDs before dispatching
      const resolvedAction: CanvasAction = {
        type: "CREATE_CONNECTION",
        payload: {
          ...action.payload,
          fromObjectId: resolvedFromId,
          toObjectId: resolvedToId,
        },
      };

      // Dispatch to store
      store.getState().dispatch(resolvedAction, "ai-llm");

      // Find newly created connection
      const connections = store.getState().canvas.connections;
      const connIds = Object.keys(connections);
      const newConnId = connIds[connIds.length - 1];
      if (!newConnId) break;

      if (llmId) {
        llmToStoreId.set(llmId, newConnId);
      }

      const conn = connections[newConnId]!;
      const tlId = getOrCreateTldrawId(newConnId);

      // Get tldraw IDs for source and target shapes
      const fromTlId = storeToTldrawId.get(resolvedFromId);
      const toTlId = storeToTldrawId.get(resolvedToId);

      // Compute initial absolute endpoints from store object positions
      const fromObj = store.getState().canvas.objects[resolvedFromId];
      const toObj = store.getState().canvas.objects[resolvedToId];
      const safeNum = (n: unknown, fallback: number) => Number.isFinite(n as number) ? (n as number) : fallback;

      const startX = fromObj ? safeNum(fromObj.position.x, 0) + safeNum(fromObj.size.width, 140) : 0;
      const startY = fromObj ? safeNum(fromObj.position.y, 0) + safeNum(fromObj.size.height, 80) / 2 : 0;
      const endX = toObj ? safeNum(toObj.position.x, 200) : 200;
      const endY = toObj ? safeNum(toObj.position.y, 0) + safeNum(toObj.size.height, 80) / 2 : 0;

      // Create our custom Directoor arrow with optional shape bindings.
      // The arrow's component re-renders on store changes so it follows
      // bound shapes when they move.
      editor.createShape({
        id: tlId,
        type: "directoor-arrow",
        x: 0,
        y: 0,
        props: {
          startX, startY, endX, endY,
          fromShapeId: fromTlId ?? "",
          toShapeId: tlIdAsString(toTlId),
          fromAnchor: pointToAnchor(conn.fromPointId),
          toAnchor: pointToAnchor(conn.toPointId),
          color: hexToTldrawColor(conn.style.stroke || "#334155"),
          strokeWidth: conn.style.strokeWidth || 2,
          dash: (conn.style.strokeStyle === "dashed" || conn.style.strokeStyle === "dotted")
            ? conn.style.strokeStyle
            : "solid",
          startHead: conn.style.startHead === "none" ? "none" : "arrow",
          endHead: conn.style.endHead === "none" ? "none" : "arrow",
          path: conn.style.path === "straight" ? "straight" : "elbow",
          // Bend offsets all default to 0 — LLM connections start as
          // straight/elbow; user can drag the bend handles afterwards
          // to shape the path if they want. squiggleOffset is legacy.
          squiggleOffset: 0,
          bend1Offset: 0,
          bend2Offset: 0,
          bend3Offset: 0,
          label: conn.label || "",
          labelPosition: 0.5,
        },
      });

      // If the connection has a non-empty label, also create a standalone
      // directoor-text shape positioned at the arrow's midpoint. This text
      // is a separate shape that the user can move, rotate, resize, and
      // edit independently of the arrow itself.
      if (conn.label && conn.label.trim()) {
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        // Perpendicular offset to float above the line by ~18px
        const dx = endX - startX;
        const dy = endY - startY;
        const len = Math.hypot(dx, dy) || 1;
        const perpSign = dy < 0 || (dy === 0 && dx !== 0) ? 1 : -1;
        const labelOffsetX = (-dy / len) * 18 * perpSign;
        const labelOffsetY = (dx / len) * 18 * perpSign;
        const textW = Math.max(80, conn.label.length * 7 + 16);
        const textH = 26;
        editor.createShape({
          id: createShapeId(),
          type: "directoor-text",
          x: midX + labelOffsetX - textW / 2,
          y: midY + labelOffsetY - textH / 2,
          props: {
            w: textW,
            h: textH,
            text: conn.label,
            color: "#0F172A",
            size: "m",
            weight: "normal",
            align: "center",
            background: "subtle",
            contentType: "inline",
          },
        });
      }
      break;
    }

    case "DELETE_ELEMENT": {
      const storeId = resolveId(action.payload.id);
      store.getState().dispatch(
        { type: "DELETE_ELEMENT", payload: { id: storeId } },
        "ai-llm",
      );
      const tlId = storeToTldrawId.get(storeId);
      if (tlId && editor.getShape(tlId)) {
        editor.deleteShapes([tlId]);
      }
      break;
    }

    case "UPDATE_OBJECT": {
      const storeId = resolveId(action.payload.id);
      store.getState().dispatch(
        { ...action, payload: { ...action.payload, id: storeId } },
        "ai-llm",
      );
      const tlId = storeToTldrawId.get(storeId);
      if (!tlId) break;
      const shape = editor.getShape(tlId);
      if (!shape) break;

      const changes = action.payload.changes;
      const updates: Record<string, unknown> = {};

      if (changes.position) {
        updates.x = changes.position.x;
        updates.y = changes.position.y;
      }
      if (changes.size) {
        updates.props = {
          ...((updates.props as Record<string, unknown>) ?? {}),
          w: changes.size.width,
          h: changes.size.height,
        };
      }
      if (changes.label) {
        // Geo/note shapes use richText, arrows use text
        const isArrow = shape.type === "arrow";
        updates.props = {
          ...((updates.props as Record<string, unknown>) ?? {}),
          ...(isArrow
            ? { text: changes.label }
            : { richText: toRichText(changes.label) }),
        };
      }
      if (changes.style) {
        const props: Record<string, unknown> =
          (updates.props as Record<string, unknown>) ?? {};
        if (changes.style.strokeStyle) {
          props.dash =
            changes.style.strokeStyle === "dashed"
              ? "dashed"
              : changes.style.strokeStyle === "dotted"
                ? "dotted"
                : "solid";
        }
        updates.props = props;
      }

      if (Object.keys(updates).length > 0) {
        editor.updateShape({ id: tlId, type: shape.type, ...updates });
      }
      break;
    }

    case "MOVE": {
      const resolvedIds = action.payload.ids.map(resolveId);
      store.getState().dispatch(
        { type: "MOVE", payload: { ids: resolvedIds, delta: action.payload.delta } },
        "ai-llm",
      );
      for (const id of resolvedIds) {
        const tlId = storeToTldrawId.get(id);
        if (!tlId) continue;
        const shape = editor.getShape(tlId);
        if (shape) {
          editor.updateShape({
            id: tlId,
            type: shape.type,
            x: shape.x + action.payload.delta.x,
            y: shape.y + action.payload.delta.y,
          });
        }
      }
      break;
    }

    case "SET_STYLE": {
      const resolvedIds = action.payload.ids.map(resolveId);
      store.getState().dispatch(
        { type: "SET_STYLE", payload: { ids: resolvedIds, style: action.payload.style } },
        "ai-llm",
      );
      for (const id of resolvedIds) {
        const tlId = storeToTldrawId.get(id);
        if (!tlId) continue;
        const shape = editor.getShape(tlId);
        if (!shape) continue;
        const props: Record<string, unknown> = {};
        if (action.payload.style.strokeStyle) {
          props.dash =
            action.payload.style.strokeStyle === "dashed"
              ? "dashed"
              : action.payload.style.strokeStyle === "dotted"
                ? "dotted"
                : "solid";
        }
        if (Object.keys(props).length > 0) {
          editor.updateShape({ id: tlId, type: shape.type, props });
        }
      }
      break;
    }

    case "SET_LABEL": {
      const storeId = resolveId(action.payload.id);
      store.getState().dispatch(
        { type: "SET_LABEL", payload: { id: storeId, label: action.payload.label } },
        "ai-llm",
      );
      const tlId = storeToTldrawId.get(storeId);
      if (tlId) {
        const shape = editor.getShape(tlId);
        if (shape) {
          const isArrow = shape.type === "arrow";
          editor.updateShape({
            id: tlId,
            type: shape.type,
            props: isArrow
              ? { text: action.payload.label }
              : { richText: toRichText(action.payload.label) },
          });
        }
      }
      break;
    }

    case "ALIGN": {
      const resolvedIds = action.payload.ids.map(resolveId);
      store.getState().dispatch(
        { type: "ALIGN", payload: { ids: resolvedIds, alignment: action.payload.alignment } },
        "ai-llm",
      );
      const tlIds = resolvedIds
        .map((id) => storeToTldrawId.get(id))
        .filter((id): id is TLShapeId => id !== undefined);
      if (tlIds.length >= 2) {
        const alignMap: Record<string, "left" | "center-horizontal" | "right" | "top" | "center-vertical" | "bottom"> = {
          left: "left",
          center: "center-horizontal",
          right: "right",
          top: "top",
          middle: "center-vertical",
          bottom: "bottom",
        };
        editor.alignShapes(tlIds, alignMap[action.payload.alignment] ?? "center-horizontal");
      }
      break;
    }

    case "DISTRIBUTE": {
      const resolvedIds = action.payload.ids.map(resolveId);
      store.getState().dispatch(
        { type: "DISTRIBUTE", payload: { ids: resolvedIds, direction: action.payload.direction } },
        "ai-llm",
      );
      const tlIds = resolvedIds
        .map((id) => storeToTldrawId.get(id))
        .filter((id): id is TLShapeId => id !== undefined);
      if (tlIds.length >= 3) {
        editor.distributeShapes(tlIds, action.payload.direction);
      }
      break;
    }

    case "DUPLICATE": {
      const resolvedIds = action.payload.ids.map(resolveId);
      store.getState().dispatch(
        { type: "DUPLICATE", payload: { ids: resolvedIds } },
        "ai-llm",
      );
      const tlIds = resolvedIds
        .map((id) => storeToTldrawId.get(id))
        .filter((id): id is TLShapeId => id !== undefined);
      if (tlIds.length > 0) {
        editor.duplicateShapes(tlIds, { x: 20, y: 20 });
      }
      break;
    }

    case "BRING_TO_FRONT":
    case "SEND_TO_BACK":
    case "BRING_FORWARD":
    case "SEND_BACKWARD": {
      const storeId = resolveId(action.payload.id);
      store.getState().dispatch(
        { type: action.type, payload: { id: storeId } } as CanvasAction,
        "ai-llm",
      );
      const tlId = storeToTldrawId.get(storeId);
      if (tlId) {
        if (action.type === "BRING_TO_FRONT") editor.bringToFront([tlId]);
        else if (action.type === "SEND_TO_BACK") editor.sendToBack([tlId]);
        else if (action.type === "BRING_FORWARD") editor.bringForward([tlId]);
        else editor.sendBackward([tlId]);
      }
      break;
    }

    case "SELECT": {
      const resolvedIds = action.payload.ids.map(resolveId);
      store.getState().dispatch(
        { type: "SELECT", payload: { ids: resolvedIds } },
        "ai-llm",
      );
      const tlIds = resolvedIds
        .map((id) => storeToTldrawId.get(id))
        .filter((id): id is TLShapeId => id !== undefined);
      if (tlIds.length > 0) editor.select(...tlIds);
      break;
    }

    case "DESELECT_ALL": {
      store.getState().dispatch(action, "ai-llm");
      editor.selectNone();
      break;
    }

    case "SET_ANIMATION":
    case "REMOVE_ANIMATION": {
      // Animation is tracked in our store only
      store.getState().dispatch(action, "ai-llm");
      break;
    }

    case "UNDO": {
      store.getState().dispatch(action, "ai-llm");
      editor.undo();
      break;
    }

    case "REDO": {
      store.getState().dispatch(action, "ai-llm");
      editor.redo();
      break;
    }

    case "BATCH": {
      for (const subAction of action.payload.actions) {
        executeAction(subAction, store, editor);
      }
      break;
    }

    default:
      // Dispatch to store for any other action
      store.getState().dispatch(action, "ai-llm");
      break;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function clearIdMappings(): void {
  llmToStoreId.clear();
  storeToTldrawId.clear();
}
