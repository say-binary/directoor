/**
 * Canvas State Engine — The Zustand Store
 *
 * This is the reactive world model that powers the entire product.
 * It maintains the structured JSON representation of the canvas,
 * processes CanvasActions, tracks history for undo/redo, and
 * provides the context snapshot for the Intent Router.
 *
 * Rules:
 * - Zero DOM dependencies
 * - All mutations go through dispatch() — never modify state directly
 * - History is maintained for undo/redo AND for AI context
 * - State is serializable to JSON at any point
 */

import { createStore } from 'zustand/vanilla';
import { nanoid } from 'nanoid';
import type {
  CanvasState,
  CanvasAction,
  CanvasObjectBase,
  CanvasConnection,
  CanvasGroup,
  ActionHistoryEntry,
  Point,
  TimelineStep,
  ObjectStyle,
  ConnectionStyle,
} from './types';

// ─── Store State ─────────────────────────────────────────────────────

export interface CanvasStoreState {
  /** The canvas state (world model) */
  canvas: CanvasState;
  /** Undo history stack */
  undoStack: ActionHistoryEntry[];
  /** Redo history stack */
  redoStack: ActionHistoryEntry[];
  /** Rolling history of recent actions (for AI context) */
  recentActions: ActionHistoryEntry[];
  /** Maximum undo/redo history length */
  maxHistoryLength: number;
  /** Maximum recent actions for AI context */
  maxRecentActions: number;
}

export interface CanvasStoreActions {
  /** Dispatch a canvas action */
  dispatch: (action: CanvasAction, source?: ActionHistoryEntry['source']) => void;
  /** Get a lightweight context snapshot for the Intent Router */
  getContextSnapshot: () => ContextSnapshot;
  /** Reset the canvas to a blank state */
  resetCanvas: (canvasId?: string, userId?: string) => void;
  /** Load a canvas from serialized state */
  loadCanvas: (state: CanvasState) => void;
  /** Get all elements (objects + connections + groups) */
  getAllElements: () => (CanvasObjectBase | CanvasConnection | CanvasGroup)[];
  /** Find element by ID across all collections */
  getElementById: (id: string) => CanvasObjectBase | CanvasConnection | CanvasGroup | undefined;
  /** Get elements by semantic type */
  getElementsBySemanticType: (semanticType: string) => CanvasObjectBase[];
  /** Find elements by label (fuzzy) */
  findByLabel: (query: string) => (CanvasObjectBase | CanvasConnection)[];
}

/** Lightweight snapshot sent to the Intent Router for context */
export interface ContextSnapshot {
  canvasId: string;
  totalObjects: number;
  totalConnections: number;
  totalGroups: number;
  selectedIds: string[];
  selectedElements: Array<{
    id: string;
    type: string;
    semanticType?: string;
    label: string;
  }>;
  /** All objects with just enough info for the LLM to reason about */
  objectSummaries: Array<{
    id: string;
    semanticType: string;
    label: string;
    position: Point;
  }>;
  /** All connections with endpoints */
  connectionSummaries: Array<{
    id: string;
    fromLabel: string;
    toLabel: string;
    label: string;
  }>;
  /** Recent action types for intent prediction */
  recentActionTypes: string[];
  /** Timeline step count */
  timelineStepCount: number;
}

// ─── Initial State ───────────────────────────────────────────────────

function createInitialCanvasState(canvasId?: string, userId?: string): CanvasState {
  const now = Date.now();
  return {
    id: canvasId ?? nanoid(),
    title: 'Untitled Canvas',
    userId: userId ?? '',
    objects: {},
    connections: {},
    groups: {},
    timeline: [],
    viewport: { center: { x: 0, y: 0 }, zoom: 1 },
    selectedIds: [],
    metadata: {
      createdAt: now,
      updatedAt: now,
      backgroundColor: '#FFFFFF',
      showGrid: true,
      snapToGrid: true,
      gridSize: 20,
    },
  };
}

// ─── Action Processor ────────────────────────────────────────────────

/**
 * Coerce any input (array, string, undefined, null) into a string[].
 * Used to guard against malformed payloads from the LLM where `ids`
 * might arrive as a single string, undefined, or null.
 */
function asIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

function processAction(
  state: CanvasState,
  action: CanvasAction,
): { newState: CanvasState; previousState: Record<string, unknown> } {
  const now = Date.now();
  const previousState: Record<string, unknown> = {};

  // Deep clone the relevant parts of state for history
  const newState: CanvasState = {
    ...state,
    metadata: { ...state.metadata, updatedAt: now },
  };

  switch (action.type) {
    case 'CREATE_OBJECT': {
      const id = nanoid();
      const obj: CanvasObjectBase = {
        ...action.payload,
        id,
        createdAt: now,
        updatedAt: now,
      };
      newState.objects = { ...state.objects, [id]: obj };
      previousState[id] = null; // didn't exist before
      break;
    }

    case 'UPDATE_OBJECT': {
      const { id, changes } = action.payload;
      const existing = state.objects[id];
      if (!existing) break;
      previousState[id] = { ...existing };
      newState.objects = {
        ...state.objects,
        [id]: { ...existing, ...changes, id, updatedAt: now },
      };
      break;
    }

    case 'DELETE_ELEMENT': {
      const { id } = action.payload;
      if (state.objects[id]) {
        previousState[id] = { ...state.objects[id] };
        const { [id]: _deleted, ...rest } = state.objects;
        newState.objects = rest;
        // Also remove any connections to/from this object
        const connEntries = Object.entries(state.connections);
        const affectedConns: Record<string, CanvasConnection> = {};
        const remainingConns: Record<string, CanvasConnection> = {};
        for (const [cid, conn] of connEntries) {
          if (conn.fromObjectId === id || conn.toObjectId === id) {
            affectedConns[cid] = conn;
          } else {
            remainingConns[cid] = conn;
          }
        }
        if (Object.keys(affectedConns).length > 0) {
          for (const [cid, conn] of Object.entries(affectedConns)) {
            previousState[cid] = { ...conn };
          }
          newState.connections = remainingConns;
        }
      } else if (state.connections[id]) {
        previousState[id] = { ...state.connections[id] };
        const { [id]: _deleted, ...rest } = state.connections;
        newState.connections = rest;
      } else if (state.groups[id]) {
        previousState[id] = { ...state.groups[id] };
        const { [id]: _deleted, ...rest } = state.groups;
        newState.groups = rest;
      }
      // Remove from selection
      newState.selectedIds = state.selectedIds.filter(sid => sid !== id);
      break;
    }

    case 'CREATE_CONNECTION': {
      const id = nanoid();
      const conn: CanvasConnection = {
        ...action.payload,
        id,
        createdAt: now,
        updatedAt: now,
      };
      newState.connections = { ...state.connections, [id]: conn };
      previousState[id] = null;
      break;
    }

    case 'UPDATE_CONNECTION': {
      const { id, changes } = action.payload;
      const existing = state.connections[id];
      if (!existing) break;
      previousState[id] = { ...existing };
      newState.connections = {
        ...state.connections,
        [id]: { ...existing, ...changes, id, updatedAt: now },
      };
      break;
    }

    case 'CREATE_GROUP': {
      const id = nanoid();
      const group: CanvasGroup = {
        id,
        type: 'group',
        label: action.payload.label,
        memberIds: action.payload.memberIds,
        locked: false,
        visible: true,
        createdAt: now,
        updatedAt: now,
      };
      newState.groups = { ...state.groups, [id]: group };
      // Update member objects to reference this group
      const updatedObjects = { ...state.objects };
      for (const memberId of action.payload.memberIds) {
        if (updatedObjects[memberId]) {
          previousState[memberId] = { ...updatedObjects[memberId] };
          updatedObjects[memberId] = { ...updatedObjects[memberId]!, groupId: id, updatedAt: now };
        }
      }
      newState.objects = updatedObjects;
      previousState[id] = null;
      break;
    }

    case 'UNGROUP': {
      const group = state.groups[action.payload.groupId];
      if (!group) break;
      previousState[group.id] = { ...group };
      const { [group.id]: _deleted, ...restGroups } = state.groups;
      newState.groups = restGroups;
      // Clear groupId from members
      const updatedObjects = { ...state.objects };
      for (const memberId of group.memberIds) {
        if (updatedObjects[memberId]) {
          previousState[memberId] = { ...updatedObjects[memberId] };
          updatedObjects[memberId] = { ...updatedObjects[memberId]!, groupId: null, updatedAt: now };
        }
      }
      newState.objects = updatedObjects;
      break;
    }

    case 'MOVE': {
      const ids = asIds(action.payload.ids);
      const { delta } = action.payload;
      const updatedObjects = { ...state.objects };
      for (const id of ids) {
        const obj = updatedObjects[id];
        if (obj) {
          previousState[id] = { ...obj };
          updatedObjects[id] = {
            ...obj,
            position: {
              x: obj.position.x + delta.x,
              y: obj.position.y + delta.y,
            },
            updatedAt: now,
          };
        }
      }
      newState.objects = updatedObjects;
      break;
    }

    case 'RESIZE': {
      const { id, size } = action.payload;
      const obj = state.objects[id];
      if (!obj) break;
      previousState[id] = { ...obj };
      newState.objects = {
        ...state.objects,
        [id]: { ...obj, size, updatedAt: now },
      };
      break;
    }

    case 'ROTATE': {
      const { id, angle } = action.payload;
      const obj = state.objects[id];
      if (!obj) break;
      previousState[id] = { ...obj };
      newState.objects = {
        ...state.objects,
        [id]: { ...obj, rotation: angle, updatedAt: now },
      };
      break;
    }

    case 'ALIGN': {
      const ids = asIds(action.payload.ids);
      const { alignment } = action.payload;
      const objectsToAlign = ids
        .map(id => state.objects[id])
        .filter((o): o is CanvasObjectBase => o !== undefined);
      if (objectsToAlign.length < 2) break;

      let targetValue: number;
      const updatedObjects = { ...state.objects };

      switch (alignment) {
        case 'left':
          targetValue = Math.min(...objectsToAlign.map(o => o.position.x));
          for (const obj of objectsToAlign) {
            previousState[obj.id] = { ...obj };
            updatedObjects[obj.id] = { ...obj, position: { ...obj.position, x: targetValue }, updatedAt: now };
          }
          break;
        case 'right':
          targetValue = Math.max(...objectsToAlign.map(o => o.position.x + o.size.width));
          for (const obj of objectsToAlign) {
            previousState[obj.id] = { ...obj };
            updatedObjects[obj.id] = { ...obj, position: { ...obj.position, x: targetValue - obj.size.width }, updatedAt: now };
          }
          break;
        case 'center': {
          const centerX = objectsToAlign.reduce((sum, o) => sum + o.position.x + o.size.width / 2, 0) / objectsToAlign.length;
          for (const obj of objectsToAlign) {
            previousState[obj.id] = { ...obj };
            updatedObjects[obj.id] = { ...obj, position: { ...obj.position, x: centerX - obj.size.width / 2 }, updatedAt: now };
          }
          break;
        }
        case 'top':
          targetValue = Math.min(...objectsToAlign.map(o => o.position.y));
          for (const obj of objectsToAlign) {
            previousState[obj.id] = { ...obj };
            updatedObjects[obj.id] = { ...obj, position: { ...obj.position, y: targetValue }, updatedAt: now };
          }
          break;
        case 'bottom':
          targetValue = Math.max(...objectsToAlign.map(o => o.position.y + o.size.height));
          for (const obj of objectsToAlign) {
            previousState[obj.id] = { ...obj };
            updatedObjects[obj.id] = { ...obj, position: { ...obj.position, y: targetValue - obj.size.height }, updatedAt: now };
          }
          break;
        case 'middle': {
          const centerY = objectsToAlign.reduce((sum, o) => sum + o.position.y + o.size.height / 2, 0) / objectsToAlign.length;
          for (const obj of objectsToAlign) {
            previousState[obj.id] = { ...obj };
            updatedObjects[obj.id] = { ...obj, position: { ...obj.position, y: centerY - obj.size.height / 2 }, updatedAt: now };
          }
          break;
        }
      }
      newState.objects = updatedObjects;
      break;
    }

    case 'DISTRIBUTE': {
      const ids = asIds(action.payload.ids);
      const { direction } = action.payload;
      const objectsToDistribute = ids
        .map(id => state.objects[id])
        .filter((o): o is CanvasObjectBase => o !== undefined);
      if (objectsToDistribute.length < 3) break;

      const sorted = [...objectsToDistribute].sort((a, b) =>
        direction === 'horizontal'
          ? a.position.x - b.position.x
          : a.position.y - b.position.y,
      );

      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      const totalSpace = direction === 'horizontal'
        ? (last.position.x + last.size.width) - first.position.x
        : (last.position.y + last.size.height) - first.position.y;
      const totalObjectSize = sorted.reduce(
        (sum, o) => sum + (direction === 'horizontal' ? o.size.width : o.size.height), 0
      );
      const gap = (totalSpace - totalObjectSize) / (sorted.length - 1);

      const updatedObjects = { ...state.objects };
      let currentPos = direction === 'horizontal' ? first.position.x : first.position.y;
      for (const obj of sorted) {
        previousState[obj.id] = { ...obj };
        const newPosition = direction === 'horizontal'
          ? { ...obj.position, x: currentPos }
          : { ...obj.position, y: currentPos };
        updatedObjects[obj.id] = { ...obj, position: newPosition, updatedAt: now };
        currentPos += (direction === 'horizontal' ? obj.size.width : obj.size.height) + gap;
      }
      newState.objects = updatedObjects;
      break;
    }

    case 'SET_STYLE': {
      const ids = asIds(action.payload.ids);
      const { style } = action.payload;
      const updatedObjects = { ...state.objects };
      for (const id of ids) {
        const obj = updatedObjects[id];
        if (obj) {
          previousState[id] = { ...obj };
          updatedObjects[id] = {
            ...obj,
            style: { ...obj.style, ...style } as ObjectStyle,
            updatedAt: now,
          };
        }
      }
      newState.objects = updatedObjects;
      break;
    }

    case 'SET_CONNECTION_STYLE': {
      const ids = asIds(action.payload.ids);
      const { style } = action.payload;
      const updatedConnections = { ...state.connections };
      for (const id of ids) {
        const conn = updatedConnections[id];
        if (conn) {
          previousState[id] = { ...conn };
          updatedConnections[id] = {
            ...conn,
            style: { ...conn.style, ...style } as ConnectionStyle,
            updatedAt: now,
          };
        }
      }
      newState.connections = updatedConnections;
      break;
    }

    case 'SET_LABEL': {
      const { id, label } = action.payload;
      if (state.objects[id]) {
        previousState[id] = { ...state.objects[id] };
        newState.objects = {
          ...state.objects,
          [id]: { ...state.objects[id]!, label, updatedAt: now },
        };
      } else if (state.connections[id]) {
        previousState[id] = { ...state.connections[id] };
        newState.connections = {
          ...state.connections,
          [id]: { ...state.connections[id]!, label, updatedAt: now },
        };
      }
      break;
    }

    case 'SET_Z_INDEX': {
      const { id, zIndex } = action.payload;
      if (state.objects[id]) {
        previousState[id] = { ...state.objects[id] };
        newState.objects = { ...state.objects, [id]: { ...state.objects[id]!, zIndex, updatedAt: now } };
      } else if (state.connections[id]) {
        previousState[id] = { ...state.connections[id] };
        newState.connections = { ...state.connections, [id]: { ...state.connections[id]!, zIndex, updatedAt: now } };
      }
      break;
    }

    case 'BRING_TO_FRONT': {
      const { id } = action.payload;
      const allZIndexes = [
        ...Object.values(state.objects).map(o => o.zIndex),
        ...Object.values(state.connections).map(c => c.zIndex),
      ];
      const maxZ = allZIndexes.length > 0 ? Math.max(...allZIndexes) : 0;
      if (state.objects[id]) {
        previousState[id] = { ...state.objects[id] };
        newState.objects = { ...state.objects, [id]: { ...state.objects[id]!, zIndex: maxZ + 1, updatedAt: now } };
      } else if (state.connections[id]) {
        previousState[id] = { ...state.connections[id] };
        newState.connections = { ...state.connections, [id]: { ...state.connections[id]!, zIndex: maxZ + 1, updatedAt: now } };
      }
      break;
    }

    case 'SEND_TO_BACK': {
      const { id } = action.payload;
      const allZIndexes = [
        ...Object.values(state.objects).map(o => o.zIndex),
        ...Object.values(state.connections).map(c => c.zIndex),
      ];
      const minZ = allZIndexes.length > 0 ? Math.min(...allZIndexes) : 0;
      if (state.objects[id]) {
        previousState[id] = { ...state.objects[id] };
        newState.objects = { ...state.objects, [id]: { ...state.objects[id]!, zIndex: minZ - 1, updatedAt: now } };
      } else if (state.connections[id]) {
        previousState[id] = { ...state.connections[id] };
        newState.connections = { ...state.connections, [id]: { ...state.connections[id]!, zIndex: minZ - 1, updatedAt: now } };
      }
      break;
    }

    case 'BRING_FORWARD':
    case 'SEND_BACKWARD': {
      const { id } = action.payload;
      const delta = action.type === 'BRING_FORWARD' ? 1 : -1;
      if (state.objects[id]) {
        previousState[id] = { ...state.objects[id] };
        newState.objects = { ...state.objects, [id]: { ...state.objects[id]!, zIndex: state.objects[id]!.zIndex + delta, updatedAt: now } };
      } else if (state.connections[id]) {
        previousState[id] = { ...state.connections[id] };
        newState.connections = { ...state.connections, [id]: { ...state.connections[id]!, zIndex: state.connections[id]!.zIndex + delta, updatedAt: now } };
      }
      break;
    }

    case 'DUPLICATE': {
      const updatedObjects = { ...state.objects };
      const updatedConnections = { ...state.connections };
      for (const sourceId of asIds(action.payload.ids)) {
        const obj = state.objects[sourceId];
        if (obj) {
          const newId = nanoid();
          updatedObjects[newId] = {
            ...obj,
            id: newId,
            position: { x: obj.position.x + 20, y: obj.position.y + 20 },
            label: `${obj.label} (copy)`,
            groupId: null,
            animationStep: null,
            animation: null,
            createdAt: now,
            updatedAt: now,
          };
          previousState[newId] = null;
        }
      }
      newState.objects = updatedObjects;
      newState.connections = updatedConnections;
      break;
    }

    case 'LOCK': {
      const updatedObjects = { ...state.objects };
      for (const id of asIds(action.payload.ids)) {
        if (updatedObjects[id]) {
          previousState[id] = { ...updatedObjects[id] };
          updatedObjects[id] = { ...updatedObjects[id]!, locked: true, updatedAt: now };
        }
      }
      newState.objects = updatedObjects;
      break;
    }

    case 'UNLOCK': {
      const updatedObjects = { ...state.objects };
      for (const id of asIds(action.payload.ids)) {
        if (updatedObjects[id]) {
          previousState[id] = { ...updatedObjects[id] };
          updatedObjects[id] = { ...updatedObjects[id]!, locked: false, updatedAt: now };
        }
      }
      newState.objects = updatedObjects;
      break;
    }

    case 'SET_VISIBILITY': {
      const ids = asIds(action.payload.ids);
      const { visible } = action.payload;
      const updatedObjects = { ...state.objects };
      const updatedConnections = { ...state.connections };
      for (const id of ids) {
        if (updatedObjects[id]) {
          previousState[id] = { ...updatedObjects[id] };
          updatedObjects[id] = { ...updatedObjects[id]!, visible, updatedAt: now };
        } else if (updatedConnections[id]) {
          previousState[id] = { ...updatedConnections[id] };
          updatedConnections[id] = { ...updatedConnections[id]!, visible, updatedAt: now };
        }
      }
      newState.objects = updatedObjects;
      newState.connections = updatedConnections;
      break;
    }

    case 'SET_ANIMATION': {
      const { id, step, config } = action.payload;
      if (state.objects[id]) {
        previousState[id] = { ...state.objects[id] };
        newState.objects = {
          ...state.objects,
          [id]: { ...state.objects[id]!, animationStep: step, animation: config, updatedAt: now },
        };
      } else if (state.connections[id]) {
        previousState[id] = { ...state.connections[id] };
        newState.connections = {
          ...state.connections,
          [id]: { ...state.connections[id]!, animationStep: step, animation: config, updatedAt: now },
        };
      }
      // Update timeline
      newState.timeline = rebuildTimeline(newState);
      break;
    }

    case 'REMOVE_ANIMATION': {
      const { id } = action.payload;
      if (state.objects[id]) {
        previousState[id] = { ...state.objects[id] };
        newState.objects = {
          ...state.objects,
          [id]: { ...state.objects[id]!, animationStep: null, animation: null, updatedAt: now },
        };
      } else if (state.connections[id]) {
        previousState[id] = { ...state.connections[id] };
        newState.connections = {
          ...state.connections,
          [id]: { ...state.connections[id]!, animationStep: null, animation: null, updatedAt: now },
        };
      }
      newState.timeline = rebuildTimeline(newState);
      break;
    }

    case 'SET_VIEWPORT': {
      previousState['viewport'] = { ...state.viewport };
      newState.viewport = { ...state.viewport, ...action.payload };
      break;
    }

    case 'SELECT': {
      previousState['selectedIds'] = [...state.selectedIds];
      newState.selectedIds = asIds(action.payload.ids);
      break;
    }

    case 'DESELECT_ALL': {
      previousState['selectedIds'] = [...state.selectedIds];
      newState.selectedIds = [];
      break;
    }

    case 'BATCH': {
      let current = newState;
      for (const subAction of action.payload.actions) {
        const result = processAction(current, subAction);
        current = result.newState;
        Object.assign(previousState, result.previousState);
      }
      return { newState: current, previousState };
    }

    case 'UNDO':
    case 'REDO':
      // Handled at store level, not in processAction
      break;
  }

  return { newState, previousState };
}

/** Rebuild the timeline from current animation steps */
function rebuildTimeline(state: CanvasState): TimelineStep[] {
  const stepMap = new Map<number, string[]>();

  for (const obj of Object.values(state.objects)) {
    if (obj.animationStep !== null) {
      const existing = stepMap.get(obj.animationStep) ?? [];
      existing.push(obj.id);
      stepMap.set(obj.animationStep, existing);
    }
  }

  for (const conn of Object.values(state.connections)) {
    if (conn.animationStep !== null) {
      const existing = stepMap.get(conn.animationStep) ?? [];
      existing.push(conn.id);
      stepMap.set(conn.animationStep, existing);
    }
  }

  return Array.from(stepMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([step, elementIds]) => ({
      step,
      elementIds,
      stepDuration: 1000, // default 1 second per step
    }));
}

// ─── Store Factory ───────────────────────────────────────────────────

export type CanvasStore = CanvasStoreState & CanvasStoreActions;

export function createCanvasStore(canvasId?: string, userId?: string) {
  return createStore<CanvasStore>()((set, get) => ({
    canvas: createInitialCanvasState(canvasId, userId),
    undoStack: [],
    redoStack: [],
    recentActions: [],
    maxHistoryLength: 100,
    maxRecentActions: 20,

    dispatch: (action: CanvasAction, source: ActionHistoryEntry['source'] = 'user-click') => {
      const state = get();

      // Handle undo/redo at the store level
      if (action.type === 'UNDO') {
        const lastEntry = state.undoStack[state.undoStack.length - 1];
        if (!lastEntry) return;

        // Restore previous state by reapplying
        const restoredState = restoreFromHistory(state.canvas, lastEntry);
        set({
          canvas: restoredState,
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [...state.redoStack, lastEntry],
        });
        return;
      }

      if (action.type === 'REDO') {
        const redoEntry = state.redoStack[state.redoStack.length - 1];
        if (!redoEntry) return;

        const { newState } = processAction(state.canvas, redoEntry.action);
        set({
          canvas: newState,
          redoStack: state.redoStack.slice(0, -1),
          undoStack: [...state.undoStack, redoEntry],
        });
        return;
      }

      // Process the action
      const { newState, previousState } = processAction(state.canvas, action);

      // Create history entry
      const historyEntry: ActionHistoryEntry = {
        id: nanoid(),
        action,
        previousState,
        timestamp: Date.now(),
        source,
      };

      // Update state
      set({
        canvas: newState,
        undoStack: [
          ...state.undoStack.slice(-(state.maxHistoryLength - 1)),
          historyEntry,
        ],
        // Clear redo stack on new action
        redoStack: [],
        recentActions: [
          ...state.recentActions.slice(-(state.maxRecentActions - 1)),
          historyEntry,
        ],
      });
    },

    getContextSnapshot: (): ContextSnapshot => {
      const { canvas, recentActions } = get();
      return {
        canvasId: canvas.id,
        totalObjects: Object.keys(canvas.objects).length,
        totalConnections: Object.keys(canvas.connections).length,
        totalGroups: Object.keys(canvas.groups).length,
        selectedIds: canvas.selectedIds,
        selectedElements: canvas.selectedIds.map(id => {
          const obj = canvas.objects[id];
          const conn = canvas.connections[id];
          const group = canvas.groups[id];
          if (obj) return { id, type: 'object', semanticType: obj.semanticType, label: obj.label };
          if (conn) return { id, type: 'connection', label: conn.label };
          if (group) return { id, type: 'group', label: group.label };
          return { id, type: 'unknown', label: '' };
        }),
        objectSummaries: Object.values(canvas.objects).map(obj => ({
          id: obj.id,
          semanticType: obj.semanticType,
          label: obj.label,
          position: obj.position,
        })),
        connectionSummaries: Object.values(canvas.connections).map(conn => ({
          id: conn.id,
          fromLabel: canvas.objects[conn.fromObjectId]?.label ?? 'unknown',
          toLabel: canvas.objects[conn.toObjectId]?.label ?? 'unknown',
          label: conn.label,
        })),
        recentActionTypes: recentActions.slice(-5).map(entry => entry.action.type),
        timelineStepCount: canvas.timeline.length,
      };
    },

    resetCanvas: (canvasId?: string, userId?: string) => {
      set({
        canvas: createInitialCanvasState(canvasId, userId),
        undoStack: [],
        redoStack: [],
        recentActions: [],
      });
    },

    loadCanvas: (canvasState: CanvasState) => {
      set({
        canvas: canvasState,
        undoStack: [],
        redoStack: [],
        recentActions: [],
      });
    },

    getAllElements: () => {
      const { canvas } = get();
      return [
        ...Object.values(canvas.objects),
        ...Object.values(canvas.connections),
        ...Object.values(canvas.groups),
      ];
    },

    getElementById: (id: string) => {
      const { canvas } = get();
      return canvas.objects[id] ?? canvas.connections[id] ?? canvas.groups[id];
    },

    getElementsBySemanticType: (semanticType: string) => {
      const { canvas } = get();
      return Object.values(canvas.objects).filter(obj => obj.semanticType === semanticType);
    },

    findByLabel: (query: string) => {
      const { canvas } = get();
      const normalized = query.toLowerCase();
      const results: (CanvasObjectBase | CanvasConnection)[] = [];
      for (const obj of Object.values(canvas.objects)) {
        if (obj.label.toLowerCase().includes(normalized)) {
          results.push(obj);
        }
      }
      for (const conn of Object.values(canvas.connections)) {
        if (conn.label.toLowerCase().includes(normalized)) {
          results.push(conn);
        }
      }
      return results;
    },
  }));
}

/** Restore canvas state from a history entry (for undo) */
function restoreFromHistory(
  currentState: CanvasState,
  entry: ActionHistoryEntry,
): CanvasState {
  const restored: CanvasState = {
    ...currentState,
    objects: { ...currentState.objects },
    connections: { ...currentState.connections },
    groups: { ...currentState.groups },
    metadata: { ...currentState.metadata, updatedAt: Date.now() },
  };

  for (const [id, prev] of Object.entries(entry.previousState)) {
    if (id === 'viewport') {
      restored.viewport = prev as CanvasState['viewport'];
      continue;
    }
    if (id === 'selectedIds') {
      restored.selectedIds = prev as string[];
      continue;
    }

    if (prev === null) {
      // Element was created — undo means delete it
      delete restored.objects[id];
      delete restored.connections[id];
      delete restored.groups[id];
    } else {
      // Element was modified — restore previous version
      const element = prev as { type?: string };
      if (element.type === 'connection') {
        restored.connections[id] = prev as CanvasConnection;
      } else if (element.type === 'group') {
        restored.groups[id] = prev as CanvasGroup;
      } else {
        restored.objects[id] = prev as CanvasObjectBase;
      }
    }
  }

  return restored;
}
