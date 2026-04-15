/**
 * Semantic Object Library v1
 *
 * Each object definition encodes:
 * - Visual defaults (how it looks)
 * - Semantic meaning (what it represents)
 * - Ontology (what it connects to, groups with)
 * - Aliases (what users call it in natural language)
 *
 * This is the opinionated DSL that becomes our moat.
 * A clone can copy our shapes but not our opinions.
 */

import type {
  SemanticObjectDefinition,
  ConnectionPoint,
  ObjectStyle,
  AnimationConfig,
} from './types';

// ─── Shared Defaults ─────────────────────────────────────────────────

const DEFAULT_CONNECTION_POINTS: ConnectionPoint[] = [
  { id: 'top', position: 'top' },
  { id: 'right', position: 'right' },
  { id: 'bottom', position: 'bottom' },
  { id: 'left', position: 'left' },
];

const DEFAULT_ANIMATION: AnimationConfig = {
  effect: 'fade-in',
  duration: 400,
  delay: 0,
  easing: 'ease-out',
};

const ARCH_STYLE_BASE: ObjectStyle = {
  fill: '#FFFFFF',
  stroke: '#334155',
  strokeWidth: 2,
  strokeStyle: 'solid',
  opacity: 1,
  fontSize: 14,
  fontFamily: 'Inter, system-ui, sans-serif',
  fontWeight: 'normal',
  textAlign: 'center',
  borderRadius: 8,
};

// ─── Architecture Diagram Objects ────────────────────────────────────

const DATABASE: SemanticObjectDefinition = {
  semanticType: 'database',
  displayName: 'Database',
  description: 'Relational or NoSQL database',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#EFF6FF', stroke: '#3B82F6' },
  defaultSize: { width: 140, height: 80 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'database',
  typicalTargets: ['service', 'data-lake', 'cache'],
  typicalSources: ['service', 'api-gateway', 'function'],
  typicalGroupings: [['database', 'cache'], ['database', 'storage']],
  aliases: ['db', 'database', 'postgres', 'postgresql', 'mysql', 'mongo', 'mongodb', 'dynamodb', 'redis-db', 'rds', 'aurora', 'cockroachdb', 'supabase-db'],
};

const SERVICE: SemanticObjectDefinition = {
  semanticType: 'service',
  displayName: 'Service',
  description: 'Application service or backend',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#F0FDF4', stroke: '#22C55E' },
  defaultSize: { width: 140, height: 80 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'server',
  typicalTargets: ['database', 'queue', 'cache', 'storage', 'external-system'],
  typicalSources: ['api-gateway', 'load-balancer', 'client', 'queue'],
  typicalGroupings: [['service', 'database'], ['service', 'cache', 'database']],
  aliases: ['service', 'server', 'backend', 'app', 'application', 'api', 'web server', 'node', 'express', 'fastapi', 'django', 'rails', 'spring'],
};

const QUEUE: SemanticObjectDefinition = {
  semanticType: 'queue',
  displayName: 'Message Queue',
  description: 'Message queue or event stream',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#FFF7ED', stroke: '#F97316' },
  defaultSize: { width: 140, height: 70 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'list-ordered',
  typicalTargets: ['service', 'function'],
  typicalSources: ['service', 'api-gateway'],
  typicalGroupings: [['queue', 'service']],
  aliases: ['queue', 'message queue', 'mq', 'kafka', 'rabbitmq', 'sqs', 'pubsub', 'pub/sub', 'event bus', 'event stream', 'kinesis', 'nats'],
};

const CACHE: SemanticObjectDefinition = {
  semanticType: 'cache',
  displayName: 'Cache',
  description: 'In-memory cache or CDN cache',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#FEF3C7', stroke: '#F59E0B' },
  defaultSize: { width: 120, height: 70 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'zap',
  typicalTargets: ['database'],
  typicalSources: ['service', 'api-gateway'],
  typicalGroupings: [['cache', 'database'], ['cache', 'service']],
  aliases: ['cache', 'redis', 'memcached', 'elasticache', 'cdn cache', 'in-memory', 'valkey'],
};

const API_GATEWAY: SemanticObjectDefinition = {
  semanticType: 'api-gateway',
  displayName: 'API Gateway',
  description: 'API gateway or reverse proxy',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#F5F3FF', stroke: '#8B5CF6' },
  defaultSize: { width: 150, height: 70 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'network',
  typicalTargets: ['service', 'function', 'load-balancer'],
  typicalSources: ['client', 'external-system'],
  typicalGroupings: [['api-gateway', 'load-balancer']],
  aliases: ['api gateway', 'gateway', 'kong', 'nginx', 'envoy', 'traefik', 'apigee', 'aws api gateway', 'reverse proxy'],
};

const LOAD_BALANCER: SemanticObjectDefinition = {
  semanticType: 'load-balancer',
  displayName: 'Load Balancer',
  description: 'Load balancer or traffic distributor',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#ECFDF5', stroke: '#10B981' },
  defaultSize: { width: 150, height: 60 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'split',
  typicalTargets: ['service', 'container'],
  typicalSources: ['client', 'api-gateway'],
  typicalGroupings: [['load-balancer', 'service']],
  aliases: ['load balancer', 'lb', 'alb', 'elb', 'nlb', 'haproxy', 'balancer'],
};

const CLIENT: SemanticObjectDefinition = {
  semanticType: 'client',
  displayName: 'Client',
  description: 'Frontend client application',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#FFF1F2', stroke: '#FB7185' },
  defaultSize: { width: 130, height: 80 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'monitor',
  typicalTargets: ['api-gateway', 'load-balancer', 'service', 'storage'],
  typicalSources: [],
  typicalGroupings: [],
  aliases: ['client', 'frontend', 'browser', 'mobile app', 'web app', 'react app', 'ios', 'android', 'spa', 'pwa', 'user', 'end user'],
};

const DATA_LAKE: SemanticObjectDefinition = {
  semanticType: 'data-lake',
  displayName: 'Data Lake',
  description: 'Data lake or data warehouse',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#F0F9FF', stroke: '#0EA5E9' },
  defaultSize: { width: 160, height: 80 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'waves',
  typicalTargets: ['service', 'function'],
  typicalSources: ['database', 'service', 'queue'],
  typicalGroupings: [['data-lake', 'database']],
  aliases: ['data lake', 'datalake', 'warehouse', 'data warehouse', 'snowflake', 'bigquery', 'redshift', 'databricks', 'lakehouse', 's3 lake'],
};

const STORAGE: SemanticObjectDefinition = {
  semanticType: 'storage',
  displayName: 'Storage',
  description: 'Object or file storage',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#FEF9C3', stroke: '#CA8A04' },
  defaultSize: { width: 130, height: 70 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'hard-drive',
  typicalTargets: ['service', 'function', 'client'],
  typicalSources: ['service', 'function'],
  typicalGroupings: [['storage', 'database']],
  aliases: ['storage', 's3', 'blob', 'blob storage', 'r2', 'gcs', 'google cloud storage', 'azure blob', 'object storage', 'file storage', 'bucket'],
};

const FUNCTION: SemanticObjectDefinition = {
  semanticType: 'function',
  displayName: 'Function',
  description: 'Serverless function or lambda',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#FAF5FF', stroke: '#A855F7' },
  defaultSize: { width: 130, height: 65 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'code',
  typicalTargets: ['database', 'queue', 'storage', 'external-system'],
  typicalSources: ['api-gateway', 'queue', 'service'],
  typicalGroupings: [['function', 'api-gateway']],
  aliases: ['function', 'lambda', 'serverless', 'cloud function', 'edge function', 'vercel function', 'netlify function', 'aws lambda', 'azure function'],
};

const CONTAINER: SemanticObjectDefinition = {
  semanticType: 'container',
  displayName: 'Container',
  description: 'Docker container or pod',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#F1F5F9', stroke: '#64748B' },
  defaultSize: { width: 140, height: 75 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'box',
  typicalTargets: ['database', 'queue', 'cache', 'storage'],
  typicalSources: ['load-balancer', 'service'],
  typicalGroupings: [['container', 'container']],
  aliases: ['container', 'docker', 'pod', 'k8s pod', 'kubernetes pod', 'ecs task', 'fargate', 'docker container'],
};

const USER_ACTOR: SemanticObjectDefinition = {
  semanticType: 'user-actor',
  displayName: 'User / Actor',
  description: 'Human user or external actor',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#FFF1F2', stroke: '#E11D48', borderRadius: 40 },
  defaultSize: { width: 100, height: 100 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'user',
  typicalTargets: ['client', 'api-gateway', 'load-balancer'],
  typicalSources: [],
  typicalGroupings: [],
  aliases: ['user', 'actor', 'person', 'human', 'end user', 'customer', 'admin'],
};

const EXTERNAL_SYSTEM: SemanticObjectDefinition = {
  semanticType: 'external-system',
  displayName: 'External System',
  description: 'Third-party service or external integration',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#F8FAFC', stroke: '#94A3B8', strokeStyle: 'dashed' },
  defaultSize: { width: 150, height: 75 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'external-link',
  typicalTargets: [],
  typicalSources: ['service', 'function', 'api-gateway'],
  typicalGroupings: [],
  aliases: ['external', 'third party', '3rd party', 'integration', 'webhook', 'stripe', 'twilio', 'sendgrid', 'auth0', 'okta', 'salesforce'],
};

const MICROSERVICE: SemanticObjectDefinition = {
  semanticType: 'microservice',
  displayName: 'Microservice',
  description: 'Individual microservice',
  category: 'architecture',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#F0FDF4', stroke: '#16A34A', borderRadius: 12 },
  defaultSize: { width: 130, height: 70 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'puzzle',
  typicalTargets: ['database', 'queue', 'cache', 'microservice'],
  typicalSources: ['api-gateway', 'load-balancer', 'microservice', 'queue'],
  typicalGroupings: [['microservice', 'database'], ['microservice', 'queue', 'microservice']],
  aliases: ['microservice', 'micro service', 'ms', 'bounded context'],
};

const GENERIC_BOX: SemanticObjectDefinition = {
  semanticType: 'generic-box',
  displayName: 'Box',
  description: 'Generic labeled box',
  category: 'architecture',
  defaultStyle: ARCH_STYLE_BASE,
  defaultSize: { width: 140, height: 80 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'square',
  typicalTargets: [],
  typicalSources: [],
  typicalGroupings: [],
  aliases: ['box', 'block', 'node', 'component', 'module', 'element'],
};

// ─── Primitive Objects ───────────────────────────────────────────────

const RECTANGLE: SemanticObjectDefinition = {
  semanticType: 'rectangle',
  displayName: 'Rectangle',
  description: 'Basic rectangle shape',
  category: 'primitive',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#F8FAFC', stroke: '#CBD5E1' },
  defaultSize: { width: 160, height: 100 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'square',
  typicalTargets: [],
  typicalSources: [],
  typicalGroupings: [],
  aliases: ['rectangle', 'rect', 'shape'],
};

const CIRCLE: SemanticObjectDefinition = {
  semanticType: 'circle',
  displayName: 'Circle',
  description: 'Circle shape',
  category: 'primitive',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#F8FAFC', stroke: '#CBD5E1', borderRadius: 999 },
  defaultSize: { width: 100, height: 100 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'circle',
  typicalTargets: [],
  typicalSources: [],
  typicalGroupings: [],
  aliases: ['circle', 'oval', 'ellipse'],
};

const DIAMOND: SemanticObjectDefinition = {
  semanticType: 'diamond',
  displayName: 'Diamond',
  description: 'Diamond / decision shape',
  category: 'primitive',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#FEF3C7', stroke: '#D97706' },
  defaultSize: { width: 100, height: 100 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'diamond',
  typicalTargets: [],
  typicalSources: [],
  typicalGroupings: [],
  aliases: ['diamond', 'decision', 'condition', 'if', 'branch', 'rhombus'],
};

const TEXT: SemanticObjectDefinition = {
  semanticType: 'text',
  displayName: 'Text',
  description: 'Free text label',
  category: 'primitive',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: 'transparent', stroke: 'transparent', strokeWidth: 0, fontSize: 16 },
  defaultSize: { width: 200, height: 40 },
  defaultConnectionPoints: [],
  defaultAnimation: { ...DEFAULT_ANIMATION, effect: 'typewriter' },
  icon: 'type',
  typicalTargets: [],
  typicalSources: [],
  typicalGroupings: [],
  aliases: ['text', 'label', 'heading', 'title', 'annotation', 'note', 'caption'],
};

const STICKY_NOTE: SemanticObjectDefinition = {
  semanticType: 'sticky-note',
  displayName: 'Sticky Note',
  description: 'Sticky note for annotations',
  category: 'primitive',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: '#FEF9C3', stroke: '#FACC15', fontSize: 13, textAlign: 'left' },
  defaultSize: { width: 160, height: 120 },
  defaultConnectionPoints: [],
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'sticky-note',
  typicalTargets: [],
  typicalSources: [],
  typicalGroupings: [],
  aliases: ['sticky', 'sticky note', 'post-it', 'postit', 'memo'],
};

const IMAGE: SemanticObjectDefinition = {
  semanticType: 'image',
  displayName: 'Image',
  description: 'Uploaded or generated image',
  category: 'primitive',
  defaultStyle: { ...ARCH_STYLE_BASE, fill: 'transparent', stroke: '#E2E8F0', strokeWidth: 1, borderRadius: 4 },
  defaultSize: { width: 200, height: 150 },
  defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
  defaultAnimation: DEFAULT_ANIMATION,
  icon: 'image',
  typicalTargets: [],
  typicalSources: [],
  typicalGroupings: [],
  aliases: ['image', 'img', 'picture', 'photo', 'screenshot', 'illustration'],
};

// ─── The Full Library ────────────────────────────────────────────────

export const OBJECT_LIBRARY: Record<string, SemanticObjectDefinition> = {
  'database': DATABASE,
  'service': SERVICE,
  'queue': QUEUE,
  'cache': CACHE,
  'api-gateway': API_GATEWAY,
  'load-balancer': LOAD_BALANCER,
  'client': CLIENT,
  'data-lake': DATA_LAKE,
  'storage': STORAGE,
  'function': FUNCTION,
  'container': CONTAINER,
  'user-actor': USER_ACTOR,
  'external-system': EXTERNAL_SYSTEM,
  'microservice': MICROSERVICE,
  'generic-box': GENERIC_BOX,
  'rectangle': RECTANGLE,
  'circle': CIRCLE,
  'diamond': DIAMOND,
  'text': TEXT,
  'sticky-note': STICKY_NOTE,
  'image': IMAGE,
};

/**
 * Find a semantic object definition by alias.
 * Used by the Intent Router to resolve natural language to semantic types.
 */
export function findObjectByAlias(alias: string): SemanticObjectDefinition | undefined {
  const normalized = alias.toLowerCase().trim();
  for (const def of Object.values(OBJECT_LIBRARY)) {
    if (def.aliases.some(a => a.toLowerCase() === normalized)) {
      return def;
    }
  }
  return undefined;
}

/**
 * Get all objects in a specific category.
 */
export function getObjectsByCategory(category: SemanticObjectDefinition['category']): SemanticObjectDefinition[] {
  return Object.values(OBJECT_LIBRARY).filter(def => def.category === category);
}
