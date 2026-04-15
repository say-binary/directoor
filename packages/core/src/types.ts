/**
 * @directoor/core — Type definitions
 *
 * These types define the Canvas State Engine's world model.
 * FOREVER DECISION: This schema shapes every layer of the product.
 * Changes here affect the Intent Router, Object Library, Animation Timeline,
 * Command Logging, and every platform shell.
 *
 * Rules:
 * - Zero DOM dependencies (must run in browser, React Native, Node.js, workers)
 * - Every object is semantically typed (not just visual shapes)
 * - All positions/sizes are in logical canvas coordinates, not pixels
 * - IDs are nanoid-generated, globally unique
 */

// ─── Primitive Value Types ───────────────────────────────────────────

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Bounds = Point & Size;
export type Color = string; // hex (#RRGGBB) or CSS color

// ─── Semantic Object Types ───────────────────────────────────────────

/**
 * Every canvas object has a semantic type.
 * The Intent Router and Object Library use this to understand
 * what the user is working with — not just "a rectangle."
 */
export type SemanticType =
  // Architecture diagram objects
  | 'database'
  | 'service'
  | 'queue'
  | 'cache'
  | 'api-gateway'
  | 'load-balancer'
  | 'client'
  | 'data-lake'
  | 'storage'
  | 'function'
  | 'container'
  | 'user-actor'
  | 'external-system'
  | 'microservice'
  | 'generic-box'
  // Primitives
  | 'rectangle'
  | 'circle'
  | 'diamond'
  | 'text'
  | 'sticky-note'
  | 'image';

/** Arrow/connection types */
export type ConnectionType = 'arrow' | 'line';

/** Arrow line styles */
export type LineStyle = 'solid' | 'dashed' | 'dotted';

/** Arrow path styles */
export type ArrowPath = 'straight' | 'elbow' | 'curved';

/** Arrow head styles */
export type ArrowHead = 'none' | 'arrow' | 'triangle' | 'diamond' | 'circle';

// ─── Style Properties ────────────────────────────────────────────────

export interface ObjectStyle {
  fill: Color;
  stroke: Color;
  strokeWidth: number;
  strokeStyle: LineStyle;
  opacity: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
  borderRadius?: number;
}

export interface ConnectionStyle {
  stroke: Color;
  strokeWidth: number;
  strokeStyle: LineStyle;
  opacity: number;
  startHead: ArrowHead;
  endHead: ArrowHead;
  path: ArrowPath;
}

// ─── Connection Points ───────────────────────────────────────────────

/** Where arrows can attach to an object */
export type ConnectionPointPosition = 'top' | 'right' | 'bottom' | 'left' | 'center';

export interface ConnectionPoint {
  id: string;
  position: ConnectionPointPosition;
  /** Offset from the default position (0-1 range along the edge) */
  offset?: number;
}

// ─── Canvas Objects ──────────────────────────────────────────────────

/** Base properties shared by all canvas objects */
export interface CanvasObjectBase {
  id: string;
  type: 'object';
  semanticType: SemanticType;
  label: string;
  position: Point;
  size: Size;
  rotation: number;
  style: ObjectStyle;
  connectionPoints: ConnectionPoint[];
  /** Z-order on the canvas */
  zIndex: number;
  /** Group membership (null if ungrouped) */
  groupId: string | null;
  /** Animation timeline step (null if not animated) */
  animationStep: number | null;
  /** Animation configuration */
  animation: AnimationConfig | null;
  /** Whether this object is locked from editing */
  locked: boolean;
  /** Whether this object is visible */
  visible: boolean;
  /** Custom metadata (extensible per semantic type) */
  metadata: Record<string, unknown>;
  /** Timestamp of creation */
  createdAt: number;
  /** Timestamp of last modification */
  updatedAt: number;
}

/** A connection (arrow/line) between two objects */
export interface CanvasConnection {
  id: string;
  type: 'connection';
  connectionType: ConnectionType;
  /** Source object ID */
  fromObjectId: string;
  /** Source connection point ID */
  fromPointId: string;
  /** Target object ID */
  toObjectId: string;
  /** Target connection point ID */
  toPointId: string;
  /** Optional waypoints for custom routing */
  waypoints: Point[];
  /** Label on the connection */
  label: string;
  style: ConnectionStyle;
  zIndex: number;
  groupId: string | null;
  animationStep: number | null;
  animation: AnimationConfig | null;
  locked: boolean;
  visible: boolean;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** A group of objects */
export interface CanvasGroup {
  id: string;
  type: 'group';
  label: string;
  /** IDs of member objects and connections */
  memberIds: string[];
  locked: boolean;
  visible: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Union type for any element on the canvas */
export type CanvasElement = CanvasObjectBase | CanvasConnection | CanvasGroup;

// ─── Animation ───────────────────────────────────────────────────────

export type AnimationEffect =
  | 'fade-in'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'scale-in'
  | 'draw-in'       // For arrows — draws the path progressively
  | 'typewriter'     // For text — types character by character
  | 'none';

export type EasingFunction =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'spring';

export interface AnimationConfig {
  effect: AnimationEffect;
  duration: number;       // milliseconds
  delay: number;          // milliseconds (delay after step starts)
  easing: EasingFunction;
}

export interface TimelineStep {
  step: number;
  /** IDs of elements that animate in this step */
  elementIds: string[];
  /** Duration of this step before moving to the next */
  stepDuration: number;   // milliseconds
}

// ─── Canvas State (The World Model) ──────────────────────────────────

export interface CanvasState {
  /** Unique canvas ID */
  id: string;
  /** Canvas title */
  title: string;
  /** User who owns this canvas */
  userId: string;

  /** All objects on the canvas, keyed by ID */
  objects: Record<string, CanvasObjectBase>;
  /** All connections, keyed by ID */
  connections: Record<string, CanvasConnection>;
  /** All groups, keyed by ID */
  groups: Record<string, CanvasGroup>;

  /** Ordered timeline steps */
  timeline: TimelineStep[];

  /** Canvas viewport state */
  viewport: {
    center: Point;
    zoom: number;
  };

  /** Currently selected element IDs */
  selectedIds: string[];

  /** Canvas-level metadata */
  metadata: {
    createdAt: number;
    updatedAt: number;
    /** Background color */
    backgroundColor: Color;
    /** Grid visibility */
    showGrid: boolean;
    /** Snap to grid */
    snapToGrid: boolean;
    gridSize: number;
  };
}

// ─── Canvas Actions (What the Intent Router calls) ────────────────────

/** All possible operations the Canvas API supports */
export type CanvasAction =
  | { type: 'CREATE_OBJECT'; payload: Omit<CanvasObjectBase, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_OBJECT'; payload: { id: string; changes: Partial<CanvasObjectBase> } }
  | { type: 'DELETE_ELEMENT'; payload: { id: string } }
  | { type: 'CREATE_CONNECTION'; payload: Omit<CanvasConnection, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_CONNECTION'; payload: { id: string; changes: Partial<CanvasConnection> } }
  | { type: 'CREATE_GROUP'; payload: { label: string; memberIds: string[] } }
  | { type: 'UNGROUP'; payload: { groupId: string } }
  | { type: 'MOVE'; payload: { ids: string[]; delta: Point } }
  | { type: 'RESIZE'; payload: { id: string; size: Size } }
  | { type: 'ROTATE'; payload: { id: string; angle: number } }
  | { type: 'ALIGN'; payload: { ids: string[]; alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' } }
  | { type: 'DISTRIBUTE'; payload: { ids: string[]; direction: 'horizontal' | 'vertical' } }
  | { type: 'SET_STYLE'; payload: { ids: string[]; style: Partial<ObjectStyle> } }
  | { type: 'SET_CONNECTION_STYLE'; payload: { ids: string[]; style: Partial<ConnectionStyle> } }
  | { type: 'SET_LABEL'; payload: { id: string; label: string } }
  | { type: 'SET_Z_INDEX'; payload: { id: string; zIndex: number } }
  | { type: 'BRING_FORWARD'; payload: { id: string } }
  | { type: 'SEND_BACKWARD'; payload: { id: string } }
  | { type: 'BRING_TO_FRONT'; payload: { id: string } }
  | { type: 'SEND_TO_BACK'; payload: { id: string } }
  | { type: 'DUPLICATE'; payload: { ids: string[] } }
  | { type: 'LOCK'; payload: { ids: string[] } }
  | { type: 'UNLOCK'; payload: { ids: string[] } }
  | { type: 'SET_VISIBILITY'; payload: { ids: string[]; visible: boolean } }
  | { type: 'SET_ANIMATION'; payload: { id: string; step: number; config: AnimationConfig } }
  | { type: 'REMOVE_ANIMATION'; payload: { id: string } }
  | { type: 'SET_VIEWPORT'; payload: { center?: Point; zoom?: number } }
  | { type: 'SELECT'; payload: { ids: string[] } }
  | { type: 'DESELECT_ALL'; payload: Record<string, never> }
  | { type: 'UNDO'; payload: Record<string, never> }
  | { type: 'REDO'; payload: Record<string, never> }
  | { type: 'BATCH'; payload: { actions: CanvasAction[] } };

// ─── Action History (for Undo/Redo + AI Context) ─────────────────────

export interface ActionHistoryEntry {
  id: string;
  action: CanvasAction;
  /** Canvas state snapshot of affected elements BEFORE the action */
  previousState: Record<string, unknown>;
  timestamp: number;
  /** Source of the action */
  source: 'user-click' | 'user-command' | 'ai-deterministic' | 'ai-llm';
}

// ─── Command Logging (Proprietary Dataset) ───────────────────────────

export interface CommandLog {
  id: string;
  canvasId: string;
  userId: string;
  /** Raw input from user */
  rawInput: string;
  /** Input type */
  inputType: 'text' | 'voice';
  /** Parsed intent (what the router decided) */
  parsedIntent: {
    route: 'deterministic' | 'llm';
    confidence: number;
    /** The action(s) that were executed */
    actions: CanvasAction[];
  };
  /** Canvas state snapshot BEFORE execution (lightweight — just affected element IDs + types) */
  contextSnapshot: {
    totalObjects: number;
    totalConnections: number;
    selectedIds: string[];
    recentActions: string[]; // last 5 action types
  };
  /** LLM details (only if route was 'llm') */
  llmDetails?: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    rawResponse: string;
  };
  /** User feedback (null until user reacts) */
  feedback: 'positive' | 'negative' | null;
  /** If negative, what correction did the user make? */
  correction?: {
    undone: boolean;
    followUpCommand?: string;
  };
  /** Execution result */
  executionResult: 'success' | 'error' | 'partial';
  errorMessage?: string;
  /** Total latency from input to visible result */
  totalLatencyMs: number;
  timestamp: number;
}

// ─── Semantic Object Library Definition ──────────────────────────────

export interface SemanticObjectDefinition {
  semanticType: SemanticType;
  /** Display name in the library panel */
  displayName: string;
  /** Short description */
  description: string;
  /** Category for library panel grouping */
  category: 'architecture' | 'primitive' | 'custom';
  /** Default visual style */
  defaultStyle: ObjectStyle;
  /** Default size */
  defaultSize: Size;
  /** Available connection points */
  defaultConnectionPoints: ConnectionPoint[];
  /** Default animation when added to timeline */
  defaultAnimation: AnimationConfig;
  /** Icon identifier for the library panel */
  icon: string;
  /** Ontology: what this object typically connects TO */
  typicalTargets: SemanticType[];
  /** Ontology: what this object typically connects FROM */
  typicalSources: SemanticType[];
  /** Ontology: common groupings */
  typicalGroupings: SemanticType[][];
  /** Keywords for intent router matching */
  aliases: string[];
}
