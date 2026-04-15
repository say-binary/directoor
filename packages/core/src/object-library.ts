/**
 * Semantic Object Library v2 — 60+ objects with rich ontology.
 *
 * Each object encodes:
 * - Visual defaults (color, size)
 * - iconShape (cylinder, hexagon, actor, cloud, document, stack, rectangle…)
 * - Ontology (typical sources, targets, groupings)
 * - Aliases (10–30 natural language synonyms each)
 *
 * The opinionated DSL that becomes our moat.
 */

import type {
  SemanticObjectDefinition,
  ConnectionPoint,
  ObjectStyle,
  AnimationConfig,
  IconShape,
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

const STYLE_BASE: ObjectStyle = {
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

// Helper to reduce boilerplate
function obj(
  partial: Omit<SemanticObjectDefinition, 'defaultConnectionPoints' | 'defaultAnimation' | 'typicalGroupings' | 'description' | 'icon'> &
    Partial<Pick<SemanticObjectDefinition, 'defaultConnectionPoints' | 'defaultAnimation' | 'typicalGroupings' | 'description' | 'icon'>>,
): SemanticObjectDefinition {
  return {
    description: '',
    icon: partial.iconShape,
    defaultConnectionPoints: DEFAULT_CONNECTION_POINTS,
    defaultAnimation: DEFAULT_ANIMATION,
    typicalGroupings: [],
    ...partial,
  };
}

const styled = (fill: string, stroke: string, extras: Partial<ObjectStyle> = {}): ObjectStyle => ({
  ...STYLE_BASE, fill, stroke, ...extras,
});

// ─── Architecture core ───────────────────────────────────────────────

const DATABASE = obj({
  semanticType: 'database', displayName: 'Database', category: 'architecture',
  iconShape: 'cylinder',
  defaultStyle: styled('#EFF6FF', '#3B82F6'),
  defaultSize: { width: 140, height: 80 },
  typicalTargets: ['service', 'data-lake', 'cache'],
  typicalSources: ['service', 'api-gateway', 'function', 'microservice', 'lambda'],
  typicalGroupings: [['database', 'cache'], ['database', 'storage']],
  aliases: ['db', 'database', 'postgres', 'postgresql', 'mysql', 'mongo', 'mongodb', 'dynamodb', 'rds', 'aurora', 'cockroachdb', 'supabase-db', 'sql', 'sqlite', 'mariadb', 'oracle'],
});

const SERVICE = obj({
  semanticType: 'service', displayName: 'Service', category: 'architecture',
  iconShape: 'rectangle',
  defaultStyle: styled('#F0FDF4', '#22C55E'),
  defaultSize: { width: 140, height: 80 },
  typicalTargets: ['database', 'queue', 'cache', 'storage', 'external-system'],
  typicalSources: ['api-gateway', 'load-balancer', 'client', 'queue'],
  typicalGroupings: [['service', 'database'], ['service', 'cache', 'database']],
  aliases: ['service', 'server', 'backend', 'app', 'application', 'api', 'web server', 'node', 'express', 'fastapi', 'django', 'rails', 'spring', 'go service', 'rest api'],
});

const MICROSERVICE = obj({
  semanticType: 'microservice', displayName: 'Microservice', category: 'architecture',
  iconShape: 'hexagon',
  defaultStyle: styled('#F0FDF4', '#16A34A'),
  defaultSize: { width: 130, height: 110 },
  typicalTargets: ['database', 'queue', 'cache', 'microservice'],
  typicalSources: ['api-gateway', 'load-balancer', 'microservice', 'queue'],
  typicalGroupings: [['microservice', 'database']],
  aliases: ['microservice', 'micro service', 'ms', 'bounded context', 'domain service'],
});

const QUEUE = obj({
  semanticType: 'queue', displayName: 'Message Queue', category: 'architecture',
  iconShape: 'rectangle',
  defaultStyle: styled('#FFF7ED', '#F97316'),
  defaultSize: { width: 140, height: 60 },
  typicalTargets: ['service', 'function', 'lambda', 'worker'],
  typicalSources: ['service', 'api-gateway', 'lambda'],
  typicalGroupings: [['queue', 'service']],
  aliases: ['queue', 'message queue', 'mq', 'sqs', 'pubsub', 'pub/sub', 'task queue', 'job queue', 'work queue'],
});

const CACHE = obj({
  semanticType: 'cache', displayName: 'Cache', category: 'architecture',
  iconShape: 'cylinder',
  defaultStyle: styled('#FEF3C7', '#F59E0B'),
  defaultSize: { width: 120, height: 70 },
  typicalTargets: ['database'],
  typicalSources: ['service', 'api-gateway', 'microservice'],
  typicalGroupings: [['cache', 'database'], ['cache', 'service']],
  aliases: ['cache', 'redis', 'memcached', 'elasticache', 'cdn cache', 'in-memory', 'valkey', 'kv store'],
});

const API_GATEWAY = obj({
  semanticType: 'api-gateway', displayName: 'API Gateway', category: 'architecture',
  iconShape: 'rectangle',
  defaultStyle: styled('#F5F3FF', '#8B5CF6'),
  defaultSize: { width: 150, height: 70 },
  typicalTargets: ['service', 'function', 'lambda', 'microservice', 'load-balancer'],
  typicalSources: ['client', 'web-app', 'mobile-app', 'browser', 'external-system'],
  aliases: ['api gateway', 'gateway', 'kong', 'nginx', 'envoy', 'traefik', 'apigee', 'aws api gateway', 'reverse proxy', 'edge'],
});

const LOAD_BALANCER = obj({
  semanticType: 'load-balancer', displayName: 'Load Balancer', category: 'architecture',
  iconShape: 'rectangle',
  defaultStyle: styled('#ECFDF5', '#10B981'),
  defaultSize: { width: 150, height: 60 },
  typicalTargets: ['service', 'container', 'kubernetes-pod', 'ec2-instance'],
  typicalSources: ['client', 'api-gateway', 'cdn'],
  aliases: ['load balancer', 'lb', 'alb', 'elb', 'nlb', 'haproxy', 'balancer'],
});

const CLIENT = obj({
  semanticType: 'client', displayName: 'Client', category: 'architecture',
  iconShape: 'rectangle',
  defaultStyle: styled('#FFF1F2', '#FB7185'),
  defaultSize: { width: 130, height: 80 },
  typicalTargets: ['api-gateway', 'load-balancer', 'service', 'storage', 'cdn'],
  typicalSources: [],
  aliases: ['client', 'frontend', 'browser', 'mobile app', 'web app', 'react app', 'spa'],
});

const DATA_LAKE = obj({
  semanticType: 'data-lake', displayName: 'Data Lake', category: 'data',
  iconShape: 'cylinder',
  defaultStyle: styled('#F0F9FF', '#0EA5E9'),
  defaultSize: { width: 160, height: 80 },
  typicalTargets: ['service', 'function', 'stream-processor', 'snowflake', 'bigquery'],
  typicalSources: ['database', 'service', 'queue', 'kafka-topic', 'etl-pipeline'],
  aliases: ['data lake', 'datalake', 'lakehouse', 's3 lake', 'delta lake', 'iceberg'],
});

const STORAGE = obj({
  semanticType: 'storage', displayName: 'Storage', category: 'architecture',
  iconShape: 'cylinder',
  defaultStyle: styled('#FEF9C3', '#CA8A04'),
  defaultSize: { width: 130, height: 70 },
  typicalTargets: ['service', 'function', 'lambda', 'client', 'cdn'],
  typicalSources: ['service', 'function', 'lambda'],
  aliases: ['storage', 's3', 'blob', 'blob storage', 'r2', 'gcs', 'google cloud storage', 'azure blob', 'object storage', 'file storage', 'bucket'],
});

const FUNCTION_OBJ = obj({
  semanticType: 'function', displayName: 'Function', category: 'compute',
  iconShape: 'rectangle',
  defaultStyle: styled('#FAF5FF', '#A855F7'),
  defaultSize: { width: 130, height: 65 },
  typicalTargets: ['database', 'queue', 'storage', 'external-system'],
  typicalSources: ['api-gateway', 'queue', 'service', 'event-bus'],
  aliases: ['function', 'cloud function', 'edge function', 'vercel function', 'netlify function', 'serverless function'],
});

const CONTAINER = obj({
  semanticType: 'container', displayName: 'Container', category: 'compute',
  iconShape: 'rectangle',
  defaultStyle: styled('#F1F5F9', '#64748B'),
  defaultSize: { width: 140, height: 75 },
  typicalTargets: ['database', 'queue', 'cache', 'storage'],
  typicalSources: ['load-balancer', 'service', 'k8s-service', 'k8s-ingress'],
  aliases: ['container', 'docker', 'docker container'],
});

const USER_ACTOR = obj({
  semanticType: 'user-actor', displayName: 'User', category: 'architecture',
  iconShape: 'actor',
  defaultStyle: styled('#FFF1F2', '#E11D48', { borderRadius: 40 }),
  defaultSize: { width: 100, height: 100 },
  typicalTargets: ['client', 'api-gateway', 'load-balancer', 'web-app', 'mobile-app', 'browser'],
  typicalSources: [],
  aliases: ['user', 'actor', 'person', 'human', 'end user', 'customer', 'admin', 'visitor'],
});

const EXTERNAL_SYSTEM = obj({
  semanticType: 'external-system', displayName: 'External System', category: 'architecture',
  iconShape: 'cloud',
  defaultStyle: styled('#F8FAFC', '#94A3B8', { strokeStyle: 'dashed' }),
  defaultSize: { width: 150, height: 75 },
  typicalTargets: [],
  typicalSources: ['service', 'function', 'api-gateway', 'webhook'],
  aliases: ['external', 'third party', '3rd party', 'integration', 'external service'],
});

const GENERIC_BOX = obj({
  semanticType: 'generic-box', displayName: 'Box', category: 'architecture',
  iconShape: 'rectangle',
  defaultStyle: STYLE_BASE,
  defaultSize: { width: 140, height: 80 },
  typicalTargets: [], typicalSources: [],
  aliases: ['box', 'block', 'node', 'component', 'module', 'element'],
});

// ─── Streaming & Messaging ───────────────────────────────────────────

const KAFKA_BROKER = obj({
  semanticType: 'kafka-broker', displayName: 'Kafka Broker', category: 'streaming',
  iconShape: 'stack',
  defaultStyle: styled('#FEF3C7', '#D97706'),
  defaultSize: { width: 130, height: 100 },
  typicalTargets: ['kafka-topic', 'kafka-broker', 'zookeeper'],
  typicalSources: ['kafka-producer', 'kafka-broker'],
  typicalGroupings: [['kafka-broker', 'kafka-broker', 'kafka-broker', 'zookeeper']],
  aliases: ['kafka broker', 'broker', 'kafka node', 'kafka server', 'msk broker'],
});

const KAFKA_TOPIC = obj({
  semanticType: 'kafka-topic', displayName: 'Kafka Topic', category: 'streaming',
  iconShape: 'cylinder',
  defaultStyle: styled('#FEF9C3', '#EAB308'),
  defaultSize: { width: 140, height: 75 },
  typicalTargets: ['kafka-consumer', 'consumer-group', 'stream-processor'],
  typicalSources: ['kafka-producer', 'kafka-broker'],
  aliases: ['topic', 'kafka topic', 'event topic', 'message topic', 'pubsub topic', 'stream'],
});

const KAFKA_PRODUCER = obj({
  semanticType: 'kafka-producer', displayName: 'Producer', category: 'streaming',
  iconShape: 'rectangle',
  defaultStyle: styled('#DBEAFE', '#2563EB'),
  defaultSize: { width: 150, height: 75 },
  typicalTargets: ['kafka-topic', 'kafka-broker'],
  typicalSources: [],
  aliases: ['producer', 'kafka producer', 'event producer', 'publisher', 'message producer'],
});

const KAFKA_CONSUMER = obj({
  semanticType: 'kafka-consumer', displayName: 'Consumer', category: 'streaming',
  iconShape: 'rectangle',
  defaultStyle: styled('#DCFCE7', '#16A34A'),
  defaultSize: { width: 150, height: 75 },
  typicalTargets: ['database', 'cache', 'service', 'storage'],
  typicalSources: ['kafka-topic', 'consumer-group'],
  aliases: ['consumer', 'kafka consumer', 'event consumer', 'subscriber', 'message consumer'],
});

const CONSUMER_GROUP = obj({
  semanticType: 'consumer-group', displayName: 'Consumer Group', category: 'streaming',
  iconShape: 'rectangle',
  defaultStyle: styled('#ECFDF5', '#059669', { strokeStyle: 'dashed' }),
  defaultSize: { width: 220, height: 170 },
  typicalTargets: ['kafka-consumer'],
  typicalSources: ['kafka-topic'],
  aliases: ['consumer group', 'kafka consumer group', 'cg'],
});

const PARTITION = obj({
  semanticType: 'partition', displayName: 'Partition', category: 'streaming',
  iconShape: 'rectangle',
  defaultStyle: styled('#FEF3C7', '#CA8A04'),
  defaultSize: { width: 100, height: 50 },
  typicalTargets: [], typicalSources: [],
  aliases: ['partition', 'kafka partition', 'topic partition', 'shard'],
});

const ZOOKEEPER = obj({
  semanticType: 'zookeeper', displayName: 'ZooKeeper', category: 'streaming',
  iconShape: 'stack',
  defaultStyle: styled('#F3E8FF', '#9333EA'),
  defaultSize: { width: 130, height: 90 },
  typicalTargets: ['kafka-broker'],
  typicalSources: [],
  aliases: ['zookeeper', 'zk', 'kafka zookeeper', 'kraft'],
});

const RABBITMQ_EXCHANGE = obj({
  semanticType: 'rabbitmq-exchange', displayName: 'Exchange', category: 'streaming',
  iconShape: 'diamond',
  defaultStyle: styled('#FFE4E6', '#E11D48'),
  defaultSize: { width: 120, height: 80 },
  typicalTargets: ['rabbitmq-queue'],
  typicalSources: ['service', 'function'],
  aliases: ['exchange', 'rabbitmq exchange', 'amqp exchange'],
});

const RABBITMQ_QUEUE = obj({
  semanticType: 'rabbitmq-queue', displayName: 'RabbitMQ Queue', category: 'streaming',
  iconShape: 'cylinder',
  defaultStyle: styled('#FFE4E6', '#BE123C'),
  defaultSize: { width: 140, height: 75 },
  typicalTargets: ['service', 'worker'],
  typicalSources: ['rabbitmq-exchange'],
  aliases: ['rabbitmq', 'rabbit', 'rabbitmq queue', 'amqp queue'],
});

const PULSAR = obj({
  semanticType: 'pulsar', displayName: 'Pulsar', category: 'streaming',
  iconShape: 'cylinder',
  defaultStyle: styled('#F0F9FF', '#0284C7'),
  defaultSize: { width: 140, height: 75 },
  typicalTargets: ['service', 'stream-processor'],
  typicalSources: ['service', 'function'],
  aliases: ['pulsar', 'apache pulsar'],
});

const NATS = obj({
  semanticType: 'nats', displayName: 'NATS', category: 'streaming',
  iconShape: 'rectangle',
  defaultStyle: styled('#ECFEFF', '#0891B2'),
  defaultSize: { width: 130, height: 65 },
  typicalTargets: ['service', 'function'],
  typicalSources: ['service', 'function'],
  aliases: ['nats', 'nats subject', 'jetstream'],
});

const EVENT_BUS = obj({
  semanticType: 'event-bus', displayName: 'Event Bus', category: 'streaming',
  iconShape: 'stack',
  defaultStyle: styled('#FEF3C7', '#F59E0B'),
  defaultSize: { width: 170, height: 85 },
  typicalTargets: ['function', 'lambda', 'service'],
  typicalSources: ['service', 'function', 'lambda'],
  aliases: ['event bus', 'eventbridge', 'event grid', 'event hub'],
});

const WEBHOOK = obj({
  semanticType: 'webhook', displayName: 'Webhook', category: 'streaming',
  iconShape: 'document',
  defaultStyle: styled('#FEF2F2', '#DC2626', { strokeStyle: 'dashed' }),
  defaultSize: { width: 120, height: 90 },
  typicalTargets: ['service', 'function', 'api-gateway'],
  typicalSources: ['external-system'],
  aliases: ['webhook', 'callback url', 'http callback'],
});

// ─── Compute ─────────────────────────────────────────────────────────

const KUBERNETES_POD = obj({
  semanticType: 'kubernetes-pod', displayName: 'Pod', category: 'compute',
  iconShape: 'stack',
  defaultStyle: styled('#DBEAFE', '#1D4ED8'),
  defaultSize: { width: 130, height: 95 },
  typicalTargets: ['database', 'cache', 'k8s-service'],
  typicalSources: ['k8s-service', 'k8s-deployment'],
  typicalGroupings: [['kubernetes-pod', 'kubernetes-pod', 'kubernetes-pod']],
  aliases: ['pod', 'k8s pod', 'kubernetes pod', 'replica'],
});

const K8S_DEPLOYMENT = obj({
  semanticType: 'k8s-deployment', displayName: 'Deployment', category: 'compute',
  iconShape: 'rectangle',
  defaultStyle: styled('#EFF6FF', '#3B82F6', { strokeStyle: 'dashed' }),
  defaultSize: { width: 200, height: 140 },
  typicalTargets: ['kubernetes-pod'],
  typicalSources: [],
  aliases: ['deployment', 'k8s deployment', 'kubernetes deployment', 'statefulset', 'daemonset', 'replicaset'],
});

const K8S_SERVICE = obj({
  semanticType: 'k8s-service', displayName: 'K8s Service', category: 'compute',
  iconShape: 'rectangle',
  defaultStyle: styled('#E0E7FF', '#4F46E5'),
  defaultSize: { width: 140, height: 60 },
  typicalTargets: ['kubernetes-pod', 'k8s-deployment'],
  typicalSources: ['k8s-ingress', 'load-balancer'],
  aliases: ['k8s service', 'kubernetes service', 'cluster ip', 'nodeport'],
});

const K8S_INGRESS = obj({
  semanticType: 'k8s-ingress', displayName: 'Ingress', category: 'compute',
  iconShape: 'rectangle',
  defaultStyle: styled('#FAF5FF', '#7E22CE'),
  defaultSize: { width: 150, height: 60 },
  typicalTargets: ['k8s-service'],
  typicalSources: ['cdn', 'dns', 'load-balancer'],
  aliases: ['ingress', 'k8s ingress', 'kubernetes ingress', 'ingress controller'],
});

const LAMBDA = obj({
  semanticType: 'lambda', displayName: 'Lambda', category: 'compute',
  iconShape: 'rectangle',
  defaultStyle: styled('#FED7AA', '#EA580C'),
  defaultSize: { width: 130, height: 65 },
  typicalTargets: ['database', 'queue', 'storage', 'external-system', 'kafka-topic'],
  typicalSources: ['api-gateway', 'queue', 'event-bus', 'webhook', 'storage', 'cron-job'],
  aliases: ['lambda', 'aws lambda', 'serverless', 'function', 'azure function', 'gcp function'],
});

const STEP_FUNCTION = obj({
  semanticType: 'step-function', displayName: 'Step Function', category: 'compute',
  iconShape: 'rectangle',
  defaultStyle: styled('#FFEDD5', '#C2410C'),
  defaultSize: { width: 150, height: 80 },
  typicalTargets: ['lambda', 'service'],
  typicalSources: ['api-gateway', 'event-bus'],
  aliases: ['step function', 'state machine', 'workflow', 'orchestration'],
});

const CRON_JOB = obj({
  semanticType: 'cron-job', displayName: 'Cron Job', category: 'compute',
  iconShape: 'rectangle',
  defaultStyle: styled('#F1F5F9', '#475569'),
  defaultSize: { width: 130, height: 60 },
  typicalTargets: ['lambda', 'function', 'worker', 'service'],
  typicalSources: [],
  aliases: ['cron', 'cron job', 'scheduled job', 'scheduler', 'k8s cronjob', 'eventbridge schedule'],
});

const WORKER = obj({
  semanticType: 'worker', displayName: 'Worker', category: 'compute',
  iconShape: 'rectangle',
  defaultStyle: styled('#F3F4F6', '#374151'),
  defaultSize: { width: 130, height: 70 },
  typicalTargets: ['database', 'storage', 'external-system'],
  typicalSources: ['queue', 'rabbitmq-queue', 'kafka-topic'],
  aliases: ['worker', 'background worker', 'job worker', 'task worker', 'celery worker', 'sidekiq'],
});

const ECS_TASK = obj({
  semanticType: 'ecs-task', displayName: 'ECS Task', category: 'compute',
  iconShape: 'rectangle',
  defaultStyle: styled('#FFF7ED', '#C2410C'),
  defaultSize: { width: 140, height: 70 },
  typicalTargets: ['database', 'cache', 'storage'],
  typicalSources: ['load-balancer'],
  aliases: ['ecs task', 'ecs', 'aws ecs'],
});

const FARGATE = obj({
  semanticType: 'fargate', displayName: 'Fargate', category: 'compute',
  iconShape: 'rectangle',
  defaultStyle: styled('#FFEDD5', '#EA580C'),
  defaultSize: { width: 140, height: 70 },
  typicalTargets: ['database', 'cache', 'storage'],
  typicalSources: ['load-balancer'],
  aliases: ['fargate', 'aws fargate', 'serverless container'],
});

const EC2_INSTANCE = obj({
  semanticType: 'ec2-instance', displayName: 'EC2', category: 'compute',
  iconShape: 'rectangle',
  defaultStyle: styled('#FEF3C7', '#B45309'),
  defaultSize: { width: 140, height: 75 },
  typicalTargets: ['database', 'storage', 'external-system'],
  typicalSources: ['load-balancer'],
  aliases: ['ec2', 'ec2 instance', 'vm', 'virtual machine', 'compute instance', 'gce', 'azure vm'],
});

// ─── Data & analytics ───────────────────────────────────────────────

const SNOWFLAKE = obj({
  semanticType: 'snowflake', displayName: 'Snowflake', category: 'data',
  iconShape: 'cylinder',
  defaultStyle: styled('#E0F2FE', '#0EA5E9'),
  defaultSize: { width: 150, height: 80 },
  typicalTargets: ['observability-platform'],
  typicalSources: ['etl-pipeline', 'stream-processor', 'data-lake'],
  aliases: ['snowflake', 'snowflake warehouse', 'data warehouse'],
});

const BIGQUERY = obj({
  semanticType: 'bigquery', displayName: 'BigQuery', category: 'data',
  iconShape: 'cylinder',
  defaultStyle: styled('#DBEAFE', '#1D4ED8'),
  defaultSize: { width: 150, height: 80 },
  typicalTargets: [],
  typicalSources: ['etl-pipeline', 'stream-processor'],
  aliases: ['bigquery', 'gcp bigquery', 'bq'],
});

const REDSHIFT = obj({
  semanticType: 'redshift', displayName: 'Redshift', category: 'data',
  iconShape: 'cylinder',
  defaultStyle: styled('#FFE4E6', '#BE123C'),
  defaultSize: { width: 150, height: 80 },
  typicalTargets: [],
  typicalSources: ['etl-pipeline', 'storage', 'data-lake'],
  aliases: ['redshift', 'aws redshift'],
});

const CLICKHOUSE = obj({
  semanticType: 'clickhouse', displayName: 'ClickHouse', category: 'data',
  iconShape: 'cylinder',
  defaultStyle: styled('#FEF9C3', '#CA8A04'),
  defaultSize: { width: 150, height: 80 },
  typicalTargets: [],
  typicalSources: ['kafka-topic', 'stream-processor'],
  aliases: ['clickhouse', 'olap'],
});

const ELASTICSEARCH = obj({
  semanticType: 'elasticsearch', displayName: 'Elasticsearch', category: 'data',
  iconShape: 'cylinder',
  defaultStyle: styled('#FEF3C7', '#D97706'),
  defaultSize: { width: 150, height: 80 },
  typicalTargets: ['service'],
  typicalSources: ['service', 'log-aggregator'],
  aliases: ['elasticsearch', 'elastic', 'opensearch', 'es'],
});

const VECTOR_DB = obj({
  semanticType: 'vector-db', displayName: 'Vector DB', category: 'data',
  iconShape: 'cylinder',
  defaultStyle: styled('#F3E8FF', '#9333EA'),
  defaultSize: { width: 140, height: 80 },
  typicalTargets: [],
  typicalSources: ['service', 'function', 'lambda'],
  aliases: ['vector db', 'vector database', 'pinecone', 'weaviate', 'qdrant', 'chroma', 'embedding store'],
});

const ETL_PIPELINE = obj({
  semanticType: 'etl-pipeline', displayName: 'ETL Pipeline', category: 'data',
  iconShape: 'rectangle',
  defaultStyle: styled('#ECFEFF', '#0E7490'),
  defaultSize: { width: 160, height: 70 },
  typicalTargets: ['snowflake', 'bigquery', 'redshift', 'data-lake'],
  typicalSources: ['database', 'storage', 'kafka-topic'],
  aliases: ['etl', 'etl pipeline', 'elt', 'data pipeline', 'airflow', 'dagster', 'prefect', 'fivetran'],
});

const STREAM_PROCESSOR = obj({
  semanticType: 'stream-processor', displayName: 'Stream Processor', category: 'data',
  iconShape: 'stack',
  defaultStyle: styled('#F0FDFA', '#0D9488'),
  defaultSize: { width: 160, height: 95 },
  typicalTargets: ['database', 'data-lake', 'snowflake', 'bigquery'],
  typicalSources: ['kafka-topic', 'pulsar'],
  aliases: ['stream processor', 'flink', 'spark streaming', 'kafka streams', 'kinesis analytics', 'beam'],
});

const MATERIALIZED_VIEW = obj({
  semanticType: 'materialized-view', displayName: 'Materialized View', category: 'data',
  iconShape: 'cylinder',
  defaultStyle: styled('#FAF5FF', '#7E22CE'),
  defaultSize: { width: 150, height: 70 },
  typicalTargets: ['service'],
  typicalSources: ['database', 'data-lake'],
  aliases: ['materialized view', 'mv', 'cached view', 'precomputed view'],
});

// ─── Networking ─────────────────────────────────────────────────────

const VPC = obj({
  semanticType: 'vpc', displayName: 'VPC', category: 'networking',
  iconShape: 'rectangle',
  defaultStyle: styled('#F0F9FF', '#0369A1', { strokeStyle: 'dashed' }),
  defaultSize: { width: 280, height: 200 },
  typicalTargets: [], typicalSources: [],
  aliases: ['vpc', 'virtual private cloud', 'vnet'],
});

const SUBNET = obj({
  semanticType: 'subnet', displayName: 'Subnet', category: 'networking',
  iconShape: 'rectangle',
  defaultStyle: styled('#F0F9FF', '#0EA5E9', { strokeStyle: 'dashed' }),
  defaultSize: { width: 200, height: 140 },
  typicalTargets: [], typicalSources: [],
  aliases: ['subnet', 'private subnet', 'public subnet'],
});

const INTERNET_GATEWAY = obj({
  semanticType: 'internet-gateway', displayName: 'Internet Gateway', category: 'networking',
  iconShape: 'rectangle',
  defaultStyle: styled('#DBEAFE', '#1E40AF'),
  defaultSize: { width: 150, height: 60 },
  typicalTargets: ['vpc', 'load-balancer'],
  typicalSources: ['client', 'browser'],
  aliases: ['internet gateway', 'igw'],
});

const NAT_GATEWAY = obj({
  semanticType: 'nat-gateway', displayName: 'NAT Gateway', category: 'networking',
  iconShape: 'rectangle',
  defaultStyle: styled('#E0E7FF', '#4338CA'),
  defaultSize: { width: 150, height: 60 },
  typicalTargets: ['external-system', 'internet-gateway'],
  typicalSources: ['service', 'lambda'],
  aliases: ['nat', 'nat gateway'],
});

const DNS = obj({
  semanticType: 'dns', displayName: 'DNS', category: 'networking',
  iconShape: 'cloud',
  defaultStyle: styled('#FAF5FF', '#9333EA'),
  defaultSize: { width: 140, height: 85 },
  typicalTargets: ['load-balancer', 'cdn', 'api-gateway'],
  typicalSources: ['client', 'browser'],
  aliases: ['dns', 'route 53', 'cloudflare dns', 'name server'],
});

const CDN = obj({
  semanticType: 'cdn', displayName: 'CDN', category: 'networking',
  iconShape: 'cloud',
  defaultStyle: styled('#FFFBEB', '#D97706'),
  defaultSize: { width: 140, height: 70 },
  typicalTargets: ['load-balancer', 'storage', 'api-gateway'],
  typicalSources: ['client', 'browser'],
  aliases: ['cdn', 'cloudfront', 'cloudflare', 'fastly', 'akamai', 'edge cache'],
});

const WAF = obj({
  semanticType: 'waf', displayName: 'WAF', category: 'networking',
  iconShape: 'rectangle',
  defaultStyle: styled('#FEE2E2', '#B91C1C'),
  defaultSize: { width: 130, height: 60 },
  typicalTargets: ['load-balancer', 'cdn', 'api-gateway'],
  typicalSources: ['client'],
  aliases: ['waf', 'web application firewall', 'firewall', 'ddos protection'],
});

const VPN = obj({
  semanticType: 'vpn', displayName: 'VPN', category: 'networking',
  iconShape: 'rectangle',
  defaultStyle: styled('#ECFDF5', '#059669'),
  defaultSize: { width: 130, height: 60 },
  typicalTargets: ['vpc', 'service'],
  typicalSources: ['user-actor', 'client'],
  aliases: ['vpn', 'site-to-site vpn', 'client vpn'],
});

const SERVICE_MESH = obj({
  semanticType: 'service-mesh', displayName: 'Service Mesh', category: 'networking',
  iconShape: 'hexagon',
  defaultStyle: styled('#F0FDF4', '#15803D'),
  defaultSize: { width: 150, height: 110 },
  typicalTargets: ['microservice', 'service'],
  typicalSources: ['microservice', 'service'],
  aliases: ['service mesh', 'istio', 'linkerd', 'envoy mesh', 'consul connect'],
});

// ─── Auth & identity ────────────────────────────────────────────────

const AUTH_SERVICE = obj({
  semanticType: 'auth-service', displayName: 'Auth Service', category: 'auth',
  iconShape: 'rectangle',
  defaultStyle: styled('#FCE7F3', '#BE185D'),
  defaultSize: { width: 140, height: 70 },
  typicalTargets: ['database', 'oauth-provider'],
  typicalSources: ['api-gateway', 'service', 'client'],
  aliases: ['auth', 'auth service', 'authentication', 'authorization service', 'authn', 'authz'],
});

const JWT_TOKEN = obj({
  semanticType: 'jwt-token', displayName: 'JWT', category: 'auth',
  iconShape: 'document',
  defaultStyle: styled('#FFF1F2', '#F43F5E'),
  defaultSize: { width: 110, height: 70 },
  typicalTargets: [], typicalSources: ['auth-service'],
  aliases: ['jwt', 'token', 'jwt token', 'access token', 'bearer token'],
});

const OAUTH_PROVIDER = obj({
  semanticType: 'oauth-provider', displayName: 'OAuth Provider', category: 'auth',
  iconShape: 'cloud',
  defaultStyle: styled('#F3E8FF', '#7E22CE'),
  defaultSize: { width: 150, height: 75 },
  typicalTargets: [], typicalSources: ['client', 'auth-service'],
  aliases: ['oauth', 'oauth provider', 'auth0', 'okta', 'clerk', 'sso provider', 'identity provider', 'idp'],
});

const IAM_ROLE = obj({
  semanticType: 'iam-role', displayName: 'IAM Role', category: 'auth',
  iconShape: 'rectangle',
  defaultStyle: styled('#FAF5FF', '#7C3AED'),
  defaultSize: { width: 130, height: 60 },
  typicalTargets: [], typicalSources: ['service', 'lambda', 'ec2-instance'],
  aliases: ['iam', 'iam role', 'role', 'service account', 'rbac'],
});

const SECRET_MANAGER = obj({
  semanticType: 'secret-manager', displayName: 'Secret Manager', category: 'auth',
  iconShape: 'cylinder',
  defaultStyle: styled('#FEF3C7', '#92400E'),
  defaultSize: { width: 140, height: 80 },
  typicalTargets: [], typicalSources: ['service', 'lambda', 'function'],
  aliases: ['secrets', 'secret manager', 'aws secrets', 'gcp secret manager', 'doppler', 'infisical', 'parameter store'],
});

const VAULT = obj({
  semanticType: 'vault', displayName: 'Vault', category: 'auth',
  iconShape: 'cylinder',
  defaultStyle: styled('#F1F5F9', '#0F172A', { fontSize: 14 }),
  defaultSize: { width: 130, height: 80 },
  typicalTargets: [], typicalSources: ['service', 'lambda'],
  aliases: ['vault', 'hashicorp vault', 'kms'],
});

// ─── Observability ──────────────────────────────────────────────────

const METRICS_STORE = obj({
  semanticType: 'metrics-store', displayName: 'Metrics Store', category: 'observability',
  iconShape: 'cylinder',
  defaultStyle: styled('#FEE2E2', '#DC2626'),
  defaultSize: { width: 150, height: 75 },
  typicalTargets: ['observability-platform'],
  typicalSources: ['service', 'lambda', 'microservice'],
  aliases: ['metrics', 'metrics store', 'prometheus', 'influxdb', 'cloudwatch metrics'],
});

const LOG_AGGREGATOR = obj({
  semanticType: 'log-aggregator', displayName: 'Log Aggregator', category: 'observability',
  iconShape: 'document',
  defaultStyle: styled('#F1F5F9', '#475569'),
  defaultSize: { width: 150, height: 75 },
  typicalTargets: ['elasticsearch', 'observability-platform', 'storage'],
  typicalSources: ['service', 'lambda', 'microservice', 'kubernetes-pod'],
  aliases: ['logs', 'log aggregator', 'logstash', 'fluentd', 'fluent bit', 'loki', 'cloudwatch logs'],
});

const TRACE_COLLECTOR = obj({
  semanticType: 'trace-collector', displayName: 'Trace Collector', category: 'observability',
  iconShape: 'rectangle',
  defaultStyle: styled('#FCE7F3', '#9D174D'),
  defaultSize: { width: 150, height: 70 },
  typicalTargets: ['observability-platform'],
  typicalSources: ['service', 'microservice'],
  aliases: ['trace', 'tracing', 'jaeger', 'tempo', 'zipkin', 'opentelemetry collector', 'otel'],
});

const OBSERVABILITY_PLATFORM = obj({
  semanticType: 'observability-platform', displayName: 'Observability', category: 'observability',
  iconShape: 'cloud',
  defaultStyle: styled('#EFF6FF', '#1E40AF'),
  defaultSize: { width: 160, height: 80 },
  typicalTargets: ['alerting'],
  typicalSources: ['metrics-store', 'log-aggregator', 'trace-collector'],
  aliases: ['observability', 'datadog', 'grafana', 'new relic', 'sentry', 'honeycomb', 'lightstep'],
});

const ALERTING = obj({
  semanticType: 'alerting', displayName: 'Alerts', category: 'observability',
  iconShape: 'rectangle',
  defaultStyle: styled('#FEF2F2', '#B91C1C'),
  defaultSize: { width: 130, height: 60 },
  typicalTargets: ['user-actor'],
  typicalSources: ['observability-platform'],
  aliases: ['alerts', 'alerting', 'pagerduty', 'opsgenie', 'on-call'],
});

// ─── Frontend ───────────────────────────────────────────────────────

const WEB_APP = obj({
  semanticType: 'web-app', displayName: 'Web App', category: 'frontend',
  iconShape: 'rectangle',
  defaultStyle: styled('#FFE4E6', '#E11D48'),
  defaultSize: { width: 140, height: 75 },
  typicalTargets: ['api-gateway', 'cdn', 'auth-service'],
  typicalSources: ['user-actor', 'browser'],
  aliases: ['web app', 'next.js app', 'react app', 'vue app', 'svelte app', 'remix app', 'spa app'],
});

const MOBILE_APP = obj({
  semanticType: 'mobile-app', displayName: 'Mobile App', category: 'frontend',
  iconShape: 'rectangle',
  defaultStyle: styled('#FFF1F2', '#FB7185'),
  defaultSize: { width: 110, height: 130 },
  typicalTargets: ['api-gateway', 'auth-service', 'cdn'],
  typicalSources: ['user-actor'],
  aliases: ['mobile app', 'ios app', 'android app', 'react native', 'flutter app', 'native app'],
});

const BROWSER = obj({
  semanticType: 'browser', displayName: 'Browser', category: 'frontend',
  iconShape: 'rectangle',
  defaultStyle: styled('#F0F9FF', '#0284C7'),
  defaultSize: { width: 140, height: 90 },
  typicalTargets: ['web-app', 'cdn', 'dns'],
  typicalSources: ['user-actor'],
  aliases: ['browser', 'chrome', 'safari', 'firefox', 'web browser'],
});

const PWA = obj({
  semanticType: 'pwa', displayName: 'PWA', category: 'frontend',
  iconShape: 'rectangle',
  defaultStyle: styled('#FAE8FF', '#A21CAF'),
  defaultSize: { width: 130, height: 75 },
  typicalTargets: ['api-gateway', 'service-worker'],
  typicalSources: ['user-actor', 'browser'],
  aliases: ['pwa', 'progressive web app', 'installable web app'],
});

const SERVICE_WORKER = obj({
  semanticType: 'service-worker', displayName: 'Service Worker', category: 'frontend',
  iconShape: 'rectangle',
  defaultStyle: styled('#F5F3FF', '#6D28D9'),
  defaultSize: { width: 140, height: 60 },
  typicalTargets: ['cdn', 'api-gateway'],
  typicalSources: ['pwa', 'web-app', 'browser'],
  aliases: ['service worker', 'sw', 'background worker (browser)'],
});

// ─── Primitives ──────────────────────────────────────────────────────

const RECTANGLE = obj({
  semanticType: 'rectangle', displayName: 'Rectangle', category: 'primitive',
  iconShape: 'rectangle',
  defaultStyle: styled('#F8FAFC', '#CBD5E1'),
  defaultSize: { width: 160, height: 100 },
  typicalTargets: [], typicalSources: [],
  aliases: ['rectangle', 'rect', 'shape', 'box (primitive)'],
});

const CIRCLE = obj({
  semanticType: 'circle', displayName: 'Circle', category: 'primitive',
  iconShape: 'circle',
  defaultStyle: styled('#F8FAFC', '#CBD5E1', { borderRadius: 999 }),
  defaultSize: { width: 100, height: 100 },
  typicalTargets: [], typicalSources: [],
  aliases: ['circle', 'oval', 'ellipse'],
});

const DIAMOND = obj({
  semanticType: 'diamond', displayName: 'Diamond', category: 'primitive',
  iconShape: 'diamond',
  defaultStyle: styled('#FEF3C7', '#D97706'),
  defaultSize: { width: 100, height: 100 },
  typicalTargets: [], typicalSources: [],
  aliases: ['diamond', 'decision', 'condition', 'if', 'branch', 'rhombus'],
});

const TEXT_OBJ = obj({
  semanticType: 'text', displayName: 'Text', category: 'primitive',
  iconShape: 'rectangle',
  defaultStyle: styled('transparent', 'transparent', { strokeWidth: 0, fontSize: 16 }),
  defaultSize: { width: 200, height: 40 },
  defaultConnectionPoints: [],
  defaultAnimation: { ...DEFAULT_ANIMATION, effect: 'typewriter' },
  typicalTargets: [], typicalSources: [],
  aliases: ['text', 'label', 'heading', 'title', 'annotation', 'caption'],
});

const STICKY_NOTE = obj({
  semanticType: 'sticky-note', displayName: 'Sticky Note', category: 'primitive',
  iconShape: 'rectangle',
  defaultStyle: styled('#FEF9C3', '#FACC15', { fontSize: 13, textAlign: 'left' }),
  defaultSize: { width: 160, height: 120 },
  defaultConnectionPoints: [],
  typicalTargets: [], typicalSources: [],
  aliases: ['sticky', 'sticky note', 'post-it', 'postit', 'memo', 'note'],
});

const IMAGE = obj({
  semanticType: 'image', displayName: 'Image', category: 'primitive',
  iconShape: 'rectangle',
  defaultStyle: styled('transparent', '#E2E8F0', { strokeWidth: 1, borderRadius: 4 }),
  defaultSize: { width: 200, height: 150 },
  typicalTargets: [], typicalSources: [],
  aliases: ['image', 'img', 'picture', 'photo', 'screenshot', 'illustration'],
});

// ─── The Full Library ────────────────────────────────────────────────

export const OBJECT_LIBRARY: Record<string, SemanticObjectDefinition> = {
  // Architecture core
  'database': DATABASE,
  'service': SERVICE,
  'microservice': MICROSERVICE,
  'queue': QUEUE,
  'cache': CACHE,
  'api-gateway': API_GATEWAY,
  'load-balancer': LOAD_BALANCER,
  'client': CLIENT,
  'data-lake': DATA_LAKE,
  'storage': STORAGE,
  'function': FUNCTION_OBJ,
  'container': CONTAINER,
  'user-actor': USER_ACTOR,
  'external-system': EXTERNAL_SYSTEM,
  'generic-box': GENERIC_BOX,
  // Streaming
  'kafka-broker': KAFKA_BROKER,
  'kafka-topic': KAFKA_TOPIC,
  'kafka-producer': KAFKA_PRODUCER,
  'kafka-consumer': KAFKA_CONSUMER,
  'consumer-group': CONSUMER_GROUP,
  'partition': PARTITION,
  'zookeeper': ZOOKEEPER,
  'rabbitmq-exchange': RABBITMQ_EXCHANGE,
  'rabbitmq-queue': RABBITMQ_QUEUE,
  'pulsar': PULSAR,
  'nats': NATS,
  'event-bus': EVENT_BUS,
  'webhook': WEBHOOK,
  // Compute
  'kubernetes-pod': KUBERNETES_POD,
  'k8s-deployment': K8S_DEPLOYMENT,
  'k8s-service': K8S_SERVICE,
  'k8s-ingress': K8S_INGRESS,
  'lambda': LAMBDA,
  'step-function': STEP_FUNCTION,
  'cron-job': CRON_JOB,
  'worker': WORKER,
  'ecs-task': ECS_TASK,
  'fargate': FARGATE,
  'ec2-instance': EC2_INSTANCE,
  // Data
  'snowflake': SNOWFLAKE,
  'bigquery': BIGQUERY,
  'redshift': REDSHIFT,
  'clickhouse': CLICKHOUSE,
  'elasticsearch': ELASTICSEARCH,
  'vector-db': VECTOR_DB,
  'etl-pipeline': ETL_PIPELINE,
  'stream-processor': STREAM_PROCESSOR,
  'materialized-view': MATERIALIZED_VIEW,
  // Networking
  'vpc': VPC,
  'subnet': SUBNET,
  'internet-gateway': INTERNET_GATEWAY,
  'nat-gateway': NAT_GATEWAY,
  'dns': DNS,
  'cdn': CDN,
  'waf': WAF,
  'vpn': VPN,
  'service-mesh': SERVICE_MESH,
  // Auth
  'auth-service': AUTH_SERVICE,
  'jwt-token': JWT_TOKEN,
  'oauth-provider': OAUTH_PROVIDER,
  'iam-role': IAM_ROLE,
  'secret-manager': SECRET_MANAGER,
  'vault': VAULT,
  // Observability
  'metrics-store': METRICS_STORE,
  'log-aggregator': LOG_AGGREGATOR,
  'trace-collector': TRACE_COLLECTOR,
  'observability-platform': OBSERVABILITY_PLATFORM,
  'alerting': ALERTING,
  // Frontend
  'web-app': WEB_APP,
  'mobile-app': MOBILE_APP,
  'browser': BROWSER,
  'pwa': PWA,
  'service-worker': SERVICE_WORKER,
  // Primitives
  'rectangle': RECTANGLE,
  'circle': CIRCLE,
  'diamond': DIAMOND,
  'text': TEXT_OBJ,
  'sticky-note': STICKY_NOTE,
  'image': IMAGE,
};

/**
 * Find a semantic object definition by alias.
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

/**
 * Get the IconShape for a semantic type. Used by the rendering bridge.
 */
export function getIconShape(semanticType: string): IconShape {
  return OBJECT_LIBRARY[semanticType]?.iconShape ?? 'rectangle';
}
