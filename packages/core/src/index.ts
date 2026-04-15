// @directoor/core — Public API
// Zero DOM dependencies. Runs everywhere.

// Types
export type {
  Point,
  Size,
  Bounds,
  Color,
  SemanticType,
  IconShape,
  ConnectionType,
  LineStyle,
  ArrowPath,
  ArrowHead,
  ObjectStyle,
  ConnectionStyle,
  ConnectionPointPosition,
  ConnectionPoint,
  CanvasObjectBase,
  CanvasConnection,
  CanvasGroup,
  CanvasElement,
  AnimationEffect,
  EasingFunction,
  AnimationConfig,
  TimelineStep,
  CanvasState,
  CanvasAction,
  ActionHistoryEntry,
  CommandLog,
  SemanticObjectDefinition,
} from './types';

// Canvas State Engine
export {
  createCanvasStore,
  type CanvasStore,
  type CanvasStoreState,
  type CanvasStoreActions,
  type ContextSnapshot,
} from './canvas-store';

// Semantic Object Library
export {
  OBJECT_LIBRARY,
  findObjectByAlias,
  getObjectsByCategory,
  getIconShape,
} from './object-library';
