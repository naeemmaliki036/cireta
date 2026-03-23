# Project Eagle — Build Plan

**AI-First Kafka-Native Security Operations Center**

Document version: 2026-03-16
Status: Approved for build

---

## 1. Architecture Decision Record (ADR)

### ADR-001: Scaffold Reuse Strategy

The cireta scaffold provides a production-grade foundation. Eagle extends it — it does not replace it.

**Reuse directly (zero modification):**

| Module | Location | Eagle Usage |
|--------|----------|-------------|
| `packages/common/db/repository.py` | Generic async CRUD | All Postgres-backed repositories |
| `packages/common/db/session.py` | Async session + `DbSession` type alias | All Eagle FastAPI services |
| `packages/common/models/base.py` | `BaseModel` with UUID PK + timestamps | All Eagle SQLAlchemy models |
| `packages/common/models/encrypted_types.py` | `EncryptedString`, `EncryptedJSON` | IOC data, raw event payloads, connector credentials, API keys |
| `packages/common/core/auth_deps.py` | `CurrentUserId`, `OptionalUserId` | All Eagle endpoints |
| `packages/common/core/cache.py` | `RedisCache` with graceful degradation | MITRE ATT&CK cache, GeoIP cache, ML feature cache |
| `packages/common/core/config.py` | `Settings` base + two-tier config | Eagle-specific settings classes extend this |
| `packages/common/core/logging.py` | Structured logging with PII filtering | All Eagle services |
| `packages/common/middleware/*` | Logging, security headers, rate limiting | All Eagle FastAPI apps |
| `packages/common/utils/base_client.py` | HTTP client with retries | Connector outbound calls, threat intel feed polling |
| `packages/common/utils/http_errors.py` | `raise_not_found`, `raise_conflict` | All Eagle endpoints |
| `packages/common/services/base_service.py` | `BaseService[T]` generic | All Eagle service classes |
| `packages/common/services/auth_service.py` | JWT + password hashing | Eagle auth (extended with RBAC roles) |
| `packages/common/decorators/error_handling.py` | `@handle_endpoint_errors` | All Eagle endpoint decorators |

**Extend (add Eagle-specific subclasses/modules):**

| Module | Extension |
|--------|-----------|
| `packages/common/core/config.py` | `EagleSettings(Settings)` — adds Kafka, ClickHouse, Neo4j, ML config fields |
| `packages/common/core/auth_deps.py` | `get_current_eagle_user` — adds `tenant_id` extraction from JWT claims, RBAC role validation (SUPER_ADMIN, TENANT_ADMIN, ANALYST, READ_ONLY) |
| `packages/common/core/service_deps.py` | Factory functions for all Eagle services per scaffold pattern |
| `packages/common/models/base.py` | `TenantBaseModel(BaseModel)` — adds `tenant_id: Mapped[UUID]` column with index |
| `packages/common/db/repository.py` | `TenantRepository(Repository[T])` — auto-filters all queries by `tenant_id` |

**New shared packages (in `packages/`):**

| Package | Purpose |
|---------|---------|
| `packages/common/kafka/` | Base Kafka producer/consumer classes, serialization, health checks |
| `packages/common/ocsf/` | OCSF schema definitions, validation, mapping utilities |
| `packages/eagle/` | Eagle-specific shared code: models, schemas, constants, enums |

### ADR-002: Storage Architecture

**Decision: Four stores, each chosen for what it does best.**

| Store | Engine | What Lives There | Why |
|-------|--------|-------------------|-----|
| **Postgres 16** | SQLAlchemy async + Alembic | Users, tenants, RBAC, connector configs, mapping templates, case management (investigations, incidents, tasks, evidence), audit logs, ML model registry, pipeline definitions | Transactional integrity, relational joins, existing scaffold. JSONB handles semi-structured mapping templates and connector configs without adding MongoDB. |
| **ClickHouse** | `clickhouse-connect` (async) | Normalized OCSF events, enriched findings, ML scores, time-series aggregations, dashboard analytics | Columnar compression, sub-second aggregations over billions of rows, MergeTree partitioning by `(tenant_id, toYYYYMM(event_time))`. This is where SOC scale lives. |
| **Neo4j 5** | `neo4j` async driver | Entity graph: IPs ↔ users ↔ hosts ↔ domains ↔ findings ↔ incidents. Relationship types: `COMMUNICATED_WITH`, `AUTHENTICATED_AS`, `RESOLVED_TO`, `TRIGGERED`, `PART_OF_INCIDENT` | Graph traversal is a core product feature — "show me every entity connected to this IP within 3 hops" is a query Neo4j answers in milliseconds that would require recursive CTEs in Postgres. Entity graph is not optional; it's a competitive differentiator. |
| **Redis 7** | Existing `RedisCache` | Session cache, rate limiting, ML feature cache, MITRE ATT&CK lookup cache, real-time WebSocket pub/sub, deduplication bloom filter state, correlation window state | Already in scaffold. Extended for pub/sub (WebSocket fan-out) and stream-processing state. |

**MongoDB: Eliminated.** The spec proposed MongoDB for connector configs and mapping templates. After evaluating the scaffold, Postgres JSONB is architecturally superior here:

- Connector configs are relational (belong to a tenant, have lifecycle states, need audit trails, join with pipeline definitions). JSONB columns store the flexible schema portions.
- Mapping templates are versioned documents that reference OCSF field paths. A `mapping_templates` table with a `JSONB` `field_map` column gives us schema validation via Pydantic on read/write, full SQL queryability, and zero additional infrastructure.
- Eliminating MongoDB removes one database from operations (connection pooling, backups, monitoring, failover) without losing any capability. The scaffold's `EncryptedJSON` type already handles encrypted JSONB storage for sensitive config fields.

**Neo4j: Included from Phase 3.** Entity graph traversal is a core product feature, not a nice-to-have. The graph powers:
- Investigation pivot views ("show everything connected to this IOC")
- Automated correlation ("these 12 alerts share 3 common entities")
- Threat hunting ("find all lateral movement paths from this compromised host")

Neo4j enters in Phase 3 (Enrichment) because that's when entities are first extracted and linked. The entity extraction enrichment service writes to both ClickHouse (for analytics) and Neo4j (for graph traversal). Earlier phases don't produce entity relationships, so adding Neo4j before Phase 3 is premature infrastructure.

**ClickHouse: Included from Phase 3.** Phases 1–2 produce normalized OCSF events that initially land in Kafka. ClickHouse consumers activate in Phase 3 to store enriched, scored findings. Before Phase 3, development and integration testing use Postgres staging tables for OCSF events, which are migrated to ClickHouse when it comes online. This keeps Phase 1 focused on Kafka plumbing without blocking on ClickHouse schema design.

### ADR-003: Kafka Topology

**Cluster:** Single KRaft-mode broker for dev/staging. 3-broker KRaft cluster for production.

**Topics:**

| Topic | Partitions (prod) | Key | Retention | Producer | Consumer(s) |
|-------|-------------------|-----|-----------|----------|-------------|
| `raw.findings.v1` | 12 | `tenant_id` | 7 days | Connector services | Normalization service |
| `ocsf.findings.v1` | 12 | `tenant_id` | 30 days | Normalization service | Enrichment service, ClickHouse sink |
| `enriched.findings.v1` | 12 | `tenant_id` | 30 days | Enrichment service | ML scoring service, Correlation engine |
| `scored.findings.v1` | 12 | `tenant_id` | 30 days | ML scoring service | Correlation engine, ClickHouse sink |
| `incidents.v1` | 6 | `tenant_id` | 90 days | Correlation engine | Case management service, AI summary service, WebSocket broadcaster |
| `incidents.updates.v1` | 6 | `incident_id` | 90 days | Case management service | WebSocket broadcaster, Audit logger |
| `feedback.dispositions.v1` | 3 | `finding_id` | 180 days | SOC UI (via API) | ML retraining pipeline |
| `pipeline.dlq.v1` | 3 | `original_topic` | 30 days | All consumers (on failure) | DLQ monitor, manual replay |
| `entity.graph.v1` | 6 | `entity_id` | 30 days | Enrichment service | Neo4j graph writer |
| `audit.events.v1` | 3 | `actor_id` | 365 days | All services | Audit log writer |

**Partitioning rationale:** 12 partitions on high-throughput topics allows up to 12 parallel consumers per consumer group. Keyed by `tenant_id` ensures all events for a tenant land on the same partition, preserving ordering within a tenant. At 10,000 alerts/day, even single-partition would suffice — but the partition count is set for production growth without topic recreation.

**Consumer groups:**

| Group | Reads From | Purpose |
|-------|-----------|---------|
| `eagle.normalize.v1` | `raw.findings.v1` | OCSF normalization |
| `eagle.enrich.v1` | `ocsf.findings.v1` | MITRE + GeoIP + threat intel |
| `eagle.score.v1` | `enriched.findings.v1` | XGBoost ML scoring |
| `eagle.correlate.v1` | `scored.findings.v1` | Alert aggregation into incidents |
| `eagle.clickhouse-sink.v1` | `ocsf.findings.v1`, `enriched.findings.v1`, `scored.findings.v1` | ClickHouse batch insert |
| `eagle.neo4j-sink.v1` | `entity.graph.v1` | Neo4j graph upsert |
| `eagle.ai-summary.v1` | `incidents.v1` | DistilBART title/summary generation |
| `eagle.case-mgmt.v1` | `incidents.v1` | Auto-create investigation records |
| `eagle.ws-broadcast.v1` | `incidents.v1`, `incidents.updates.v1`, `scored.findings.v1` | WebSocket push to SOC analysts |
| `eagle.audit-writer.v1` | `audit.events.v1` | Append-only audit log persistence |
| `eagle.feedback.v1` | `feedback.dispositions.v1` | Buffer for retraining |

**Serialization:** JSON with schema registry (Confluent-compatible). Each message envelope:

```json
{
  "schema_version": "1.0",
  "tenant_id": "uuid",
  "trace_id": "correlation-id",
  "produced_at": "ISO-8601",
  "payload": { ... }
}
```

### ADR-004: ML Serving Architecture

**XGBoost scoring: In-process within a dedicated FastAPI service.**

The ML scoring service (`apps/eagle_ml_scorer/`) loads the XGBoost model into memory at startup and runs inference synchronously on each enriched finding. XGBoost inference on a feature vector is <1ms — the P95 <100ms target is trivially met even with feature extraction overhead.

Architecture:
- Model binary stored in `ml-models/` volume (S3 in production)
- Model loaded into memory at service startup via `xgboost.Booster.load_model()`
- Feature extraction pipeline: `EnrichedFinding → FeatureVector → XGBoost.predict() → ScoredFinding`
- Model hot-reload: watch for new model versions via arq background task, swap atomically
- Feature importance returned with every prediction (SHAP values pre-computed at training time, stored alongside model)

**No separate inference server (no TorchServe, no TFServing, no Triton).** XGBoost is a lightweight C++ library with Python bindings. Wrapping it in a FastAPI service that also consumes from Kafka is simpler, faster, and eliminates a network hop.

**DistilBART summarization: Self-hosted, containerized.**

Compliance requirement: no raw security event data leaves the infrastructure boundary. This rules out external LLM APIs for the production path.

Deployment strategy:
- `apps/eagle_ai_summarizer/` — FastAPI service with `transformers` + `distilbart-cnn-12-6`
- Runs on CPU. DistilBART-CNN-12-6 inference on a 500-token input: ~200ms on modern x86 CPU, ~400ms on ARM. Acceptable for incident summarization (not in the hot path; incidents are created at 1/100th the rate of raw findings).
- Docker image: `python:3.11-slim` + `torch` (CPU-only) + `transformers`. Image size ~2.5GB — acceptable for a dedicated service.
- GPU optional: if available, inference drops to ~30ms. The service auto-detects CUDA.
- Model downloaded at build time, baked into Docker image. No runtime model downloads.

**LLM Explanation endpoint: Self-hosted, SHAP-first architecture.**

The spec's Together AI explanation service creates a data sovereignty conflict with the self-hosted DistilBART decision — raw security event data cannot leave the infrastructure boundary, so Together AI is ruled out for the same reason.

Architecture for ML prediction explanations:
- Primary path: **SHAP-only natural language rendering** — SHAP feature importance values are already computed at training time and returned with every prediction. A deterministic template engine in `eagle_ml_scorer` converts the top-N SHAP features into human-readable explanation strings without any LLM call. Example output: *"Scored HIGH (0.91 confidence) — primary signals: rare source IP reputation (weight: 0.34), MITRE T1078 tactic match (weight: 0.28), off-hours activity pattern (weight: 0.19)."* This covers 95% of explanation use cases with zero latency overhead and zero compliance risk.
- Secondary path (on-demand, opt-in): **Self-hosted Flan-T5-base** in `apps/eagle_ai_summarizer/` alongside DistilBART. Flan-T5-base is 250MB vs DistilBART's 900MB, runs on same CPU container, and generates fluent 2–4 sentence explanations from the SHAP feature vector + finding metadata. Critically: only the structured feature vector (numeric values + feature names) is sent to the LLM — never raw event payloads. This preserves data sovereignty.
- The explanation endpoint is `POST /api/v1/findings/{id}/explain` on `eagle_api` — proxies to `eagle_ai_summarizer`. Response includes both: `shap_explanation` (always present, fast) and `llm_explanation` (present if requested via `?deep=true`).

### ADR-005: Multi-Tenant Isolation

**Principle: tenant_id everywhere, enforced at every layer.**

| Layer | Isolation Mechanism |
|-------|---------------------|
| **JWT** | `tenant_id` claim in every token. `SUPER_ADMIN` can access all tenants. All other roles scoped to their tenant. |
| **Postgres** | `TenantBaseModel` adds `tenant_id` column. `TenantRepository` auto-filters all queries. Row-Level Security (RLS) as defense-in-depth. |
| **Kafka** | All messages keyed by `tenant_id`. Consumer-side filtering validates tenant access before processing. |
| **ClickHouse** | Partitioned by `(tenant_id, toYYYYMM(event_time))`. Query middleware injects `WHERE tenant_id = ?`. |
| **Neo4j** | All nodes carry `tenant_id` property. Cypher queries always include `{tenant_id: $tid}` filter. |
| **Redis** | Cache keys prefixed with `tenant:{tenant_id}:`. |
| **UI** | `TenantContext` in React. API repository classes inject `X-Tenant-ID` header on every request. |

### ADR-006: WebSocket Architecture

**Decision: FastAPI built-in WebSocket, Redis pub/sub for fan-out.**

FastAPI's native WebSocket support handles the real-time requirements without a separate service. The architecture:

1. `apps/eagle_api/api/v1/endpoints/ws.py` — WebSocket endpoint, authenticated via JWT query param
2. On connect: subscribe to Redis pub/sub channels `tenant:{tenant_id}:findings`, `tenant:{tenant_id}:incidents`
3. Kafka consumer (`eagle.ws-broadcast.v1`) reads from `incidents.v1`, `scored.findings.v1` → publishes to Redis pub/sub
4. WebSocket endpoint receives Redis messages → pushes to connected clients

Why not a separate WebSocket service: FastAPI handles WebSocket connections natively. Redis pub/sub handles multi-process fan-out (multiple uvicorn workers, each with its own WebSocket connections, all receive messages). This is the standard pattern for <10,000 concurrent connections. A separate service adds deployment complexity without solving a problem we have.

---

## 2. New Services Catalog

### 2.1 `apps/eagle_api/` — Eagle Core API

| Field | Value |
|-------|-------|
| **Purpose** | Primary REST API for Eagle SOC platform. Case management, connector CRUD, pipeline management, triage actions, feedback submission, admin operations. WebSocket endpoint for real-time push. |
| **Tech stack** | FastAPI, SQLAlchemy async, Alembic, Pydantic v2, Redis, WebSocket |
| **Kafka topics** | Writes: `feedback.dispositions.v1`, `audit.events.v1`. Reads: none (WebSocket fan-out via Redis pub/sub). |
| **DB tables owned** | `eagle_users`, `eagle_tenants`, `eagle_roles`, `connectors`, `connector_configs`, `mapping_templates`, `pipelines`, `pipeline_stages`, `investigations`, `incidents`, `incident_alerts`, `tasks`, `evidence`, `comments`, `dispositions`, `ml_models`, `ml_model_versions`, `eagle_audit_logs` |
| **Inherits from scaffold** | `BaseModel`, `TenantBaseModel`, `Repository`, `TenantRepository`, `BaseService`, `AuthService`, `DbSession`, `CurrentUserId`, `RedisCache`, all middleware, `EncryptedString`/`EncryptedJSON`, `@handle_endpoint_errors`, structured HTTPException errors |
| **DI pattern** | All services injected via `Annotated[XService, Depends(get_x_service)]`. Factory functions in `packages/common/core/service_deps.py`. |
| **Middleware order** | `CORSMiddleware` → `RateLimitMiddleware` → `SecurityHeadersMiddleware` → `LoggingMiddleware` (bottom to top in `main.py`, per scaffold rules) |

### 2.2 `apps/eagle_normalizer/` — OCSF Normalization Service

| Field | Value |
|-------|-------|
| **Purpose** | Kafka consumer that reads raw findings, maps them to OCSF format using mapping templates, deduplicates, and produces normalized events. |
| **Tech stack** | FastAPI (health/metrics endpoint), aiokafka, Pydantic v2, Postgres (reads mapping templates) |
| **Kafka topics** | Reads: `raw.findings.v1`. Writes: `ocsf.findings.v1`, `pipeline.dlq.v1` |
| **DB tables read** | `mapping_templates`, `connectors` |
| **Inherits from scaffold** | `packages/common/kafka/base_consumer.py`, `packages/common/kafka/base_producer.py`, `packages/common/ocsf/`, `RedisCache` (dedup bloom filter), `packages/common/core/logging.py`, `EagleSettings` |

### 2.3 `apps/eagle_enrichment/` — Enrichment Service

| Field | Value |
|-------|-------|
| **Purpose** | Enriches OCSF findings with MITRE ATT&CK tactics/techniques, MaxMind GeoIP, threat intel IOC matching, and entity extraction. Writes entity relationships to Neo4j via Kafka. |
| **Tech stack** | FastAPI (health/metrics), aiokafka, `mitreattack-python`, `geoip2` (MaxMind), httpx (STIX/TAXII feeds), `neo4j` async driver |
| **Kafka topics** | Reads: `ocsf.findings.v1`. Writes: `enriched.findings.v1`, `entity.graph.v1`, `pipeline.dlq.v1` |
| **DB tables read** | `threat_intel_feeds` (Postgres — feed URLs, API keys via `EncryptedString`) |
| **Inherits from scaffold** | `packages/common/kafka/*`, `RedisCache` (MITRE + GeoIP caching), `base_client.py` (threat intel HTTP calls with retries), `packages/common/core/logging.py` |

### 2.4 `apps/eagle_ml_scorer/` — ML Scoring Service

| Field | Value |
|-------|-------|
| **Purpose** | XGBoost inference on enriched findings. Produces confidence score, TP/FP classification, feature importance. Stores results in ClickHouse. |
| **Tech stack** | FastAPI (health/metrics + REST inference endpoint for ad-hoc scoring), aiokafka, xgboost, numpy, `clickhouse-connect` |
| **Kafka topics** | Reads: `enriched.findings.v1`. Writes: `scored.findings.v1`, `pipeline.dlq.v1` |
| **DB tables owned** | ClickHouse: `scored_findings` table. Postgres: reads `ml_models`, `ml_model_versions` |
| **Inherits from scaffold** | `packages/common/kafka/*`, `RedisCache` (feature cache), `EagleSettings`, `packages/common/core/logging.py` |

### 2.5 `apps/eagle_correlator/` — Correlation Engine

| Field | Value |
|-------|-------|
| **Purpose** | Groups scored findings into incidents using configurable strategies (time window, priority threshold, entity grouping). Creates incident records. |
| **Tech stack** | FastAPI (health/metrics), aiokafka, SQLAlchemy async (incident creation) |
| **Kafka topics** | Reads: `scored.findings.v1`. Writes: `incidents.v1`, `pipeline.dlq.v1` |
| **DB tables owned** | `correlation_rules`, `correlation_windows` (Postgres) |
| **DB tables written** | `incidents`, `incident_alerts` (via Eagle API internal call or direct DB) |
| **Inherits from scaffold** | `packages/common/kafka/*`, `TenantRepository`, `BaseService`, `RedisCache` (window state), `packages/common/core/logging.py` |

### 2.6 `apps/eagle_ai_summarizer/` — AI Title/Summary Generator

| Field | Value |
|-------|-------|
| **Purpose** | Generates incident titles (≤120 chars) and summaries (≤500 chars) using self-hosted DistilBART. Updates incident records via Eagle API. |
| **Tech stack** | FastAPI (health/metrics), aiokafka, `transformers`, `torch` (CPU), Pydantic v2 |
| **Kafka topics** | Reads: `incidents.v1`. Writes: `incidents.updates.v1`, `pipeline.dlq.v1` |
| **DB tables written** | `incidents` (title, summary fields — via Eagle API internal call) |
| **Inherits from scaffold** | `packages/common/kafka/*`, `EagleSettings`, `packages/common/core/logging.py` |

### 2.7 `apps/eagle_connector_splunk/` — Splunk ES Connector (Reference Implementation)

| Field | Value |
|-------|-------|
| **Purpose** | Polls Splunk Enterprise Security REST API for notable events, transforms to raw finding format, produces to Kafka. Serves as the reference connector implementation. |
| **Tech stack** | FastAPI (health/metrics/management), aiokafka, httpx, Pydantic v2 |
| **Kafka topics** | Writes: `raw.findings.v1` |
| **DB tables read** | `connectors`, `connector_configs` (poll intervals, credentials via `EncryptedString`) |
| **Inherits from scaffold** | `packages/common/kafka/base_producer.py`, `packages/eagle/connectors/base_connector.py`, `base_client.py`, `EncryptedString`, `packages/common/core/logging.py` |

### 2.8 `apps/eagle_sink_clickhouse/` — ClickHouse Sink Service

| Field | Value |
|-------|-------|
| **Purpose** | Kafka consumer that batch-inserts OCSF events, enriched findings, and scored findings into ClickHouse. Handles backpressure and batch sizing. |
| **Tech stack** | FastAPI (health/metrics), aiokafka, `clickhouse-connect` |
| **Kafka topics** | Reads: `ocsf.findings.v1`, `enriched.findings.v1`, `scored.findings.v1` |
| **ClickHouse tables owned** | `ocsf_events`, `enriched_findings`, `scored_findings`, `finding_analytics` (materialized view) |
| **Inherits from scaffold** | `packages/common/kafka/base_consumer.py`, `EagleSettings`, `packages/common/core/logging.py` |

### 2.9 `apps/eagle_sink_neo4j/` — Neo4j Graph Writer

| Field | Value |
|-------|-------|
| **Purpose** | Kafka consumer that upserts entity nodes and relationships into Neo4j. Handles dedup and merge operations. |
| **Tech stack** | FastAPI (health/metrics), aiokafka, `neo4j` async driver |
| **Kafka topics** | Reads: `entity.graph.v1` |
| **Neo4j ownership** | All entity nodes (`:IP`, `:Domain`, `:User`, `:Host`, `:Hash`, `:Finding`, `:Incident`) and relationships |
| **Inherits from scaffold** | `packages/common/kafka/base_consumer.py`, `EagleSettings`, `packages/common/core/logging.py` |

### 2.10 `apps/eagle_retrainer/` — ML Retraining Pipeline

| Field | Value |
|-------|-------|
| **Purpose** | Consumes analyst feedback (TP/FP dispositions), accumulates training data, triggers XGBoost retraining, validates new model, promotes to production. |
| **Tech stack** | FastAPI (health/metrics/trigger endpoint), aiokafka, xgboost, scikit-learn, numpy, pandas |
| **Kafka topics** | Reads: `feedback.dispositions.v1` |
| **DB tables** | Postgres: reads/writes `ml_models`, `ml_model_versions`, `training_datasets`. ClickHouse: reads `scored_findings` for training features. |
| **Inherits from scaffold** | `packages/common/kafka/base_consumer.py`, `TenantRepository`, `BaseService`, `EagleSettings`, arq (background training jobs) |

### 2.11 `apps/eagle_moe_router/` — Mixture of Experts Router

| Field | Value |
|-------|-------|
| **Purpose** | Routes enriched findings to specialist XGBoost models based on event type (network, endpoint, identity, cloud). Manages expert registry, confidence weighting, and fallback to generalist model. |
| **Tech stack** | FastAPI (health/metrics/routing endpoint), aiokafka, xgboost, numpy |
| **Kafka topics** | Reads: `enriched.findings.v1`. Writes: `scored.findings.v1` (replaces single-model scorer in Phase 6) |
| **DB tables** | Postgres: reads `ml_models`, `ml_model_versions`, `moe_routing_rules`, `expert_registry` |
| **Inherits from scaffold** | `packages/common/kafka/*`, `RedisCache` (routing cache), `EagleSettings` |

### 2.12 `apps/eagle-soc-ui/` — SOC Analyst Frontend

| Field | Value |
|-------|-------|
| **Purpose** | Real-time triage interface for SOC analysts. Live findings feed, investigation management, incident response, entity graph visualization, keyboard shortcuts. |
| **Tech stack** | Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript strict, `@tanstack/react-query`, `d3-force` (entity graph), native WebSocket |
| **Naming** | Directory: `eagle-soc-ui` (kebab-case per scaffold). Package name in `package.json`: `eagle-soc-ui`. |
| **Atomic design** | Full hierarchy: atoms (BaseButton, BaseInput, Badge, Severity, StatusDot) → molecules (FindingCard, AlertRow, FilterBar, SearchField) → organisms (FindingsTable, IncidentTimeline, EntityGraph, InvestigationPanel, CorrelationView) → templates (SOCLayout, TriageLayout, InvestigationLayout) → pages |
| **Repository pattern** | `lib/api/repositories/`: `FindingRepository`, `IncidentRepository`, `InvestigationRepository`, `EntityRepository`, `ConnectorRepository`, `AnalyticsRepository`. No raw `fetch()`. All extend `BaseRepository`. |
| **Contexts** | `AuthContext`, `TenantContext`, `ThemeContext`, `WebSocketContext`, `KeyboardShortcutContext` |
| **Hooks** | Max 150 LOC each. `useFindings`, `useIncidents`, `useWebSocket`, `useEntityGraph`, `useKeyboardShortcuts`, `useTriage`. Complex hooks split per scaffold rules. |
| **CSS** | All colors via CSS variables: `bg-[var(--brand-primary)]`, `text-[var(--severity-critical)]`. Zero hardcoded colors. |
| **forwardRef** | All atoms wrapping HTML elements use `forwardRef` per scaffold rules. |

### 2.13 `apps/eagle-admin-ui/` — Admin & Pipeline Management Frontend

| Field | Value |
|-------|-------|
| **Purpose** | Connector management, pipeline lifecycle (create/test/deploy/monitor), Kafka topic monitoring, ML model registry, tenant management, system health dashboards. |
| **Tech stack** | Same as SOC UI. Shares UI packages from `packages/eagle-ui-shared/`. |
| **Atomic design** | Reuses shared atoms/molecules from `packages/eagle-ui-shared/`. Admin-specific organisms: `ConnectorWizard`, `PipelineBuilder`, `KafkaMonitor`, `ModelRegistryTable`, `TenantManager`. |
| **Repository pattern** | `ConnectorAdminRepository`, `PipelineRepository`, `KafkaAdminRepository`, `ModelRegistryRepository`, `TenantAdminRepository`. |

### 2.14 Shared Packages

#### `packages/common/kafka/` — Kafka Base Classes

```
packages/common/kafka/
├── __init__.py
├── base_producer.py          # BaseProducer: aiokafka wrapper, serialization, error handling, metrics
├── base_consumer.py          # BaseConsumer: consumer group management, offset commits, DLQ routing
├── serialization.py          # JSON envelope serialization/deserialization with schema version
├── health.py                 # Kafka broker health check for FastAPI lifespan
├── config.py                 # KafkaSettings: bootstrap_servers, security, consumer/producer defaults
└── topics.py                 # Topic name constants, partition config, retention config
```

All Eagle Kafka services inherit from `BaseProducer`/`BaseConsumer`. These classes handle:
- Connection lifecycle (lifespan integration)
- JSON envelope wrapping/unwrapping with `schema_version`, `tenant_id`, `trace_id`
- Automatic DLQ routing on processing failure (configurable max retries)
- Consumer offset management (at-least-once by default, exactly-once via idempotent writes)
- Structured logging with correlation IDs from `packages/common/core/logging.py`
- Health check endpoint integration

#### `packages/common/ocsf/` — OCSF Schema Package

```
packages/common/ocsf/
├── __init__.py
├── schema.py                 # OCSF v1.1 Pydantic models (Finding, Detection, Vulnerability, etc.)
├── validator.py              # OCSF schema validation utilities
├── mapper.py                 # Generic field mapper: source_schema → OCSF (uses mapping templates)
└── constants.py              # OCSF category IDs, class IDs, severity levels, activity IDs
```

#### `packages/eagle/` — Eagle Domain Package

```
packages/eagle/
├── __init__.py
├── models/                   # All Eagle SQLAlchemy models (shared across services)
│   ├── __init__.py
│   ├── tenant.py             # Tenant, TenantSettings
│   ├── connector.py          # Connector, ConnectorConfig (EncryptedJSON for credentials)
│   ├── mapping_template.py   # MappingTemplate (JSONB field_map)
│   ├── pipeline.py           # Pipeline, PipelineStage
│   ├── finding.py            # Finding (reference model — ClickHouse is primary store)
│   ├── investigation.py      # Investigation
│   ├── incident.py           # Incident, IncidentAlert
│   ├── task.py               # Task
│   ├── evidence.py           # Evidence (EncryptedJSON for sensitive attachments)
│   ├── comment.py            # Comment
│   ├── disposition.py        # Disposition (TP/FP feedback)
│   ├── correlation_rule.py   # CorrelationRule, CorrelationWindow
│   ├── ml_model.py           # MLModel, MLModelVersion
│   ├── threat_intel_feed.py  # ThreatIntelFeed (EncryptedString for API keys)
│   ├── moe_config.py         # ExpertRegistry, MoERoutingRule
│   └── eagle_audit_log.py    # EagleAuditLog (extends scaffold AuditLog pattern, adds before/after diffs)
├── schemas/                  # Pydantic request/response schemas
│   ├── __init__.py
│   ├── finding.py
│   ├── investigation.py
│   ├── incident.py
│   ├── connector.py
│   ├── pipeline.py
│   ├── disposition.py
│   ├── ml_model.py
│   └── analytics.py
├── enums.py                  # Severity, Status, ConnectorType, PipelineState, Role, etc.
├── constants.py              # Eagle-wide constants
└── exceptions.py             # Eagle-specific exception classes
```

#### `packages/eagle/connectors/` — Connector Framework

```
packages/eagle/connectors/
├── __init__.py
├── base_connector.py         # ABC: BaseConnector with poll(), transform(), validate(), health_check()
├── connector_registry.py     # Runtime connector type → class mapping
└── isolation.py              # Docker-level isolation utilities for untrusted connectors
```

**Connector isolation strategy:** Each connector type runs as a separate FastAPI service in its own Docker container. The `BaseConnector` ABC defines the interface; each connector implementation is a self-contained `apps/eagle_connector_*` service. This provides process-level isolation (memory, CPU, crash containment) without the complexity of per-connector Python venvs. For third-party/untrusted connectors, the Docker container runs with restricted capabilities (`--cap-drop=ALL`, `--read-only`, `--no-new-privileges`), network-limited to Kafka and the connector's target API only.

#### `packages/eagle-ui-shared/` — Shared Frontend Components (TypeScript)

```
packages/eagle-ui-shared/
├── package.json
├── tsconfig.json
├── src/
│   ├── atoms/
│   │   ├── badges/
│   │   │   └── SeverityBadge.tsx      # forwardRef, CSS var colors
│   │   ├── buttons/
│   │   │   └── ActionButton.tsx       # forwardRef
│   │   ├── indicators/
│   │   │   └── StatusDot.tsx          # forwardRef
│   │   └── inputs/
│   │       └── SearchInput.tsx        # forwardRef
│   ├── molecules/
│   │   ├── cards/
│   │   │   └── FindingCard.tsx
│   │   └── filters/
│   │       └── FilterBar.tsx
│   ├── lib/
│   │   ├── api/
│   │   │   ├── config/
│   │   │   │   └── endpoints.ts
│   │   │   ├── errors.ts              # ApiError class
│   │   │   └── repositories/
│   │   │       └── base/
│   │   │           └── BaseRepository.ts
│   │   ├── types/
│   │   │   ├── finding.ts
│   │   │   ├── incident.ts
│   │   │   ├── investigation.ts
│   │   │   └── connector.ts
│   │   └── utils/
│   │       ├── cn.ts
│   │       └── severity.ts
│   └── contexts/
│       ├── TenantContext.tsx
│       └── WebSocketContext.tsx
```

---

## 3. Phased Build Plan

### Phase 1: Infrastructure Foundation — "The Plumbing"

**Goal:** Kafka cluster running, base producer/consumer classes proven, Eagle Postgres schema migrated, all new infrastructure services healthy in docker-compose, tenant model established.

**Duration estimate:** 2–3 weeks

**Complexity: L**

#### Deliverables

| # | Deliverable | File(s) | Complexity |
|---|------------|---------|------------|
| 1.1 | Docker Compose: Kafka (KRaft), Zookeeper-free | `infra/docker-compose.eagle.yml` — adds `kafka` (confluentinc/cp-kafka:7.6), `kafka-ui` (provectuslabs/kafka-ui) | S |
| 1.2 | Docker Compose: Redis (already exists — verify config) | Existing `docker-compose.yml` — no changes needed | S |
| 1.3 | Kafka base producer class | `packages/common/kafka/__init__.py`, `packages/common/kafka/base_producer.py` (~180 LOC: init, send, send_batch, flush, close, health_check, envelope wrapping) | M |
| 1.4 | Kafka base consumer class | `packages/common/kafka/base_consumer.py` (~250 LOC: init, subscribe, consume loop, commit, DLQ routing, graceful shutdown). Split: DLQ logic in `packages/common/kafka/dlq.py` (~80 LOC) | M |
| 1.5 | Kafka serialization + envelope | `packages/common/kafka/serialization.py` (~100 LOC), `packages/common/kafka/topics.py` (~60 LOC — topic name constants) | S |
| 1.6 | Kafka health check | `packages/common/kafka/health.py` (~50 LOC — broker connectivity, topic existence verification) | S |
| 1.7 | Kafka config | `packages/common/kafka/config.py` (~80 LOC — `KafkaSettings` Pydantic model extending scaffold's two-tier config pattern) | S |
| 1.8 | `TenantBaseModel` | `packages/eagle/models/tenant.py` (~60 LOC — `Tenant` model + `TenantBaseModel` abstract base with `tenant_id` FK, index) | S |
| 1.9 | `TenantRepository` | `packages/eagle/repositories/tenant_repository.py` (~90 LOC — extends `Repository[T]`, auto-injects `tenant_id` filter on all queries) | S |
| 1.10 | Eagle Postgres schema — core tables | `packages/eagle/models/`: `tenant.py`, `connector.py`, `mapping_template.py`, `pipeline.py`, `eagle_audit_log.py`. Each ≤200 LOC. | M |
| 1.11 | Eagle Postgres schema — case management tables | `packages/eagle/models/`: `investigation.py`, `incident.py`, `task.py`, `evidence.py`, `comment.py`, `disposition.py`. Each ≤150 LOC. | M |
| 1.12 | Eagle Postgres schema — ML tables | `packages/eagle/models/`: `ml_model.py` (~120 LOC — `MLModel`, `MLModelVersion`), `threat_intel_feed.py` (~80 LOC) | S |
| 1.13 | Eagle Pydantic schemas | `packages/eagle/schemas/`: one file per domain entity, each ≤200 LOC. Create/Update/Response variants per scaffold pattern. | M |
| 1.14 | Eagle enums + constants | `packages/eagle/enums.py` (~150 LOC), `packages/eagle/constants.py` (~50 LOC) | S |
| 1.15 | Alembic migration: Eagle schema | `infra/alembic/versions/004_eagle_initial_schema.py` — all Eagle tables in one migration | M |
| 1.16 | Eagle RBAC: JWT claims extension | Extend `packages/common/core/auth_deps.py` with `get_current_eagle_user` that extracts `tenant_id` + `role` from JWT. Add `EagleCurrentUser` type alias. ~80 LOC addition. | S |
| 1.17 | `EagleSettings` config class | `packages/eagle/config.py` (~120 LOC — extends `Settings` with `kafka_bootstrap_servers`, `clickhouse_url`, `neo4j_uri`, `ml_model_path`, etc.) | S |
| 1.18 | Eagle API app scaffold | `apps/eagle_api/main.py` (~90 LOC — `create_app()` with middleware stack per scaffold order), `apps/eagle_api/api/v1/router.py`, `apps/eagle_api/api/v1/endpoints/health.py` | S |
| 1.19 | Integration tests: Kafka round-trip | `tests/integration/test_kafka_producer_consumer.py` (~150 LOC — produce to topic, consume, verify envelope) | M |
| 1.20 | Integration tests: Eagle schema | `tests/integration/test_eagle_models.py` (~200 LOC — CRUD on all Eagle models, tenant isolation verification) | M |

#### Acceptance Criteria

- [ ] `docker-compose -f infra/docker-compose.eagle.yml up` starts Kafka + kafka-ui + Postgres + Redis, all healthy
- [ ] `BaseProducer` sends JSON message to `raw.findings.v1`, `BaseConsumer` reads it back with correct envelope fields
- [ ] DLQ routing works: consumer raises exception → message appears in `pipeline.dlq.v1`
- [ ] All Eagle Postgres tables created via Alembic migration, `poetry run alembic upgrade head` succeeds
- [ ] `TenantRepository` queries are tenant-scoped: Tenant A cannot read Tenant B's records (tested)
- [ ] Eagle API starts, `/api/v1/health/live` returns 200
- [ ] JWT with `tenant_id` + `role` claims is validated by `get_current_eagle_user`
- [ ] All 20+ tests pass: `poetry run pytest tests/integration/test_kafka* tests/integration/test_eagle*`

---

### Phase 2: Ingestion & Normalization — "Data In"

**Goal:** Connectors produce raw findings to Kafka, normalization service maps them to OCSF, deduplication prevents duplicates, mapping templates are CRUD-managed via API. Splunk ES connector operational as reference implementation.

**Duration estimate:** 2–3 weeks

**Complexity: L**

#### Deliverables

| # | Deliverable | File(s) | Complexity |
|---|------------|---------|------------|
| 2.1 | Connector framework: `BaseConnector` ABC | `packages/eagle/connectors/base_connector.py` (~150 LOC — abstract methods: `poll()`, `transform()`, `validate()`, `health_check()`, `get_schema()`. Lifecycle: `start()`, `stop()`. Config injection.) | M |
| 2.2 | Connector registry | `packages/eagle/connectors/connector_registry.py` (~60 LOC — maps `ConnectorType` enum to connector class) | S |
| 2.3 | Connector isolation utilities | `packages/eagle/connectors/isolation.py` (~100 LOC — Docker container spec generation for untrusted connectors, capability restrictions, network policy) | S |
| 2.4 | Splunk ES connector service | `apps/eagle_connector_splunk/main.py` (~80 LOC), `apps/eagle_connector_splunk/connector.py` (~200 LOC — implements `BaseConnector`, polls Splunk REST API `/services/notable`, transforms to raw finding format), `apps/eagle_connector_splunk/splunk_client.py` (~150 LOC — extends `base_client.py` with Splunk auth, search endpoint calls). Each file ≤250 LOC. | L |
| 2.5 | Splunk connector config schema | `apps/eagle_connector_splunk/schemas.py` (~80 LOC — Pydantic models for Splunk connection params, poll interval, saved search names) | S |
| 2.6 | OCSF schema package | `packages/common/ocsf/schema.py` (~250 LOC — Pydantic models for OCSF Finding, DetectionFinding, VulnerabilityFinding. Split into `packages/common/ocsf/schema_detection.py` + `packages/common/ocsf/schema_vulnerability.py` if exceeding 300 LOC), `packages/common/ocsf/constants.py` (~100 LOC), `packages/common/ocsf/validator.py` (~80 LOC) | M |
| 2.7 | OCSF field mapper | `packages/common/ocsf/mapper.py` (~200 LOC — generic mapper that takes a raw finding + mapping template JSONB → produces OCSF-valid output. Supports jmespath expressions for complex field extraction.) | M |
| 2.8 | Normalization service | `apps/eagle_normalizer/main.py` (~80 LOC), `apps/eagle_normalizer/consumer.py` (~200 LOC — `NormalizationConsumer(BaseConsumer)`: reads raw findings, loads mapping template by connector type, runs mapper, validates OCSF output, produces to `ocsf.findings.v1`), `apps/eagle_normalizer/dedup.py` (~120 LOC — Redis-backed bloom filter for finding dedup by content hash) | L |
| 2.9 | Mapping template CRUD API | `apps/eagle_api/api/v1/endpoints/mapping_templates.py` (~150 LOC), `apps/eagle_api/services/mapping_template_service.py` (~180 LOC — validation, versioning, default template management. Split: `mapping_template_validation_service.py` ~100 LOC for OCSF field path validation) | M |
| 2.10 | Connector management API | `apps/eagle_api/api/v1/endpoints/connectors.py` (~180 LOC — CRUD + test connection + enable/disable), `apps/eagle_api/services/connector_service.py` (~200 LOC — lifecycle management, credential encryption via `EncryptedJSON`, health check orchestration) | M |
| 2.11 | Pipeline management API | `apps/eagle_api/api/v1/endpoints/pipelines.py` (~150 LOC — create, configure stages, deploy, pause, resume), `apps/eagle_api/services/pipeline_service.py` (~200 LOC — state machine: DRAFT → TESTING → DEPLOYED → PAUSED → ARCHIVED) | M |
| 2.12 | Service factory functions | Update `packages/common/core/service_deps.py` — add `get_connector_service()`, `get_mapping_template_service()`, `get_pipeline_service()`. All use `Annotated[XService, Depends(get_x_service)]` pattern. | S |
| 2.13 | Connector Dockerfiles | `Dockerfile.eagle-connector-splunk` at repo root. Multi-stage build per scaffold conventions. | S |
| 2.14 | Default mapping templates | `packages/common/ocsf/default_mappings/splunk_es.json` — pre-built mapping template for Splunk ES notable events → OCSF Detection Finding | S |
| 2.15 | Integration tests: full ingestion pipeline | `tests/integration/test_ingestion_pipeline.py` (~200 LOC — Splunk connector mock → Kafka → Normalizer → OCSF output verification) | M |
| 2.16 | Unit tests: OCSF mapper | `tests/unit/test_ocsf_mapper.py` (~200 LOC — mapping template variations, edge cases, invalid input handling) | M |

#### Acceptance Criteria

- [ ] Splunk ES connector polls mock Splunk API, produces well-formed raw findings to `raw.findings.v1`
- [ ] Normalization service consumes raw findings, applies mapping template, produces valid OCSF findings to `ocsf.findings.v1`
- [ ] Deduplication: same finding produced twice → only one OCSF event emitted
- [ ] Mapping templates: CRUD via API, versioned, validated against OCSF schema
- [ ] Connector management: create, test connection (dry run), enable, disable, delete — all via API with structured errors
- [ ] Pipeline lifecycle: create pipeline, add stages, deploy → connector starts polling, pause → connector stops, resume → connector resumes
- [ ] All credentials stored via `EncryptedJSON`, never appear in logs (PII filtering verified)
- [ ] Malformed raw findings → routed to `pipeline.dlq.v1` with error context
- [ ] 30+ new tests pass

---

### Phase 3: Enrichment, ML Scoring & Analytical Storage — "Intelligence Layer"

**Goal:** Every OCSF finding is enriched (MITRE ATT&CK, GeoIP, threat intel), scored by XGBoost (TP/FP + confidence), stored in ClickHouse for analytics, and entity relationships written to Neo4j.

**Duration estimate:** 3–4 weeks

**Complexity: XL**

#### Deliverables

| # | Deliverable | File(s) | Complexity |
|---|------------|---------|------------|
| 3.1 | Docker Compose: ClickHouse | `infra/docker-compose.eagle.yml` — add `clickhouse` (clickhouse/clickhouse-server:24.3), expose 8123 (HTTP) + 9000 (native) | S |
| 3.2 | Docker Compose: Neo4j | `infra/docker-compose.eagle.yml` — add `neo4j` (neo4j:5-community), expose 7474 (browser) + 7687 (bolt) | S |
| 3.3 | ClickHouse schema | `infra/clickhouse/init.sql` — `ocsf_events` (MergeTree, partitioned by `(tenant_id, toYYYYMM(event_time))`), `enriched_findings`, `scored_findings`, `finding_analytics` (materialized view for per-tenant/per-severity/per-hour aggregation) | M |
| 3.4 | ClickHouse client wrapper | `packages/common/clickhouse/__init__.py`, `packages/common/clickhouse/client.py` (~150 LOC — async `clickhouse-connect` wrapper, batch insert, query builder with tenant filter injection), `packages/common/clickhouse/health.py` (~40 LOC) | M |
| 3.5 | Neo4j client wrapper | `packages/common/neo4j/__init__.py`, `packages/common/neo4j/client.py` (~180 LOC — async driver wrapper, upsert node, upsert relationship, traversal queries with tenant filter), `packages/common/neo4j/health.py` (~40 LOC) | M |
| 3.6 | MITRE ATT&CK enricher | `apps/eagle_enrichment/enrichers/mitre_enricher.py` (~180 LOC — loads MITRE ATT&CK STIX bundle, maps finding indicators to tactics/techniques, caches in Redis with 24h TTL) | M |
| 3.7 | GeoIP enricher | `apps/eagle_enrichment/enrichers/geoip_enricher.py` (~120 LOC — MaxMind GeoLite2 database lookup, adds country/city/ASN to IP observables, cached in Redis) | S |
| 3.8 | Threat intel enricher | `apps/eagle_enrichment/enrichers/threat_intel_enricher.py` (~200 LOC — polls configured STIX/TAXII feeds + custom CSV feeds, matches IOCs against finding observables, adds threat context. Split: `threat_intel_feed_poller.py` ~150 LOC for async feed synchronization) | L |
| 3.9 | Entity extractor | `apps/eagle_enrichment/enrichers/entity_extractor.py` (~200 LOC — extracts IP, domain, user, host, hash entities from OCSF finding fields, produces `entity.graph.v1` messages with relationship types) | M |
| 3.10 | Enrichment service orchestrator | `apps/eagle_enrichment/main.py` (~80 LOC), `apps/eagle_enrichment/consumer.py` (~220 LOC — `EnrichmentConsumer(BaseConsumer)`: chains enrichers in order: MITRE → GeoIP → threat intel → entity extraction. Produces to `enriched.findings.v1` + `entity.graph.v1`). Split: `apps/eagle_enrichment/enricher_chain.py` ~100 LOC for chain orchestration. | L |
| 3.11 | XGBoost feature engineering | `apps/eagle_ml_scorer/features/feature_extractor.py` (~250 LOC — extracts numeric/categorical features from enriched findings: severity, MITRE tactic, source reputation, time-of-day, geo risk, historical TP rate for source. Split: `feature_definitions.py` ~80 LOC for feature schema) | L |
| 3.12 | XGBoost training pipeline | `apps/eagle_retrainer/training/train.py` (~220 LOC — loads labeled data from ClickHouse, trains XGBoost classifier, computes SHAP values, validates on holdout, saves model artifact. Split: `validation.py` ~120 LOC for model validation metrics + threshold tuning) | L |
| 3.13 | XGBoost inference service | `apps/eagle_ml_scorer/main.py` (~80 LOC), `apps/eagle_ml_scorer/consumer.py` (~200 LOC — `ScoringConsumer(BaseConsumer)`: loads model, extracts features, runs inference, attaches score + confidence + feature importance to finding, produces to `scored.findings.v1`), `apps/eagle_ml_scorer/model_loader.py` (~100 LOC — hot-reload via arq watch task) | L |
| 3.13a | Heuristic fallback scorer | `apps/eagle_ml_scorer/scoring/heuristic_scorer.py` (~180 LOC — `HeuristicScorer`: deterministic rule-based scoring used when ML model is unavailable (cold start, model load failure, circuit breaker open). Rules: severity mapping (CRITICAL→0.9, HIGH→0.7, MEDIUM→0.4, LOW→0.2), MITRE tactic boost (+0.15 for T1078/T1059/T1486), off-hours boost (+0.05), known-bad-IP boost (+0.10). Returns `ScoredFinding` with `score_method: "heuristic"` flag. Split: `heuristic_rules.py` ~80 LOC for rule definitions as dataclasses, configurable per-tenant via Postgres). `apps/eagle_ml_scorer/scoring/scorer_factory.py` (~60 LOC — `ScorerFactory`: returns `XGBoostScorer` or `HeuristicScorer` based on model availability + circuit breaker state). **UI transparency requirement:** `score_method` field propagates through `scored.findings.v1` → ClickHouse → API response → SOC UI. The SOC UI renders a "ML" badge (blue) vs "Rule" badge (amber) on every scored finding, never presenting heuristic scores as ML predictions. | M |
| 3.14 | ML inference REST endpoint | `apps/eagle_ml_scorer/api/v1/endpoints/score.py` (~80 LOC — POST endpoint for ad-hoc scoring, used by SOC UI for manual finding evaluation. Returns `score_method` in response.) | S |
| 3.14a | ML explanation REST endpoint | `apps/eagle_api/api/v1/endpoints/explanations.py` (~100 LOC — `POST /api/v1/findings/{id}/explain`: returns SHAP-based explanation always; optional `?deep=true` triggers Flan-T5 explanation from `eagle_ai_summarizer`), `apps/eagle_api/services/explanation_service.py` (~150 LOC — SHAP template renderer + async proxy to summarizer service) | M |
| 3.15 | ClickHouse sink service | `apps/eagle_sink_clickhouse/main.py` (~80 LOC), `apps/eagle_sink_clickhouse/consumer.py` (~220 LOC — `ClickHouseSinkConsumer(BaseConsumer)`: multi-topic consumer, batches inserts (1000 rows or 5s window), handles backpressure. Split: `batch_manager.py` ~100 LOC for batch accumulation + flush logic) | M |
| 3.16 | Neo4j graph writer service | `apps/eagle_sink_neo4j/main.py` (~80 LOC), `apps/eagle_sink_neo4j/consumer.py` (~200 LOC — `Neo4jSinkConsumer(BaseConsumer)`: reads entity graph messages, upserts nodes + relationships with MERGE semantics, tenant-scoped) | M |
| 3.17 | Threat intel feed management API | `apps/eagle_api/api/v1/endpoints/threat_intel.py` (~120 LOC — CRUD for threat intel feed configs), `apps/eagle_api/services/threat_intel_service.py` (~150 LOC — feed validation, sync trigger, status monitoring) | M |
| 3.18 | ML model registry API | `apps/eagle_api/api/v1/endpoints/ml_models.py` (~150 LOC — list models, view versions, promote version, view training metrics), `apps/eagle_api/services/ml_model_service.py` (~180 LOC — model lifecycle, version comparison, rollback) | M |
| 3.19 | Entity graph query API | `apps/eagle_api/api/v1/endpoints/entities.py` (~150 LOC — entity lookup, neighbor traversal, path finding between entities), `apps/eagle_api/services/entity_service.py` (~180 LOC — Neo4j query builder, hop-limited traversal, result pagination) | M |
| 3.20 | Analytics API | `apps/eagle_api/api/v1/endpoints/analytics.py` (~200 LOC — findings-over-time, severity distribution, top MITRE techniques, per-connector metrics, TP/FP rates. Split: `analytics_queries.py` ~150 LOC for ClickHouse query builders), `apps/eagle_api/services/analytics_service.py` (~200 LOC. Split: `analytics_aggregation_service.py` ~120 LOC) | L |
| 3.21 | Seed data: pre-trained XGBoost model | `ml-models/xgboost_v1.json` — trained on synthetic SOC data to provide day-1 scoring capability | M |
| 3.22 | Integration tests: enrichment pipeline | `tests/integration/test_enrichment_pipeline.py` (~200 LOC), `tests/integration/test_ml_scoring.py` (~150 LOC), `tests/integration/test_clickhouse_sink.py` (~150 LOC), `tests/integration/test_neo4j_sink.py` (~150 LOC) | L |

#### Acceptance Criteria

- [ ] ClickHouse running, OCSF events queryable with sub-second response for time-range aggregations
- [ ] Neo4j running, entity nodes + relationships visible in Neo4j Browser
- [ ] Enrichment pipeline: OCSF finding in → enriched finding out with MITRE tactics, GeoIP data, threat intel matches
- [ ] Entity extraction: finding with IP + user + host → 3 entity nodes + 3 relationships in Neo4j
- [ ] XGBoost scoring: enriched finding → scored finding with confidence ∈ [0,1], classification (TP/FP), top 5 feature importances
- [ ] P95 inference latency <100ms (measured via structured logging timestamps)
- [ ] ClickHouse sink: batch insert verified, no data loss under backpressure (consumer pauses, resumes)
- [ ] Analytics API: returns findings-over-time chart data, severity distribution, top MITRE techniques — all tenant-scoped
- [ ] Entity graph API: "show me 2-hop neighbors of IP 10.0.0.5" returns correct subgraph
- [ ] Model hot-reload: upload new model version → scorer loads it within 60s without restart
- [ ] 40+ new tests pass

---

### Phase 4: Correlation Engine & AI Summarization — "Making Sense of Chaos"

**Goal:** Scored findings are automatically grouped into incidents by configurable correlation strategies. Each incident receives an AI-generated title and summary. Case management records are auto-created.

**Duration estimate:** 2–3 weeks

**Complexity: L**

#### Deliverables

| # | Deliverable | File(s) | Complexity |
|---|------------|---------|------------|
| 4.1 | Correlation strategy framework | `apps/eagle_correlator/strategies/__init__.py`, `apps/eagle_correlator/strategies/base_strategy.py` (~80 LOC — ABC: `should_correlate(finding, window_state) → bool`, `get_group_key(finding) → str`), `apps/eagle_correlator/strategies/time_window_strategy.py` (~120 LOC — group by configurable time window), `apps/eagle_correlator/strategies/entity_group_strategy.py` (~150 LOC — group by shared entities: same source IP, same target host, same user), `apps/eagle_correlator/strategies/priority_threshold_strategy.py` (~100 LOC — group findings above severity/confidence threshold) | L |
| 4.2 | Correlation window manager | `apps/eagle_correlator/window_manager.py` (~200 LOC — Redis-backed sliding window state. Tracks active correlation windows per tenant per strategy. Window lifecycle: open → accumulating → closed → incident_created. Split: `window_state.py` ~80 LOC for Redis state serialization) | M |
| 4.3 | Correlation engine consumer | `apps/eagle_correlator/main.py` (~80 LOC), `apps/eagle_correlator/consumer.py` (~250 LOC — `CorrelationConsumer(BaseConsumer)`: reads scored findings, evaluates against active strategies, manages windows, creates incidents when windows close. Split: `incident_creator.py` ~120 LOC for incident record creation + Kafka production) | L |
| 4.4 | Correlation rule management API | `apps/eagle_api/api/v1/endpoints/correlation_rules.py` (~150 LOC — CRUD for correlation rules per tenant), `apps/eagle_api/services/correlation_rule_service.py` (~150 LOC — validation, strategy type verification, conflict detection) | M |
| 4.5 | DistilBART summarizer service | `apps/eagle_ai_summarizer/main.py` (~80 LOC), `apps/eagle_ai_summarizer/consumer.py` (~200 LOC — `SummarizerConsumer(BaseConsumer)`: reads incidents, aggregates finding descriptions, runs DistilBART inference for title + summary, produces `incidents.updates.v1`), `apps/eagle_ai_summarizer/model.py` (~150 LOC — model loading, tokenization, generation with length constraints: title ≤120 chars, summary ≤500 chars) | L |
| 4.6 | DistilBART Dockerfile | `Dockerfile.eagle-ai-summarizer` — multi-stage: download model at build time, torch CPU-only, ~2.5GB image | M |
| 4.7 | Incident auto-creation service | `apps/eagle_api/services/incident_service.py` (~250 LOC — create incident from correlation output, link alerts, set initial status, trigger summary generation. Split: `incident_lifecycle_service.py` ~150 LOC for status transitions: NEW → INVESTIGATING → RESOLVED → CLOSED → REOPENED) | M |
| 4.8 | Incident API endpoints | `apps/eagle_api/api/v1/endpoints/incidents.py` (~200 LOC — list, get, update status, assign, merge, escalate, add comment. Split: `incident_actions.py` ~120 LOC for bulk operations), `apps/eagle_api/api/v1/endpoints/incident_alerts.py` (~100 LOC — list alerts for incident, add/remove alerts) | M |
| 4.9 | Investigation API endpoints | `apps/eagle_api/api/v1/endpoints/investigations.py` (~180 LOC — CRUD, link incidents, assign analyst, track timeline), `apps/eagle_api/services/investigation_service.py` (~200 LOC — lifecycle, auto-link related incidents by shared entities) | M |
| 4.10 | Task and evidence API | `apps/eagle_api/api/v1/endpoints/tasks.py` (~120 LOC), `apps/eagle_api/api/v1/endpoints/evidence.py` (~150 LOC — upload with `EncryptedJSON` storage, chain of custody tracking), `apps/eagle_api/services/task_service.py` (~120 LOC), `apps/eagle_api/services/evidence_service.py` (~150 LOC) | M |
| 4.11 | Eagle audit log: before/after diffs | `apps/eagle_api/services/audit_service.py` (~180 LOC — wraps all mutation operations, captures before/after state as JSON diff, produces to `audit.events.v1` Kafka topic + writes to `eagle_audit_logs` table) | M |
| 4.12 | Audit log Kafka consumer | `apps/eagle_api/workers/audit_consumer.py` (~120 LOC — `AuditConsumer(BaseConsumer)`: reads `audit.events.v1`, batch-inserts to `eagle_audit_logs` table) | S |
| 4.13 | Integration tests: correlation + summarization | `tests/integration/test_correlation_engine.py` (~200 LOC), `tests/integration/test_ai_summarizer.py` (~150 LOC), `tests/integration/test_incident_lifecycle.py` (~200 LOC) | L |

#### Acceptance Criteria

- [ ] Correlation engine: 5 scored findings from same source IP within 10min window → 1 incident created with all 5 alerts linked
- [ ] Time window strategy: window closes after configurable timeout → incident produced to `incidents.v1`
- [ ] Entity group strategy: findings sharing 2+ entities grouped into same incident
- [ ] Priority threshold strategy: only findings with confidence > 0.7 and severity ≥ HIGH trigger correlation
- [ ] DistilBART generates title ≤120 chars and summary ≤500 chars for each incident
- [ ] Generated titles are specific and actionable (not generic "Security Incident #123")
- [ ] Investigation lifecycle: create → assign analyst → link incidents → add tasks → add evidence → resolve
- [ ] Evidence upload: files stored with `EncryptedJSON` metadata, chain of custody audit trail
- [ ] Audit log: every mutation (incident status change, assignment, comment) captured with before/after diff
- [ ] Correlation rules: CRUD via API, per-tenant, validated (can't create conflicting windows)
- [ ] 30+ new tests pass

---

### Phase 5: SOC UI, Admin UI & Real-Time — "The Analyst's Cockpit"

**Goal:** Fully functional SOC analyst interface with real-time findings feed, investigation management, entity graph visualization. Admin UI for connector and pipeline management, Kafka monitoring, model registry. WebSocket-driven live updates.

**Duration estimate:** 4–5 weeks

**Complexity: XL**

#### Deliverables

| # | Deliverable | File(s) | Complexity |
|---|------------|---------|------------|
| **SOC UI Foundation** | | | |
| 5.1 | SOC UI Next.js app scaffold | `apps/eagle-soc-ui/` — `package.json`, `next.config.ts`, `tsconfig.json` (path aliases: `@/atoms/*`, `@/molecules/*`, `@/organisms/*`, `@/templates/*`, `@/lib/*`, `@/contexts/*`), `tailwind.config.ts` (CSS variable theme), `postcss.config.mjs` | S |
| 5.2 | CSS variable theme | `apps/eagle-soc-ui/src/styles/globals.css` — SOC-specific CSS variables: `--severity-critical`, `--severity-high`, `--severity-medium`, `--severity-low`, `--severity-info`, `--status-new`, `--status-investigating`, `--status-resolved`, `--brand-primary`, `--brand-secondary`, `--bg-primary`, `--bg-secondary`, `--text-primary`, `--text-muted`. Dark mode by default (SOC analysts work in dark rooms). | S |
| 5.3 | Shared atoms | `packages/eagle-ui-shared/src/atoms/`: `SeverityBadge.tsx` (forwardRef, CSS vars), `StatusDot.tsx` (forwardRef), `ConfidenceBar.tsx` (forwardRef), `ActionButton.tsx` (forwardRef), `SearchInput.tsx` (forwardRef), `TimeAgo.tsx`, `EntityChip.tsx` (forwardRef). Each ≤80 LOC. All extend HTML element attributes. | M |
| 5.4 | SOC molecules | `apps/eagle-soc-ui/src/components/molecules/`: `FindingRow.tsx` (~100 LOC — severity badge + title + source + time + confidence bar + triage actions), `AlertRow.tsx` (~80 LOC), `FilterBar.tsx` (~120 LOC — severity, status, connector, date range, MITRE tactic filters), `QuickActions.tsx` (~80 LOC — keyboard-triggered action palette), `IncidentSummaryCard.tsx` (~100 LOC), `EntityLink.tsx` (~60 LOC) | M |
| 5.5 | SOC organisms: Findings table | `apps/eagle-soc-ui/src/components/organisms/findings/FindingsTable.tsx` (~250 LOC — virtualized table with sorting, filtering, bulk selection, inline triage actions. Split: `FindingsTableHeader.tsx` ~80 LOC, `FindingsTableRow.tsx` ~100 LOC) | L |
| 5.6 | SOC organisms: Investigation panel | `apps/eagle-soc-ui/src/components/organisms/investigations/InvestigationPanel.tsx` (~250 LOC — timeline view, linked incidents, tasks, evidence, comments. Split: `InvestigationTimeline.tsx` ~120 LOC, `InvestigationActions.tsx` ~80 LOC) | L |
| 5.7 | SOC organisms: Entity graph | `apps/eagle-soc-ui/src/components/organisms/graph/EntityGraph.tsx` (~280 LOC — d3-force graph visualization, node types with distinct colors via CSS vars, click-to-expand, hover details. Split: `EntityGraphCanvas.tsx` ~150 LOC for d3 rendering, `EntityGraphControls.tsx` ~80 LOC for zoom/filter/layout controls) | XL |
| 5.8 | SOC organisms: Incident detail | `apps/eagle-soc-ui/src/components/organisms/incidents/IncidentDetail.tsx` (~250 LOC — AI-generated title/summary, linked alerts, timeline, status transitions, analyst assignment. Split: `IncidentAlertList.tsx` ~100 LOC, `IncidentStatusBar.tsx` ~80 LOC) | L |
| 5.9 | SOC organisms: Correlation view | `apps/eagle-soc-ui/src/components/organisms/correlation/CorrelationView.tsx` (~200 LOC — visualize how findings were grouped into incidents, show correlation strategy applied, shared entities highlighted) | M |
| 5.10 | SOC templates | `apps/eagle-soc-ui/src/components/templates/SOCLayout.tsx` (~150 LOC — sidebar nav + top bar + main content area + notification panel), `TriageLayout.tsx` (~80 LOC — split pane: findings list + detail panel), `InvestigationLayout.tsx` (~80 LOC) | M |
| 5.11 | SOC pages | `apps/eagle-soc-ui/src/app/`: `page.tsx` (dashboard — key metrics, active incidents, recent findings), `findings/page.tsx` (triage-live view), `findings/[id]/page.tsx` (finding detail), `incidents/page.tsx` (incident list), `incidents/[id]/page.tsx` (incident detail), `investigations/page.tsx`, `investigations/[id]/page.tsx`, `entities/page.tsx` (entity search), `entities/[id]/page.tsx` (entity graph view), `analytics/page.tsx` (charts/dashboards) | L |
| **Real-Time** | | | |
| 5.12 | WebSocket endpoint | `apps/eagle_api/api/v1/endpoints/ws.py` (~150 LOC — JWT auth via query param, Redis pub/sub subscription per tenant, message routing to connected clients. Split: `ws_auth.py` ~60 LOC for WebSocket-specific JWT validation) | M |
| 5.13 | WebSocket broadcaster (Kafka → Redis) | `apps/eagle_api/workers/ws_broadcaster.py` (~150 LOC — `WebSocketBroadcaster(BaseConsumer)`: reads `incidents.v1`, `incidents.updates.v1`, `scored.findings.v1` → publishes to Redis pub/sub channels per tenant) | M |
| 5.14 | WebSocket context (frontend) | `packages/eagle-ui-shared/src/contexts/WebSocketContext.tsx` (~140 LOC — connection management, auto-reconnect, message parsing, subscription API. Max 150 LOC per hook rule respected.) | M |
| 5.15 | Real-time hook | `apps/eagle-soc-ui/src/lib/hooks/useWebSocket.ts` (~100 LOC — subscribe to finding/incident updates, merge into React Query cache for seamless real-time + REST hybrid) | M |
| **Repositories & Hooks** | | | |
| 5.16 | API repositories | `apps/eagle-soc-ui/src/lib/api/repositories/`: `FindingRepository.ts` (~120 LOC), `IncidentRepository.ts` (~120 LOC), `InvestigationRepository.ts` (~100 LOC), `EntityRepository.ts` (~80 LOC), `AnalyticsRepository.ts` (~100 LOC), `DispositionRepository.ts` (~60 LOC). All extend `BaseRepository`. No raw `fetch()`. | M |
| 5.17 | Domain hooks | `apps/eagle-soc-ui/src/lib/hooks/`: `useFindings.ts` (~100 LOC — React Query wrapper for findings with pagination, filtering, real-time merge), `useIncidents.ts` (~100 LOC), `useInvestigations.ts` (~80 LOC), `useEntityGraph.ts` (~120 LOC — fetches neighbors, manages expansion state), `useTriage.ts` (~100 LOC — bulk triage actions, disposition submission), `useKeyboardShortcuts.ts` (~120 LOC — configurable keybindings for triage actions, navigation) | M |
| 5.18 | Auth + Tenant contexts | `apps/eagle-soc-ui/src/contexts/AuthContext.tsx` (~130 LOC — JWT management, role-based UI rendering), `packages/eagle-ui-shared/src/contexts/TenantContext.tsx` (~80 LOC — current tenant, X-Tenant-ID header injection) | M |
| **Admin UI** | | | |
| 5.19 | Admin UI Next.js app scaffold | `apps/eagle-admin-ui/` — same structure as SOC UI, shares `packages/eagle-ui-shared/` | S |
| 5.20 | Admin organisms: Connector wizard | `apps/eagle-admin-ui/src/components/organisms/connectors/ConnectorWizard.tsx` (~280 LOC — multi-step form: select type → configure connection → test → set mapping template → deploy. Split: `ConnectorTypeSelector.tsx` ~80 LOC, `ConnectorConfigForm.tsx` ~120 LOC, `ConnectorTestStep.tsx` ~80 LOC) | L |
| 5.21 | Admin organisms: Pipeline builder | `apps/eagle-admin-ui/src/components/organisms/pipelines/PipelineBuilder.tsx` (~250 LOC — visual pipeline editor: drag stages, configure each stage, deploy/pause controls. Split: `PipelineStageCard.tsx` ~80 LOC, `PipelineCanvas.tsx` ~120 LOC) | L |
| 5.22 | Admin organisms: Kafka monitor | `apps/eagle-admin-ui/src/components/organisms/kafka/KafkaMonitor.tsx` (~200 LOC — topic list, consumer group lag, message rates, DLQ counts. Data from Kafka admin API proxied through Eagle API.) | M |
| 5.23 | Admin organisms: Model registry | `apps/eagle-admin-ui/src/components/organisms/ml/ModelRegistryTable.tsx` (~180 LOC — model versions, training metrics comparison, promote/rollback actions) | M |
| 5.24 | Admin organisms: Tenant manager | `apps/eagle-admin-ui/src/components/organisms/tenants/TenantManager.tsx` (~200 LOC — tenant list, usage stats, create/edit/suspend tenant, RBAC role assignment) | M |
| 5.25 | Admin pages | `apps/eagle-admin-ui/src/app/`: `page.tsx` (system dashboard), `connectors/page.tsx`, `connectors/new/page.tsx`, `pipelines/page.tsx`, `pipelines/[id]/page.tsx`, `kafka/page.tsx`, `models/page.tsx`, `tenants/page.tsx`, `tenants/[id]/page.tsx`, `audit/page.tsx` | M |
| 5.26 | Admin API repositories | `apps/eagle-admin-ui/src/lib/api/repositories/`: `ConnectorAdminRepository.ts`, `PipelineRepository.ts`, `KafkaAdminRepository.ts`, `ModelRegistryRepository.ts`, `TenantAdminRepository.ts`. All extend `BaseRepository`. | M |
| **Kafka Admin Proxy** | | | |
| 5.27 | Kafka admin API endpoints | `apps/eagle_api/api/v1/endpoints/kafka_admin.py` (~180 LOC — topic list + stats, consumer group lag, DLQ message peek/replay, topic message count), `apps/eagle_api/services/kafka_admin_service.py` (~200 LOC — aiokafka admin client wrapper, lag calculation, DLQ replay producer) | M |
| **Tests** | | | |
| 5.28 | Frontend tests: SOC UI | `apps/eagle-soc-ui/__tests__/`: `hooks/useFindings.test.ts`, `hooks/useWebSocket.test.ts`, `contexts/AuthContext.test.tsx`, `api/FindingRepository.test.ts`. Vitest + React Testing Library. | L |
| 5.29 | Frontend tests: Admin UI | `apps/eagle-admin-ui/__tests__/`: `organisms/ConnectorWizard.test.tsx`, `organisms/PipelineBuilder.test.tsx`. | M |
| 5.30 | Integration tests: WebSocket | `tests/integration/test_websocket.py` (~150 LOC — connect, authenticate, subscribe, receive real-time incident update) | M |

#### Acceptance Criteria

- [ ] SOC UI: Analyst can view live findings feed, sort by severity/confidence, filter by MITRE tactic
- [ ] SOC UI: Click finding → detail view with full OCSF data, MITRE mapping, GeoIP data, ML score + feature importance
- [ ] SOC UI: Triage actions: mark TP/FP, assign to investigation, create incident — all via keyboard shortcuts
- [ ] SOC UI: Entity graph: click IP entity → see all connected hosts, users, domains, findings within configurable hops
- [ ] SOC UI: Incident view shows AI-generated title/summary, linked alerts, timeline of status changes
- [ ] SOC UI: Real-time updates via WebSocket — new finding appears in table without page refresh (< 2s latency)
- [ ] Admin UI: Create new Splunk ES connector via wizard, test connection, deploy — connector starts producing findings
- [ ] Admin UI: Pipeline builder shows all stages (ingest → normalize → enrich → score → correlate), can pause/resume
- [ ] Admin UI: Kafka monitor shows topic message rates, consumer group lag, DLQ message count
- [ ] Admin UI: Model registry shows model versions with accuracy/precision/recall, can promote new version
- [ ] Admin UI: Tenant management with RBAC role assignment (SUPER_ADMIN only)
- [ ] All CSS uses CSS variables via Tailwind arbitrary values — zero hardcoded colors
- [ ] All atoms use `forwardRef` where wrapping HTML elements
- [ ] No raw `fetch()` — all API calls via repository classes
- [ ] All hooks ≤150 LOC, all files ≤300 LOC
- [ ] 50+ new frontend tests pass, 10+ new backend integration tests pass

---

### Phase 6: Feedback Loop, MoE, Replay & Hardening — "Production Grade"

**Goal:** Analyst feedback drives ML retraining. Mixture of Experts routes findings to specialist models. Pipeline replay enables debugging and reprocessing. Drift detection monitors model quality. Performance testing validates throughput targets. The complete system is production-hardened.

**Duration estimate:** 3–4 weeks

**Complexity: XL**

#### Deliverables

| # | Deliverable | File(s) | Complexity |
|---|------------|---------|------------|
| **Feedback Loop** | | | |
| 6.1 | Disposition submission flow | `apps/eagle_api/api/v1/endpoints/dispositions.py` (~120 LOC — submit TP/FP disposition with confidence, rationale, MITRE correction), `apps/eagle_api/services/disposition_service.py` (~150 LOC — validate, persist, produce to `feedback.dispositions.v1`, update finding label in ClickHouse) | M |
| 6.2 | Feedback accumulator | `apps/eagle_retrainer/feedback/accumulator.py` (~180 LOC — `FeedbackConsumer(BaseConsumer)`: reads dispositions, stores labeled examples in `training_datasets` Postgres table, tracks dataset size per tenant, triggers retraining when threshold reached) | M |
| 6.3 | Automated retraining pipeline | `apps/eagle_retrainer/training/retrain_pipeline.py` (~250 LOC — arq job: pull labeled data, merge with historical, split train/validate/test, train XGBoost, compute metrics, validate against minimum thresholds, package model artifact. Split: `retrain_validation.py` ~120 LOC for automated quality gates: AUC-ROC > 0.85, precision > 0.80, recall > 0.75) | L |
| 6.4 | Model promotion workflow | `apps/eagle_retrainer/training/promotion.py` (~150 LOC — shadow scoring: run new model alongside production for N hours, compare metrics, auto-promote if better, alert if degraded. Produces model version status updates to `audit.events.v1`) | M |
| 6.5 | Retraining API | `apps/eagle_api/api/v1/endpoints/retraining.py` (~120 LOC — trigger manual retrain, view training history, compare model versions, approve/reject promotion) | S |
| **Mixture of Experts** | | | |
| 6.6 | Expert registry model | `packages/eagle/models/moe_config.py` (~120 LOC — `ExpertRegistry`: maps event categories (network, endpoint, identity, cloud) to specialist model versions. `MoERoutingRule`: defines routing logic, confidence thresholds, fallback behavior.) | S |
| 6.7 | MoE router service | `apps/eagle_moe_router/main.py` (~80 LOC), `apps/eagle_moe_router/router.py` (~250 LOC — `MoERouter`: classifies incoming finding by event type, loads appropriate specialist model, runs inference, applies confidence weighting. Falls back to generalist model when specialist confidence < threshold. Split: `expert_loader.py` ~100 LOC for multi-model memory management, LRU eviction when memory constrained) | L |
| 6.8 | MoE consumer | `apps/eagle_moe_router/consumer.py` (~200 LOC — `MoEConsumer(BaseConsumer)`: replaces direct scoring consumer in Phase 6 deployment. Reads `enriched.findings.v1`, routes through MoE, produces to `scored.findings.v1`) | M |
| 6.9 | Specialist model training | `apps/eagle_retrainer/training/specialist_trainer.py` (~200 LOC — trains event-type-specific XGBoost models using filtered training data. Split: `specialist_feature_extractor.py` ~120 LOC for type-specific features: network findings get packet-level features, endpoint findings get process-tree features) | L |
| 6.10 | MoE management API | `apps/eagle_api/api/v1/endpoints/moe.py` (~150 LOC — expert registry CRUD, routing rule management, per-expert performance dashboards), `apps/eagle_api/services/moe_service.py` (~180 LOC — routing rule validation, expert performance tracking, A/B comparison between MoE and generalist) | M |
| **Drift Detection & ML Observability** | | | |
| 6.11 | Drift detection service | `apps/eagle_retrainer/monitoring/drift_detector.py` (~200 LOC — monitors feature distributions over sliding windows, detects data drift (PSI > 0.2), concept drift (accuracy drop > 5%), alerts via `audit.events.v1`. Split: `drift_metrics.py` ~100 LOC for PSI, KL divergence, JS divergence calculations) | L |
| 6.12 | ML observability dashboard data | `apps/eagle_api/api/v1/endpoints/ml_observability.py` (~180 LOC — model performance over time, feature drift charts, prediction distribution, confidence calibration curves), `apps/eagle_api/services/ml_observability_service.py` (~200 LOC — ClickHouse aggregation queries for ML metrics over time windows) | M |
| **Pipeline Replay** | | | |
| 6.13 | Replay engine | `apps/eagle_api/services/replay_service.py` (~250 LOC — replay any pipeline stage: re-read from Kafka topic with offset range, re-process through specified stage, write to output topic with `replay: true` flag. Supports: re-normalize (re-apply updated mapping template), re-enrich (updated MITRE/threat intel), re-score (new model version). Split: `replay_orchestrator.py` ~120 LOC for multi-stage replay coordination) | L |
| 6.14 | Replay API | `apps/eagle_api/api/v1/endpoints/replay.py` (~150 LOC — create replay job with stage + offset range + target topic, monitor progress, cancel), `apps/eagle_api/workers/replay_worker.py` (~200 LOC — arq job: executes replay by consuming specified offset range, re-processing, re-producing) | M |
| 6.15 | Replay UI (Admin) | `apps/eagle-admin-ui/src/components/organisms/replay/ReplayPanel.tsx` (~200 LOC — select pipeline stage, time range, preview affected events, launch replay, monitor progress) | M |
| **Hardening** | | | |
| 6.16 | Performance test suite | `tests/performance/test_throughput.py` (~200 LOC — locust or custom: produce 10,000 findings/day sustained, measure end-to-end latency from raw ingestion to SOC UI display, verify P95 <5s pipeline latency, P95 <100ms ML scoring) | L |
| 6.17 | Chaos resilience tests | `tests/integration/test_resilience.py` (~200 LOC — Kafka broker restart mid-processing: verify no data loss. ClickHouse down: verify Kafka consumer pauses and resumes. Neo4j down: verify enrichment continues without graph writes, buffers for retry.) | L |
| 6.18 | Security hardening | `apps/eagle_api/middleware/tenant_isolation.py` (~100 LOC — defense-in-depth middleware: verify tenant_id in JWT matches tenant_id in request path/body), `infra/postgres/rls_policies.sql` (~100 LOC — Row-Level Security policies for all Eagle tables) | M |
| 6.19 | Rate limiting: per-tenant | Update `apps/eagle_api/main.py` rate limit config — add per-tenant rate limits (configurable per tenant tier) | S |
| 6.20 | Monitoring + alerting config | `infra/monitoring/`: Prometheus scrape configs for all services, Grafana dashboards (Kafka lag, ML latency, ClickHouse query times, finding throughput, incident creation rate), alerting rules (consumer lag > 10K, ML P95 > 200ms, DLQ growth) | M |
| 6.21 | Production Docker Compose | `docker-compose.production.yml` — all 14 services with resource limits, health checks, restart policies, volume mounts for model artifacts + GeoIP databases | M |
| 6.22 | CI/CD pipeline | `.github/workflows/eagle.yml` — lint + typecheck + unit tests + integration tests (docker-compose up + pytest) + build all Docker images + push to registry | M |
| 6.23 | Documentation | `docs/eagle/`: `architecture.md`, `deployment.md`, `connector-development-guide.md`, `api-reference.md` (auto-generated from OpenAPI), `runbook.md` (operational procedures) | M |
| 6.24 | Final integration tests | `tests/e2e/test_full_pipeline.py` (~300 LOC — end-to-end: create tenant → configure connector → ingest finding → normalize → enrich → score → correlate → create incident → AI summary → display in SOC UI → analyst disposition → feedback to retraining pipeline. Split into 2 files at 150 LOC each.) | L |

#### Acceptance Criteria

- [ ] Feedback loop: analyst marks finding as FP → disposition stored → appears in retraining dataset → model retrains with new label
- [ ] Automated retraining: dataset reaches threshold → arq job trains new model → validates against quality gates → shadow scoring → auto-promote if metrics improve
- [ ] Model rollback: promoted model degrades → automatic rollback to previous version within 1 hour
- [ ] MoE: network finding routes to network specialist, endpoint finding routes to endpoint specialist, unknown type routes to generalist
- [ ] MoE performance: specialist models outperform generalist on their domain (measured via A/B comparison)
- [ ] Drift detection: inject drifted data → PSI alert fires within detection window → retraining triggered
- [ ] ML observability: dashboards show prediction distribution, confidence calibration, feature importance drift over time
- [ ] Pipeline replay: re-score 24h of findings with new model version → new scores written to ClickHouse → comparison report generated
- [ ] Throughput: 10,000+ findings/day sustained for 24h, zero data loss, P95 pipeline latency <5s
- [ ] Resilience: Kafka broker restart → no data loss, consumers resume within 30s
- [ ] Resilience: ClickHouse restart → sink consumer buffers in Kafka, catches up within 5 minutes
- [ ] Tenant isolation: Tenant A's API token cannot access Tenant B's data (verified via automated test)
- [ ] RLS policies active on all Eagle Postgres tables
- [ ] All services start via `docker-compose.production.yml`, all health checks pass
- [ ] CI pipeline: green on all checks, Docker images built and pushed
- [ ] Full E2E test passes: finding ingestion → SOC UI display in <10s
- [ ] 40+ new tests pass, total test count >200

---

## 4. Proposed Directory Tree

```
cireta/
├── apps/
│   ├── api/                              # Existing Cireta RWA API (unchanged)
│   ├── admin/                            # Existing Cireta admin frontend (unchanged)
│   ├── launchpad/                        # Existing Cireta launchpad frontend (unchanged)
│   │
│   ├── eagle_api/                        # Eagle Core API (snake_case Python package)
│   │   ├── __init__.py
│   │   ├── main.py                       # FastAPI app, middleware stack (CORSMiddleware → RateLimitMiddleware → SecurityHeadersMiddleware → LoggingMiddleware)
│   │   ├── core/
│   │   │   └── config.py                 # EagleAPIConfig (app-specific overrides)
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── __init__.py
│   │   │       ├── router.py
│   │   │       └── endpoints/
│   │   │           ├── health.py
│   │   │           ├── connectors.py
│   │   │           ├── mapping_templates.py
│   │   │           ├── pipelines.py
│   │   │           ├── findings.py
│   │   │           ├── incidents.py
│   │   │           ├── incident_actions.py
│   │   │           ├── incident_alerts.py
│   │   │           ├── investigations.py
│   │   │           ├── tasks.py
│   │   │           ├── evidence.py
│   │   │           ├── dispositions.py
│   │   │           ├── entities.py
│   │   │           ├── analytics.py
│   │   │           ├── correlation_rules.py
│   │   │           ├── ml_models.py
│   │   │           ├── ml_observability.py
│   │   │           ├── moe.py
│   │   │           ├── retraining.py
│   │   │           ├── replay.py
│   │   │           ├── threat_intel.py
│   │   │           ├── kafka_admin.py
│   │   │           ├── ws.py
│   │   │           └── ws_auth.py
│   │   ├── services/
│   │   │   ├── connector_service.py
│   │   │   ├── mapping_template_service.py
│   │   │   ├── mapping_template_validation_service.py
│   │   │   ├── pipeline_service.py
│   │   │   ├── incident_service.py
│   │   │   ├── incident_lifecycle_service.py
│   │   │   ├── investigation_service.py
│   │   │   ├── task_service.py
│   │   │   ├── evidence_service.py
│   │   │   ├── disposition_service.py
│   │   │   ├── entity_service.py
│   │   │   ├── analytics_service.py
│   │   │   ├── analytics_aggregation_service.py
│   │   │   ├── analytics_queries.py
│   │   │   ├── correlation_rule_service.py
│   │   │   ├── ml_model_service.py
│   │   │   ├── ml_observability_service.py
│   │   │   ├── moe_service.py
│   │   │   ├── threat_intel_service.py
│   │   │   ├── kafka_admin_service.py
│   │   │   ├── replay_service.py
│   │   │   ├── replay_orchestrator.py
│   │   │   └── audit_service.py
│   │   ├── middleware/
│   │   │   └── tenant_isolation.py
│   │   └── workers/
│   │       ├── audit_consumer.py
│   │       ├── ws_broadcaster.py
│   │       └── replay_worker.py
│   │
│   ├── eagle_normalizer/                 # OCSF Normalization Service
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── consumer.py
│   │   └── dedup.py
│   │
│   ├── eagle_enrichment/                 # Enrichment Service
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── consumer.py
│   │   ├── enricher_chain.py
│   │   └── enrichers/
│   │       ├── __init__.py
│   │       ├── mitre_enricher.py
│   │       ├── geoip_enricher.py
│   │       ├── threat_intel_enricher.py
│   │       ├── threat_intel_feed_poller.py
│   │       └── entity_extractor.py
│   │
│   ├── eagle_ml_scorer/                  # ML Scoring Service
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── consumer.py
│   │   ├── model_loader.py
│   │   ├── api/
│   │   │   └── v1/
│   │   │       └── endpoints/
│   │   │           └── score.py
│   │   └── features/
│   │       ├── feature_extractor.py
│   │       └── feature_definitions.py
│   │
│   ├── eagle_correlator/                 # Correlation Engine
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── consumer.py
│   │   ├── incident_creator.py
│   │   ├── window_manager.py
│   │   ├── window_state.py
│   │   └── strategies/
│   │       ├── __init__.py
│   │       ├── base_strategy.py
│   │       ├── time_window_strategy.py
│   │       ├── entity_group_strategy.py
│   │       └── priority_threshold_strategy.py
│   │
│   ├── eagle_ai_summarizer/              # DistilBART Summarizer
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── consumer.py
│   │   └── model.py
│   │
│   ├── eagle_connector_splunk/           # Splunk ES Connector (reference)
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── connector.py
│   │   ├── splunk_client.py
│   │   └── schemas.py
│   │
│   ├── eagle_sink_clickhouse/            # ClickHouse Sink
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── consumer.py
│   │   └── batch_manager.py
│   │
│   ├── eagle_sink_neo4j/                 # Neo4j Graph Writer
│   │   ├── __init__.py
│   │   ├── main.py
│   │   └── consumer.py
│   │
│   ├── eagle_retrainer/                  # ML Retraining Pipeline
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── feedback/
│   │   │   └── accumulator.py
│   │   ├── training/
│   │   │   ├── train.py
│   │   │   ├── validation.py
│   │   │   ├── retrain_pipeline.py
│   │   │   ├── retrain_validation.py
│   │   │   ├── promotion.py
│   │   │   ├── specialist_trainer.py
│   │   │   └── specialist_feature_extractor.py
│   │   └── monitoring/
│   │       ├── drift_detector.py
│   │       └── drift_metrics.py
│   │
│   ├── eagle_moe_router/                 # Mixture of Experts Router
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── consumer.py
│   │   ├── router.py
│   │   └── expert_loader.py
│   │
│   ├── eagle-soc-ui/                     # SOC Analyst Frontend (kebab-case directory)
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── vitest.config.ts
│   │   ├── __tests__/
│   │   │   ├── setup.ts
│   │   │   ├── hooks/
│   │   │   │   ├── useFindings.test.ts
│   │   │   │   └── useWebSocket.test.ts
│   │   │   ├── contexts/
│   │   │   │   └── AuthContext.test.tsx
│   │   │   └── api/
│   │   │       └── FindingRepository.test.ts
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx                        # Dashboard
│   │       │   ├── findings/
│   │       │   │   ├── page.tsx                    # Triage-live view
│   │       │   │   └── [id]/
│   │       │   │       └── page.tsx                # Finding detail
│   │       │   ├── incidents/
│   │       │   │   ├── page.tsx
│   │       │   │   └── [id]/
│   │       │   │       └── page.tsx
│   │       │   ├── investigations/
│   │       │   │   ├── page.tsx
│   │       │   │   └── [id]/
│   │       │   │       └── page.tsx
│   │       │   ├── entities/
│   │       │   │   ├── page.tsx                    # Entity search
│   │       │   │   └── [id]/
│   │       │   │       └── page.tsx                # Entity graph view
│   │       │   └── analytics/
│   │       │       └── page.tsx
│   │       ├── components/
│   │       │   ├── atoms/                          # Imports from eagle-ui-shared + local
│   │       │   ├── molecules/
│   │       │   │   ├── cards/
│   │       │   │   │   ├── FindingRow.tsx
│   │       │   │   │   ├── AlertRow.tsx
│   │       │   │   │   └── IncidentSummaryCard.tsx
│   │       │   │   ├── filters/
│   │       │   │   │   └── FilterBar.tsx
│   │       │   │   ├── actions/
│   │       │   │   │   └── QuickActions.tsx
│   │       │   │   └── links/
│   │       │   │       └── EntityLink.tsx
│   │       │   ├── organisms/
│   │       │   │   ├── findings/
│   │       │   │   │   ├── FindingsTable.tsx
│   │       │   │   │   ├── FindingsTableHeader.tsx
│   │       │   │   │   └── FindingsTableRow.tsx
│   │       │   │   ├── investigations/
│   │       │   │   │   ├── InvestigationPanel.tsx
│   │       │   │   │   ├── InvestigationTimeline.tsx
│   │       │   │   │   └── InvestigationActions.tsx
│   │       │   │   ├── incidents/
│   │       │   │   │   ├── IncidentDetail.tsx
│   │       │   │   │   ├── IncidentAlertList.tsx
│   │       │   │   │   └── IncidentStatusBar.tsx
│   │       │   │   ├── graph/
│   │       │   │   │   ├── EntityGraph.tsx
│   │       │   │   │   ├── EntityGraphCanvas.tsx
│   │       │   │   │   └── EntityGraphControls.tsx
│   │       │   │   └── correlation/
│   │       │   │       └── CorrelationView.tsx
│   │       │   └── templates/
│   │       │       ├── SOCLayout.tsx
│   │       │       ├── TriageLayout.tsx
│   │       │       └── InvestigationLayout.tsx
│   │       ├── contexts/
│   │       │   ├── AuthContext.tsx
│   │       │   └── KeyboardShortcutContext.tsx
│   │       ├── lib/
│   │       │   ├── api/
│   │       │   │   └── repositories/
│   │       │   │       ├── FindingRepository.ts
│   │       │   │       ├── IncidentRepository.ts
│   │       │   │       ├── InvestigationRepository.ts
│   │       │   │       ├── EntityRepository.ts
│   │       │   │       ├── AnalyticsRepository.ts
│   │       │   │       └── DispositionRepository.ts
│   │       │   ├── hooks/
│   │       │   │   ├── useFindings.ts
│   │       │   │   ├── useIncidents.ts
│   │       │   │   ├── useInvestigations.ts
│   │       │   │   ├── useEntityGraph.ts
│   │       │   │   ├── useTriage.ts
│   │       │   │   ├── useKeyboardShortcuts.ts
│   │       │   │   └── useWebSocket.ts
│   │       │   ├── types/
│   │       │   │   ├── finding.ts
│   │       │   │   ├── incident.ts
│   │       │   │   ├── investigation.ts
│   │       │   │   ├── entity.ts
│   │       │   │   └── analytics.ts
│   │       │   └── utils/
│   │       │       └── severity.ts
│   │       └── styles/
│   │           └── globals.css
│   │
│   └── eagle-admin-ui/                   # Admin Frontend (kebab-case directory)
│       ├── package.json
│       ├── next.config.ts
│       ├── tsconfig.json
│       ├── tailwind.config.ts
│       ├── postcss.config.mjs
│       ├── vitest.config.ts
│       ├── __tests__/
│       │   └── organisms/
│       │       ├── ConnectorWizard.test.tsx
│       │       └── PipelineBuilder.test.tsx
│       └── src/
│           ├── app/
│           │   ├── layout.tsx
│           │   ├── page.tsx                        # System dashboard
│           │   ├── connectors/
│           │   │   ├── page.tsx
│           │   │   └── new/
│           │   │       └── page.tsx
│           │   ├── pipelines/
│           │   │   ├── page.tsx
│           │   │   └── [id]/
│           │   │       └── page.tsx
│           │   ├── kafka/
│           │   │   └── page.tsx
│           │   ├── models/
│           │   │   └── page.tsx
│           │   ├── tenants/
│           │   │   ├── page.tsx
│           │   │   └── [id]/
│           │   │       └── page.tsx
│           │   ├── audit/
│           │   │   └── page.tsx
│           │   └── replay/
│           │       └── page.tsx
│           ├── components/
│           │   ├── organisms/
│           │   │   ├── connectors/
│           │   │   │   ├── ConnectorWizard.tsx
│           │   │   │   ├── ConnectorTypeSelector.tsx
│           │   │   │   ├── ConnectorConfigForm.tsx
│           │   │   │   └── ConnectorTestStep.tsx
│           │   │   ├── pipelines/
│           │   │   │   ├── PipelineBuilder.tsx
│           │   │   │   ├── PipelineStageCard.tsx
│           │   │   │   └── PipelineCanvas.tsx
│           │   │   ├── kafka/
│           │   │   │   └── KafkaMonitor.tsx
│           │   │   ├── ml/
│           │   │   │   └── ModelRegistryTable.tsx
│           │   │   ├── tenants/
│           │   │   │   └── TenantManager.tsx
│           │   │   └── replay/
│           │   │       └── ReplayPanel.tsx
│           │   └── templates/
│           │       └── AdminLayout.tsx
│           ├── contexts/
│           │   └── AuthContext.tsx
│           └── lib/
│               ├── api/
│               │   └── repositories/
│               │       ├── ConnectorAdminRepository.ts
│               │       ├── PipelineRepository.ts
│               │       ├── KafkaAdminRepository.ts
│               │       ├── ModelRegistryRepository.ts
│               │       └── TenantAdminRepository.ts
│               └── hooks/
│                   ├── useConnectors.ts
│                   ├── usePipelines.ts
│                   └── useKafkaMetrics.ts
│
├── packages/
│   ├── common/                           # Existing shared code (extended)
│   │   ├── config/
│   │   │   └── defaults.py              # Add Eagle defaults
│   │   ├── core/
│   │   │   ├── config.py               # Unchanged
│   │   │   ├── logging.py              # Unchanged
│   │   │   ├── auth_deps.py            # Extended: get_current_eagle_user, EagleCurrentUser
│   │   │   ├── service_deps.py         # Extended: all Eagle service factories
│   │   │   └── cache.py                # Unchanged
│   │   ├── db/
│   │   │   ├── base.py                 # Unchanged
│   │   │   ├── session.py              # Unchanged
│   │   │   └── repository.py           # Unchanged
│   │   ├── kafka/                       # NEW — Kafka base classes
│   │   │   ├── __init__.py
│   │   │   ├── base_producer.py
│   │   │   ├── base_consumer.py
│   │   │   ├── dlq.py
│   │   │   ├── serialization.py
│   │   │   ├── health.py
│   │   │   ├── config.py
│   │   │   └── topics.py
│   │   ├── clickhouse/                  # NEW — ClickHouse client
│   │   │   ├── __init__.py
│   │   │   ├── client.py
│   │   │   └── health.py
│   │   ├── neo4j/                       # NEW — Neo4j client
│   │   │   ├── __init__.py
│   │   │   ├── client.py
│   │   │   └── health.py
│   │   ├── ocsf/                        # NEW — OCSF schema package
│   │   │   ├── __init__.py
│   │   │   ├── schema.py
│   │   │   ├── schema_detection.py
│   │   │   ├── schema_vulnerability.py
│   │   │   ├── validator.py
│   │   │   ├── mapper.py
│   │   │   ├── constants.py
│   │   │   └── default_mappings/
│   │   │       └── splunk_es.json
│   │   ├── models/
│   │   │   ├── base.py                 # Unchanged
│   │   │   ├── encrypted_types.py      # Unchanged
│   │   │   └── user.py                 # Unchanged
│   │   ├── services/
│   │   │   ├── base_service.py         # Unchanged
│   │   │   └── auth_service.py         # Unchanged
│   │   └── ... (remaining unchanged)
│   │
│   ├── eagle/                           # NEW — Eagle domain package
│   │   ├── __init__.py
│   │   ├── config.py                    # EagleSettings(Settings)
│   │   ├── enums.py
│   │   ├── constants.py
│   │   ├── exceptions.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── tenant.py               # Tenant, TenantBaseModel
│   │   │   ├── connector.py            # Connector, ConnectorConfig
│   │   │   ├── mapping_template.py
│   │   │   ├── pipeline.py             # Pipeline, PipelineStage
│   │   │   ├── finding.py
│   │   │   ├── investigation.py
│   │   │   ├── incident.py             # Incident, IncidentAlert
│   │   │   ├── task.py
│   │   │   ├── evidence.py
│   │   │   ├── comment.py
│   │   │   ├── disposition.py
│   │   │   ├── correlation_rule.py
│   │   │   ├── ml_model.py             # MLModel, MLModelVersion
│   │   │   ├── threat_intel_feed.py
│   │   │   ├── moe_config.py           # ExpertRegistry, MoERoutingRule
│   │   │   └── eagle_audit_log.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── finding.py
│   │   │   ├── investigation.py
│   │   │   ├── incident.py
│   │   │   ├── connector.py
│   │   │   ├── pipeline.py
│   │   │   ├── disposition.py
│   │   │   ├── ml_model.py
│   │   │   └── analytics.py
│   │   ├── repositories/
│   │   │   └── tenant_repository.py    # TenantRepository(Repository[T])
│   │   └── connectors/
│   │       ├── __init__.py
│   │       ├── base_connector.py
│   │       ├── connector_registry.py
│   │       └── isolation.py
│   │
│   └── eagle-ui-shared/                 # NEW — Shared frontend components (kebab-case dir)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── atoms/
│           │   ├── badges/
│           │   │   └── SeverityBadge.tsx
│           │   ├── buttons/
│           │   │   └── ActionButton.tsx
│           │   ├── indicators/
│           │   │   └── StatusDot.tsx
│           │   └── inputs/
│           │       └── SearchInput.tsx
│           ├── molecules/
│           │   ├── cards/
│           │   │   └── FindingCard.tsx
│           │   └── filters/
│           │       └── FilterBar.tsx
│           ├── lib/
│           │   ├── api/
│           │   │   ├── config/
│           │   │   │   └── endpoints.ts
│           │   │   ├── errors.ts
│           │   │   └── repositories/
│           │   │       └── base/
│           │   │           └── BaseRepository.ts
│           │   ├── types/
│           │   │   ├── finding.ts
│           │   │   ├── incident.ts
│           │   │   ├── investigation.ts
│           │   │   └── connector.ts
│           │   └── utils/
│           │       ├── cn.ts
│           │       └── severity.ts
│           └── contexts/
│               ├── TenantContext.tsx
│               └── WebSocketContext.tsx
│
├── infra/
│   ├── docker-compose.eagle.yml         # Eagle infrastructure services
│   ├── clickhouse/
│   │   └── init.sql                     # ClickHouse schema
│   ├── postgres/
│   │   └── rls_policies.sql             # Row-Level Security
│   ├── monitoring/
│   │   ├── prometheus.yml
│   │   └── grafana/
│   │       └── dashboards/
│   │           ├── kafka.json
│   │           ├── ml.json
│   │           └── pipeline.json
│   └── alembic/
│       └── versions/
│           └── 004_eagle_initial_schema.py
│
├── ml-models/
│   └── xgboost_v1.json                  # Seed model
│
├── tests/
│   ├── unit/
│   │   ├── test_ocsf_mapper.py
│   │   ├── test_kafka_serialization.py
│   │   ├── test_tenant_repository.py
│   │   ├── test_feature_extractor.py
│   │   └── test_correlation_strategies.py
│   ├── integration/
│   │   ├── test_kafka_producer_consumer.py
│   │   ├── test_eagle_models.py
│   │   ├── test_ingestion_pipeline.py
│   │   ├── test_enrichment_pipeline.py
│   │   ├── test_ml_scoring.py
│   │   ├── test_clickhouse_sink.py
│   │   ├── test_neo4j_sink.py
│   │   ├── test_correlation_engine.py
│   │   ├── test_ai_summarizer.py
│   │   ├── test_incident_lifecycle.py
│   │   ├── test_websocket.py
│   │   └── test_resilience.py
│   ├── e2e/
│   │   ├── test_full_pipeline_ingestion.py
│   │   └── test_full_pipeline_feedback.py
│   └── performance/
│       └── test_throughput.py
│
├── docs/
│   └── eagle/
│       ├── architecture.md
│       ├── deployment.md
│       ├── connector-development-guide.md
│       ├── api-reference.md
│       └── runbook.md
│
├── docker-compose.production.yml
├── Dockerfile.eagle-api
├── Dockerfile.eagle-normalizer
├── Dockerfile.eagle-enrichment
├── Dockerfile.eagle-ml-scorer
├── Dockerfile.eagle-correlator
├── Dockerfile.eagle-ai-summarizer
├── Dockerfile.eagle-connector-splunk
├── Dockerfile.eagle-sink-clickhouse
├── Dockerfile.eagle-sink-neo4j
├── Dockerfile.eagle-retrainer
├── Dockerfile.eagle-moe-router
├── Dockerfile.eagle-soc-ui
├── Dockerfile.eagle-admin-ui
│
└── .github/
    └── workflows/
        └── eagle.yml
```

**File count:** ~180 new Python files, ~120 new TypeScript files, ~15 config/infra files. Total: ~315 new files.

**LOC estimate:** ~35,000–45,000 lines of production code across all phases.

---

## 5. Top 6 Risks & Mitigations

### Risk 1: ClickHouse Query Performance at Scale

**Risk:** ClickHouse is optimized for batch inserts and analytical queries, but poorly-written queries (high-cardinality GROUP BY, missing partition pruning) degrade to full table scans.

**Mitigation:** All ClickHouse queries in `analytics_queries.py` enforce `WHERE tenant_id = ? AND event_time BETWEEN ? AND ?` to ensure partition pruning. Query review checklist in PR template. ClickHouse query log monitoring in Grafana with alert on queries scanning >10M rows.

### Risk 2: Kafka Consumer Lag Cascading

**Risk:** If the enrichment service falls behind (e.g., MITRE lookup slowdown), consumer lag cascades: scored findings delayed → correlation windows misfire → stale incidents → analyst distrust.

**Mitigation:** Per-stage consumer lag monitoring with alerts at 1K, 5K, 10K message thresholds. Each consumer has independent scaling (horizontal via consumer group). Circuit breaker on external enrichment calls (MITRE, GeoIP, threat intel) — degrade gracefully by skipping enrichment rather than blocking the pipeline. DLQ with automatic retry for transient failures.

### Risk 3: DistilBART Resource Consumption

**Risk:** DistilBART on CPU requires ~1.5GB RAM and ~200-400ms per inference. Under burst incident creation (correlation window closing with many incidents), the summarizer could become a bottleneck.

**Mitigation:** Summarizer reads from `incidents.v1` Kafka topic — natural backpressure via consumer lag. Incidents are created at a much lower rate than raw findings (typical ratio: 100:1 to 1000:1). Even at 100 incidents/hour, CPU inference at 400ms/incident uses <5% of capacity. The real risk is memory — DistilBART holds ~700MB in RAM. Container memory limit set to 3GB with OOM monitoring.

### Risk 4: Multi-Tenant Data Leakage

**Risk:** A bug in query construction or Kafka routing exposes Tenant A's security data to Tenant B. In SOC context, this is a career-ending security breach.

**Mitigation:** Defense in depth: (1) `TenantRepository` auto-filters at ORM level — every query has `WHERE tenant_id = ?` by default; (2) Postgres RLS policies as database-level enforcement — even raw SQL can't cross tenant boundaries; (3) Kafka messages keyed by `tenant_id` — consumer-side validation rejects messages with mismatched tenant; (4) API middleware verifies JWT `tenant_id` matches request path/body; (5) Automated integration tests attempt cross-tenant access in every test suite. Five independent barriers.

### Risk 5: XGBoost Cold Start Quality

**Risk:** Day-1 XGBoost model trained on synthetic data may produce unreliable scores, causing analyst distrust before real feedback accumulates.

**Mitigation:** Seed model ships with clearly labeled confidence calibration: scores include a `model_maturity` field (`seed` | `early` | `production`). SOC UI displays maturity indicator — analysts understand the model improves with their feedback. Retraining threshold set low for initial period (100 labeled examples triggers first retrain). Feature importance always shown alongside scores — even if the score is wrong, the reasoning is transparent.

### Risk 6: Schema Evolution Across Kafka Topics

**Risk:** As OCSF schema evolves or new enrichment fields are added, consumers reading old-format messages from Kafka break with deserialization errors.

**Mitigation:** Every Kafka message includes `schema_version` in the envelope. Consumers implement version-aware deserialization with backward compatibility (old versions handled, missing new fields defaulted). Schema changes require a new minor version (`1.0` → `1.1`); breaking changes require a new major version with new topic (`v2` suffix). DLQ catches any deserialization failures for manual review.

---

## 6. Open Decisions for Jawad

### Decision 1: Tenant Billing Model

The multi-tenant system tracks per-tenant event counts, storage usage, and API calls. **Do tenants get billed per-event, per-seat, or flat tier?** This affects quota enforcement logic in Phase 1 (tenant model needs `plan_tier` or `event_quota` fields) and rate limiting strategy.

### Decision 2: Additional Connector Priorities

Phase 2 delivers Splunk ES as the reference connector. **Which connectors should follow?** Top candidates: CrowdStrike Falcon, Microsoft Sentinel, Palo Alto Cortex XDR, AWS Security Hub, Elastic SIEM, generic syslog (RFC 5424), generic REST/webhook, STIX/TAXII 2.1 poll, CSV import. Each connector is ~500 LOC following the `BaseConnector` pattern. Prioritize by target customer base.

### Decision 3: Deployment Target

The plan assumes Docker Compose for development and single-node staging. **Production deployment:** Kubernetes (EKS/GKE) or Docker Swarm? Kubernetes is the right choice for a system with 14 services that need independent scaling, health checks, and rolling updates — but it adds operational complexity. This affects Dockerfile design, service discovery, and config management (Helm charts vs docker-compose).

### Decision 4: GeoIP Database License

MaxMind GeoLite2 is free but requires account registration and has accuracy limitations. **MaxMind GeoIP2 (paid, ~$180/yr) provides better accuracy.** For an enterprise SOC product, the paid tier is table stakes. Confirm we're using GeoIP2 from day 1.

### Decision 5: SOC UI Real-Time Granularity

The WebSocket broadcasts all new findings and incident updates to connected analysts. At 10,000 findings/day (~7/minute), this is manageable. **Should we implement per-analyst subscription filters** (e.g., "only show me Critical/High severity for my assigned connectors") **in Phase 5, or push everything and let client-side filtering handle it?** Server-side filtering reduces bandwidth and client CPU but adds WebSocket subscription management complexity. Recommendation: client-side filtering for Phase 5, server-side subscription filters as a Phase 6 optimization if needed.

---

## 7. Simplifications & Improvements

This section evaluates every major architectural choice against a single criterion: **is there a cleaner implementation that delivers identical functionality with less operational complexity?** No features are cut. No scope is reduced.

### 7.1 MongoDB → Postgres JSONB

**What the spec says:** MongoDB for connector configuration storage and mapping template persistence.

**What we recommend:** Postgres JSONB columns on `connectors.config` and `mapping_templates.field_map`.

**Why this is architecturally superior, not a shortcut:**

MongoDB's strengths (flexible schema, document nesting, horizontal scaling) don't apply here. Connector configs and mapping templates are:
- **Relational:** They belong to tenants, reference pipelines, have lifecycle states, need audit trails. These are natural FK relationships.
- **Versioned:** Mapping templates are versioned. Postgres supports this natively with `version` columns and unique constraints.
- **Transactional:** Creating a connector + its config + linking it to a pipeline is a single transaction. MongoDB doesn't give us cross-collection transactions at the same maturity level.
- **Queryable:** "Find all connectors of type Splunk across all tenants" is a SQL WHERE clause. In MongoDB, it's an aggregation pipeline.
- **Already encrypted:** The scaffold's `EncryptedJSON` type handles encrypted JSON storage for sensitive config fields — a solved problem in the scaffold.

**What we eliminate:** One database engine (MongoDB), its connection pooling, backup strategy, monitoring, failover configuration, and driver dependency.

**What we gain:** Full SQL queryability on config data, transactional consistency with relational entities, zero new infrastructure, and the scaffold's existing `EncryptedJSON` type handles the flexible-schema-with-encryption requirement perfectly.

**Functionality deferred or eliminated:** None. Every MongoDB use case is fully served by Postgres JSONB.

### 7.2 Neo4j — Keep It, But Enter at Phase 3

**What the spec says:** Entity graph for pivoting investigations and threat hunting.

**What we build:** Full Neo4j graph database with entity nodes, relationship types, multi-hop traversal, and graph visualization in the SOC UI.

**The cleaner implementation:** Neo4j enters in Phase 3 rather than Phase 1 because no entity data exists until the enrichment service extracts entities. Adding Neo4j to docker-compose in Phase 1 means 2+ weeks of an idle database consuming resources during development. Phase 3 is when entity extraction produces data — that's when Neo4j earns its place.

**Why Neo4j over Postgres adjacency tables:** The core graph queries in SOC workflows are multi-hop traversals: "find all entities within 3 hops of this compromised IP, filtered by time window and relationship type." In Postgres, this requires recursive CTEs with JOIN explosion — O(n^k) where k is hop depth. In Neo4j, this is a native index-free adjacency traversal — O(n) regardless of graph size. For an entity graph with millions of nodes (accumulated over months of SOC operation), this is not a theoretical difference. It's the difference between a 50ms response and a 30-second timeout.

**Functionality deferred or eliminated:** None. Full graph capability ships.

### 7.3 ClickHouse — Keep It, Enter at Phase 3

**What the spec says:** ClickHouse for analytical storage of normalized events and scored findings.

**What we build:** Full ClickHouse deployment with MergeTree tables partitioned by `(tenant_id, toYYYYMM(event_time))`, materialized views for real-time aggregation, and a dedicated sink service for batch insertion.

**The cleaner implementation:** Phases 1–2 use Kafka topics as the primary event store (7-day retention on `raw.findings.v1`, 30-day on `ocsf.findings.v1`). Integration tests in Phases 1–2 validate against Kafka messages directly, not a database. ClickHouse comes online in Phase 3 when:
1. The full event schema is stable (after normalization + enrichment are proven)
2. Analytical queries are actually needed (analytics API is Phase 3)
3. The ClickHouse schema can be designed with confidence (we know what fields exist)

Designing ClickHouse tables before the enrichment pipeline is built means guessing at the schema. Designing them after means getting it right.

**Functionality deferred or eliminated:** None. Full ClickHouse analytical capability ships.

### 7.4 DistilBART — Self-Hosted Is Correct

**What the spec says:** Self-hosted DistilBART for incident summarization. No raw security events to third-party LLMs.

**What we build:** Exactly that. A containerized FastAPI service with `transformers` + `torch` (CPU) + `distilbart-cnn-12-6`.

**Why self-hosted is the right call, not an over-engineering:**

Enterprise SOC customers have data sovereignty requirements that are non-negotiable. Security findings contain IOCs, internal hostnames, IP addresses, user accounts, vulnerability details — sending this to any external API (even with PII stripping) is a compliance violation for most SOC teams. "We strip the PII" is not an acceptable answer when the raw finding contains `internal-dc-03.acme.corp connected to known C2 at 185.220.101.42` — the entire finding IS sensitive data.

**GPU strategy:** CPU inference at ~400ms per incident is acceptable. DistilBART-CNN-12-6 is a 300M parameter model — not a 70B LLM. CPU is fine. If GPU is available, the service auto-detects CUDA and drops to ~30ms. No GPU required for production deployment.

**Docker image size:** ~2.5GB is large but not problematic for a dedicated service container. The model is baked in at build time — no runtime downloads, no model registry dependency, no cold start latency.

**Functionality deferred or eliminated:** None.

### 7.5 Kafka Topology — Right-Sized, Not Over-Simplified

**What the spec implies:** Complex multi-partition, multi-topic architecture.

**What we build:** 10 topics with deliberate partitioning and clear data flow.

**The cleaner pattern:** The topic count is right. Each topic represents a distinct schema and processing stage — collapsing topics would mean consumers parsing mixed message types, which is an anti-pattern. The partition counts are set for production growth:

| Load Level | Partition Strategy |
|-----------|-------------------|
| Dev/Staging | 1 partition per topic (simpler debugging, ordered reads) |
| Production (<50K events/day) | 3 partitions per topic |
| Production (>50K events/day) | 12 partitions per topic |

The `infra/docker-compose.eagle.yml` uses single partitions. The `docker-compose.production.yml` uses the full partition count. Topic creation is handled at startup by a Kafka admin client in each service's lifespan, with partition count from `EagleSettings`.

**What we simplify:** No Confluent Schema Registry for the initial build. JSON serialization with `schema_version` in the envelope provides schema evolution without the operational overhead of a registry. Schema Registry can be added when we have >5 connector types producing different raw formats — that's the point where centralized schema management pays for itself.

**Functionality deferred or eliminated:** None. Schema Registry deferred as infrastructure, not as capability — schema versioning is still enforced via envelope format.

### 7.6 Mixture of Experts — Full Build, Correct Phasing

**What the spec says:** MoE system with specialist models routed by event type.

**What we build:** Complete MoE system in Phase 6 with expert registry, routing rules, specialist training pipeline, confidence-weighted ensemble, and generalist fallback.

**Why Phase 6 is correct, not deferred:** MoE requires:
1. A working generalist model (Phase 3)
2. Sufficient labeled data per event category (accumulated during Phases 3–5 via analyst feedback)
3. The retraining pipeline (Phase 6 prerequisite)
4. Proven feature extraction that can be specialized per event type (built in Phase 3, specialized in Phase 6)

Building MoE before having enough labeled data per category produces specialist models that are worse than the generalist — because they train on smaller datasets without the regularization benefit of cross-category data. Phase 6 is when the training data exists to make specialists genuinely better.

**The clean architecture:** The `eagle_moe_router` is a drop-in replacement for `eagle_ml_scorer` as the consumer of `enriched.findings.v1`. Both produce to `scored.findings.v1`. The swap is a deployment configuration change — update which service runs, not a code change in downstream consumers. This is the Kafka decoupling pattern working as designed.

**Functionality deferred or eliminated:** None. Full MoE ships.

### 7.7 Connector Isolation — Docker Containers, Not Python Venvs

**What the spec says:** Isolated Python virtual environments per connector.

**What we build:** Each connector type runs as a separate Docker container — its own `apps/eagle_connector_*` service with its own `Dockerfile.eagle-connector-*`.

**Why Docker isolation is superior to venv isolation:**

Python venvs isolate dependencies but share the process, kernel, network, and filesystem. A malicious or buggy connector in a shared process can:
- Read memory of other connectors (same process space)
- Open arbitrary network connections (same network namespace)
- Exhaust CPU/memory without limits (same cgroup)
- Crash the entire connector host (unhandled exception in shared event loop)

Docker containers provide:
- **Memory isolation:** `--memory=512m` per container
- **CPU isolation:** `--cpus=0.5` per container
- **Network isolation:** `--network=eagle-connector-net` with firewall rules (only Kafka + target API)
- **Filesystem isolation:** `--read-only --tmpfs /tmp`
- **Crash isolation:** container restarts don't affect other connectors
- **Capability restriction:** `--cap-drop=ALL --no-new-privileges`

The `BaseConnector` ABC in `packages/eagle/connectors/base_connector.py` defines the plugin interface. Each connector implementation is a self-contained FastAPI app that inherits from `BaseConnector` and `BaseProducer`. Same clean plugin pattern, stronger isolation.

**Functionality deferred or eliminated:** None. Isolation is stronger, not weaker.

### 7.8 WebSocket — FastAPI Native, Redis Pub/Sub Fan-Out

**What the spec says:** Real-time push to SOC analysts.

**What we build:** FastAPI's built-in WebSocket endpoint + Redis pub/sub for multi-worker fan-out.

**Why this is the right architecture:**

A separate WebSocket service (e.g., Socket.IO, custom Go service) adds a deployment unit, a network hop, and an API boundary — all to solve a problem that FastAPI handles natively. The actual challenge isn't WebSocket connections (FastAPI handles thousands per worker). The challenge is fan-out: when a Kafka consumer receives a new incident, all connected WebSocket clients for that tenant need to receive it, even if they're connected to different uvicorn workers.

Redis pub/sub solves this cleanly:
1. Kafka consumer (`ws_broadcaster.py`) publishes to Redis channel `tenant:{tid}:events`
2. Each uvicorn worker subscribes to Redis channels for its connected tenants
3. Worker receives Redis message → pushes to all local WebSocket clients for that tenant

This scales to thousands of concurrent connections across multiple workers without any custom infrastructure. If we ever need >10,000 concurrent WebSocket connections, we add uvicorn workers — not a new service.

**Functionality deferred or eliminated:** None. Full real-time capability ships.

---

*This plan delivers a complete, production-grade SOC platform across 6 phases. Every feature from the specification is accounted for. Every service follows the cireta scaffold rules exactly. Every file stays under 300 LOC. Every hook stays under 150 LOC. Every atom uses forwardRef. Every color uses CSS variables. Every database query goes through a repository. Every service is injected via Depends(). No shortcuts. No scope cuts. Build it right, build it once.*