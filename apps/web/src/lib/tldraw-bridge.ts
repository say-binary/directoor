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
  TLGeoShape,
  TLArrowShape,
  TLTextShape,
  TLNoteShape,
} from "tldraw";
import type { CanvasAction, SemanticType } from "@directoor/core";
import { getIconShape } from "@directoor/core";
import { iconShapeToTldrawType } from "@/components/canvas/shapes/DirectoorShapes";

/** Convert plain text to tldraw's richText format (ProseMirror doc) */
function toRichText(text: string) {
  const lines = text.split("\n");
  const content = lines.map((line) => {
    if (!line) return { type: "paragraph" };
    return { type: "paragraph", content: [{ type: "text", text: line }] };
  });
  return { type: "doc", content };
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

// ─── Semantic Type Helpers ───────────────────────────────────────────

function semanticTypeToGeo(
  semanticType: SemanticType,
): TLGeoShape["props"]["geo"] {
  switch (semanticType) {
    case "diamond":
      return "diamond";
    case "circle":
      return "ellipse";
    default:
      return "rectangle";
  }
}

function semanticTypeToColor(
  semanticType: SemanticType,
): TLGeoShape["props"]["color"] {
  switch (semanticType) {
    case "database":
      return "blue";
    case "service":
    case "microservice":
      return "green";
    case "queue":
      return "orange";
    case "cache":
      return "yellow";
    case "api-gateway":
      return "violet";
    case "load-balancer":
      return "light-green";
    case "client":
    case "user-actor":
      return "red";
    case "data-lake":
      return "light-blue";
    case "storage":
      return "yellow";
    case "function":
      return "violet";
    case "container":
      return "grey";
    case "external-system":
      return "grey";
    default:
      return "black";
  }
}

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
  for (const action of actions) {
    executeAction(action, store, editor);
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
      // Get LLM-assigned ID from metadata before dispatching
      const llmId = (action.payload.metadata as Record<string, unknown>)?._llmId as string | undefined;

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
        // Decide between custom Directoor shape vs. native tldraw geo shape
        const iconShape = getIconShape(obj.semanticType);
        const customType = iconShapeToTldrawType(iconShape);

        if (customType) {
          // Use one of our 6 custom shape utils (cylinder/hexagon/actor/cloud/document/stack)
          editor.createShape({
            id: tlId,
            type: customType,
            x: obj.position.x,
            y: obj.position.y,
            props: {
              w: obj.size.width,
              h: obj.size.height,
              label: obj.label,
              color: obj.style.stroke,
              fill: obj.style.fill === "transparent" ? "#FFFFFF" : obj.style.fill,
              dash: obj.style.strokeStyle,
            },
          });
        } else {
          // Native tldraw geo shape (rectangle, circle, diamond, generic-box, etc.)
          const isArchObject =
            obj.semanticType !== "rectangle" &&
            obj.semanticType !== "circle" &&
            obj.semanticType !== "diamond";

          editor.createShape<TLGeoShape>({
            id: tlId,
            type: "geo",
            x: obj.position.x,
            y: obj.position.y,
            props: {
              w: obj.size.width,
              h: obj.size.height,
              geo: semanticTypeToGeo(obj.semanticType),
              color: semanticTypeToColor(obj.semanticType),
              richText: toRichText(obj.label),
              size: "m",
              font: "sans",
              dash:
                obj.style.strokeStyle === "dashed"
                  ? "dashed"
                  : obj.style.strokeStyle === "dotted"
                    ? "dotted"
                    : "solid",
              fill: isArchObject ? "semi" : "none",
            },
          });
        }
      }
      break;
    }

    case "CREATE_CONNECTION": {
      const llmId = (action.payload.metadata as Record<string, unknown>)?._llmId as string | undefined;

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

      if (fromTlId && toTlId) {
        // Create bound arrow
        editor.createShape<TLArrowShape>({
          id: tlId,
          type: "arrow",
          props: {
            text: conn.label || "",
            color: "black",
            size: "m",
            dash:
              conn.style.strokeStyle === "dashed"
                ? "dashed"
                : conn.style.strokeStyle === "dotted"
                  ? "dotted"
                  : "solid",
            arrowheadEnd: conn.style.endHead === "none" ? "none" : "arrow",
            arrowheadStart:
              conn.style.startHead === "none" ? "none" : "arrow",
          },
        });

        // Bind arrow endpoints to shapes
        editor.createBindings([
          {
            type: "arrow",
            fromId: tlId,
            toId: fromTlId,
            props: {
              terminal: "start",
              isExact: false,
              isPrecise: true,
              normalizedAnchor: getAnchorForPoint(conn.fromPointId),
            },
          },
          {
            type: "arrow",
            fromId: tlId,
            toId: toTlId,
            props: {
              terminal: "end",
              isExact: false,
              isPrecise: true,
              normalizedAnchor: getAnchorForPoint(conn.toPointId),
            },
          },
        ]);
      } else {
        // Fallback: position-based arrow if we can't bind
        const fromObj = store.getState().canvas.objects[resolvedFromId];
        const toObj = store.getState().canvas.objects[resolvedToId];

        if (fromObj && toObj) {
          const startX = fromObj.position.x + fromObj.size.width;
          const startY = fromObj.position.y + fromObj.size.height / 2;
          const endX = toObj.position.x;
          const endY = toObj.position.y + toObj.size.height / 2;

          editor.createShape<TLArrowShape>({
            id: tlId,
            type: "arrow",
            x: startX,
            y: startY,
            props: {
              text: conn.label || "",
              color: "black",
              size: "m",
              dash:
                conn.style.strokeStyle === "dashed"
                  ? "dashed"
                  : conn.style.strokeStyle === "dotted"
                    ? "dotted"
                    : "solid",
              start: { x: 0, y: 0 },
              end: { x: endX - startX, y: endY - startY },
              arrowheadEnd:
                conn.style.endHead === "none" ? "none" : "arrow",
              arrowheadStart:
                conn.style.startHead === "none" ? "none" : "arrow",
            },
          });
        }
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

function getAnchorForPoint(pointId: string): { x: number; y: number } {
  switch (pointId) {
    case "top":
      return { x: 0.5, y: 0 };
    case "bottom":
      return { x: 0.5, y: 1 };
    case "left":
      return { x: 0, y: 0.5 };
    case "right":
      return { x: 1, y: 0.5 };
    default:
      return { x: 0.5, y: 0.5 };
  }
}

export function clearIdMappings(): void {
  llmToStoreId.clear();
  storeToTldrawId.clear();
}
