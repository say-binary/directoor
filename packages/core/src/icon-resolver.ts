/**
 * Auto-mapping from semantic type → IconShape archetype.
 *
 * Strategy:
 * 1. If the semantic type is in OBJECT_LIBRARY, use its iconShape.
 * 2. Otherwise, run a keyword heuristic on the semanticType string
 *    to pick the best visual archetype.
 * 3. Cache the decision in-memory so repeat lookups are free.
 * 4. (Future) persist learned mappings to Supabase so the library
 *    grows across sessions / users.
 *
 * The heuristic is designed so that novel concepts the LLM invents
 * (e.g., "feature-flag-service", "ml-training-worker", "neural-node")
 * still render as proper Directoor custom shapes — never as a plain
 * tldraw geo rectangle.
 */

import type { IconShape } from './types';
import { OBJECT_LIBRARY } from './object-library';

// ─── In-memory cache ────────────────────────────────────────────────

const learnedMappings = new Map<string, IconShape>();

/**
 * Register a new semantic → iconShape mapping.
 * Call this when a new mapping is decided (either by heuristic or by the LLM).
 * Exposed so consumers can persist to Supabase later.
 */
export function registerMapping(semanticType: string, iconShape: IconShape): void {
  learnedMappings.set(semanticType.toLowerCase(), iconShape);
}

/** Retrieve any previously registered mapping (useful for bulk sync). */
export function getLearnedMappings(): Record<string, IconShape> {
  return Object.fromEntries(learnedMappings);
}

/** Preload a batch of learned mappings, e.g., from Supabase on app start. */
export function seedLearnedMappings(mappings: Record<string, IconShape>): void {
  for (const [k, v] of Object.entries(mappings)) {
    learnedMappings.set(k.toLowerCase(), v);
  }
}

// ─── Heuristic rules ────────────────────────────────────────────────
// Ordered list: first match wins. Each rule tests whether the
// normalized semanticType (lowercased, hyphens → spaces) contains
// any of the listed keywords. Keywords are chosen to be distinctive.

interface HeuristicRule {
  icon: IconShape;
  keywords: string[];
}

const RULES: HeuristicRule[] = [
  // Edges first
  { icon: 'arrow', keywords: ['arrow', 'edge', 'connection', 'link', 'flow'] },

  // Stack — clusters, replication
  { icon: 'stack', keywords: [
    'cluster', 'pool', 'replica', 'replicas', 'fleet', 'broker', 'ensemble',
    'swarm', 'nodes pool', 'worker pool', 'coordinator',
  ]},

  // Layer — ML layers, stack layers
  { icon: 'layer', keywords: [
    'layer', 'tier', 'stage', 'model layer', 'hidden layer', 'dense',
    'convolution', 'conv layer', 'pooling layer', 'attention layer',
  ]},

  // Cylinder — any persistent storage / DB-like
  { icon: 'cylinder', keywords: [
    'database', 'db', 'datastore', 'store', 'storage', 'warehouse',
    'lake', 'bucket', 'volume', 'disk', 'blob', 'object store',
    'topic', 'stream store', 'queue store', 'shard', 'table store',
    'vector', 'embedding', 'index store', 'olap', 'oltp', 'dynamodb',
    'mongo', 'postgres', 'mysql', 'redis', 'memcached', 'elasticache',
    'snowflake', 'bigquery', 'clickhouse', 'redshift', 'pinecone',
    'kafka topic', 'kinesis', 'secret', 'vault', 'kms',
  ]},

  // Document — files, logs, payloads
  { icon: 'document', keywords: [
    'document', 'file', 'log', 'report', 'payload', 'event payload',
    'policy', 'rule set', 'template', 'jwt', 'certificate', 'spec',
    'schema', 'contract', 'configuration file',
  ]},

  // Cloud — external / managed services
  { icon: 'cloud', keywords: [
    'external', 'third party', '3rd party', 'saas', 'managed',
    'cdn', 'dns', 'oauth', 'identity provider', 'idp', 'stripe',
    'twilio', 'sendgrid', 'auth0', 'okta', 'clerk', 'observability platform',
    'datadog', 'sentry', 'new relic', 'honeycomb', 'cloudflare',
    'cloudfront', 'fastly', 'akamai',
  ]},

  // Actor — humans, roles, producers/consumers (personified)
  { icon: 'actor', keywords: [
    'user', 'actor', 'person', 'customer', 'admin', 'human',
    'end user', 'developer', 'operator', 'analyst', 'reviewer',
    'agent', 'role',
    // Kafka-style producer/consumer are services, not humans — don't match here
  ]},

  // Hexagon — microservices, service mesh, bounded contexts
  { icon: 'hexagon', keywords: [
    'microservice', 'micro service', 'bounded context', 'domain service',
    'service mesh', 'istio', 'linkerd', 'envoy mesh',
  ]},

  // Circle — neural nodes, events, states
  { icon: 'circle', keywords: [
    'neuron', 'neural node', 'node', 'neural network node', 'perceptron',
    'event', 'state', 'checkpoint', 'milestone', 'vertex',
    'port', 'endpoint node',
  ]},

  // Diamond — decisions, conditions
  { icon: 'diamond', keywords: [
    'decision', 'condition', 'if', 'branch', 'router', 'choice',
    'gate', 'switch',
  ]},

  // Pill — endpoints, routes, versions
  { icon: 'pill', keywords: [
    'endpoint', 'route', 'api route', 'http endpoint', 'url',
    'version', 'tag', 'label', 'port', 'interface', 'api version',
  ]},

  // Rectangle — generic services, compute, workers (the default)
  { icon: 'rectangle', keywords: [
    'service', 'server', 'api', 'backend', 'app', 'application',
    'lambda', 'function', 'worker', 'container', 'pod', 'task',
    'job', 'cron', 'scheduler', 'orchestrator', 'pipeline', 'processor',
    'gateway', 'load balancer', 'ingress', 'proxy', 'firewall', 'waf',
    'web app', 'mobile app', 'browser', 'pwa', 'instance',
    'producer', 'consumer', 'publisher', 'subscriber',
    'handler', 'webhook', 'callback',
  ]},
];

// ─── Public resolver ────────────────────────────────────────────────

/**
 * Resolve a semantic type to an IconShape archetype.
 *
 * Priority:
 *   1. Exact match in OBJECT_LIBRARY (our curated mappings)
 *   2. Previously learned mapping (in-memory cache)
 *   3. Heuristic match on keywords
 *   4. Fallback to 'rectangle' (still our custom rectangle, not tldraw geo)
 *
 * The first time a novel type is resolved, the decision is memorized
 * so subsequent calls are fast and stable.
 */
export function resolveIconShape(semanticType: string): IconShape {
  if (!semanticType) return 'rectangle';
  const key = semanticType.toLowerCase().trim();

  // 1. Curated library
  const curated = OBJECT_LIBRARY[semanticType];
  if (curated) return curated.iconShape;

  // 2. Cached learned mapping
  const learned = learnedMappings.get(key);
  if (learned) return learned;

  // 3. Heuristic
  const normalized = key.replace(/[-_]/g, ' ');
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (normalized.includes(kw)) {
        learnedMappings.set(key, rule.icon);
        return rule.icon;
      }
    }
  }

  // 4. Fallback to rectangle (our custom, not tldraw geo)
  learnedMappings.set(key, 'rectangle');
  return 'rectangle';
}

/**
 * Suggest default color for a semantic type that isn't in the library.
 * Based on the resolved archetype, returns a sensible stroke + fill.
 */
export function defaultStyleForSemanticType(semanticType: string): { stroke: string; fill: string } {
  const curated = OBJECT_LIBRARY[semanticType];
  if (curated) {
    return {
      stroke: curated.defaultStyle.stroke,
      fill: curated.defaultStyle.fill === 'transparent' ? '#FFFFFF' : curated.defaultStyle.fill,
    };
  }
  const icon = resolveIconShape(semanticType);
  const palette: Record<IconShape, { stroke: string; fill: string }> = {
    rectangle: { stroke: '#334155', fill: '#F8FAFC' },
    cylinder:  { stroke: '#3B82F6', fill: '#EFF6FF' },
    hexagon:   { stroke: '#16A34A', fill: '#F0FDF4' },
    actor:     { stroke: '#E11D48', fill: '#FFF1F2' },
    cloud:     { stroke: '#94A3B8', fill: '#F8FAFC' },
    document:  { stroke: '#475569', fill: '#F1F5F9' },
    stack:     { stroke: '#D97706', fill: '#FEF3C7' },
    queue:     { stroke: '#0EA5E9', fill: '#F0F9FF' },
    circle:    { stroke: '#0EA5E9', fill: '#F0F9FF' },
    diamond:   { stroke: '#D97706', fill: '#FEF3C7' },
    pill:      { stroke: '#7C3AED', fill: '#F5F3FF' },
    layer:     { stroke: '#1D4ED8', fill: '#EFF6FF' },
    arrow:     { stroke: '#334155', fill: '#FFFFFF' },
    line:      { stroke: '#334155', fill: '#FFFFFF' },
    squiggle:  { stroke: '#334155', fill: '#FFFFFF' },
    text:      { stroke: '#0F172A', fill: 'transparent' },
    image:     { stroke: '#94A3B8', fill: '#F1F5F9' },
  };
  return palette[icon];
}
