# Distributed Task Processing Platform — Project State

> **Single Source of Truth** — Last updated: 2026-07-13

## 1. Project Overview
**Project Name:** Distributed Task Processing Platform

**Problem Statement:**
Modern applications often need to perform long-running tasks such as AI inference, PDF generation, video processing, and data analysis. Executing these tasks directly within an HTTP request can lead to timeouts, poor user experience, and inefficient resource utilization. 

**Overall Architecture:**
This platform allows applications to submit tasks asynchronously, process them in the background using distributed workers, and track progress while remaining responsive and scalable. It is built as an event-driven, queue-based, producer-consumer system where an API service produces jobs and stateless worker services pull and process them independently, orchestrated by a highly-available scheduler service.

**Major Distributed System Concepts Implemented:**
- Distributed worker architecture
- Heartbeat-based liveness detection and worker recovery
- Reliable queue pattern (RPOPLPUSH)
- Optimistic Concurrency Control (OCC) and Zombie Worker Protection
- Scheduler Leader Election using Redis
- Exponential Backoff Retry Scheduling
- Dead Letter Queue (DLQ)
- Distributed Observability (Prometheus, Grafana)

**Current Implementation Status:**
Implementation of Concurrency, Consistency, and Observability is complete. Core features including authentication, job APIs, reliable Redis queues, worker processing, recovery, OCC, leader election, and Prometheus metrics are fully operational. API Integration tests have been added using Vitest and Supertest. Application containerization (Docker) for API/Worker/Scheduler is pending.

---

## 2. Tech Stack

- **Node.js**: Runtime
- **TypeScript**: Language
- **Express**: Web Framework
- **PostgreSQL 16**: Database
- **Prisma**: ORM
- **Redis 7**: Queue / Cache / Distributed Locks
- **Prometheus**: Monitoring and Metrics
- **Grafana**: Dashboard and Visualization
- **Docker / Docker Compose**: Containerization (Postgres, Redis, Prometheus, Grafana)
- **JWT (Bearer Token)**: Authentication
- **Zod**: Request Validation
- **Vitest & Supertest**: Integration Testing

---

## 3. Repository Structure

```text
distributed-task-platform/
├── docker-compose.yml             # Postgres, Redis, Prometheus, Grafana
├── infrastructure/                # External infrastructure configurations
├── monitoring/                    # Prometheus & Grafana configurations
│   └── prometheus/prometheus.yml
├── services/
│   ├── api-service/               # User-facing REST API
│   ├── worker-service/            # Background job processor
│   └── scheduler-service/         # System coordinator
└── shared/                        # Cross-service shared code
```

### Service Responsibilities

- **`api-service`**: Owns user authentication, job submission, job listing/retrieval, cancellation, manual retry, and enqueuing jobs to Redis.
- **`worker-service`**: Owns pulling jobs from the Redis queue, executing job processors, optimistic concurrency control (preventing zombie execution), tracking worker load, emitting events, and recording results.
- **`scheduler-service`**: Owns system orchestration including retry polling, dead worker detection, leader election, worker lease recovery, and requeuing.

---

## 4. Architecture

```mermaid
flowchart TD
    Client[Client] --> API[API Service]
    API --> DB[(PostgreSQL)]
    API --> Queue[Redis Queue]
    
    Queue --> Worker[Workers]
    Worker --> DB
    Worker --> DLQ[Dead Letter Queue / DB]
    Worker --> Metrics[(Prometheus)]
    
    Scheduler[Scheduler Service] --> DB
    Scheduler -->|Requeue| Retry[Retry Queue]
    Scheduler --> Queue
    Scheduler --> Metrics
    
    API --> Metrics
    Metrics --> Grafana[Grafana Dashboard]
```

**Component Responsibilities:**
- **Client**: Submits requests (create job, check status, cancel).
- **API**: Validates input, interacts with PostgreSQL to create state, pushes `jobId` to Redis, exposes Prometheus metrics for jobs created.
- **PostgreSQL**: Single source of truth. Stores jobs, users, results, events.
- **Redis Queue**: Acts as the message broker (`main-queue`), processing queues, and distributed lock manager (leader election).
- **Workers**: Pop jobs from Redis (`main-queue` to `processing-queue`), fetch state from PostgreSQL, execute tasks, handle retries, and push to DLQ when exhausted. Emits metrics for processing times and utilization.
- **Retry Queue**: Virtual queue handled by the Scheduler which polls PostgreSQL for `RETRYING` jobs and requeues them.
- **Dead Letter Queue (DLQ)**: Final resting state for jobs that exhaust retries. Logged in the database via `FAILED` status and `JOB_DLQ` events.
- **Scheduler**: Ensures system consistency. Recovers orphaned jobs from dead workers, handles retries, and ensures only one scheduler is active via Leader Election.
- **Prometheus**: Scrapes `/metrics` endpoints from API, Worker, and Scheduler.
- **Grafana**: Visualizes Prometheus data into real-time operational dashboards.

---

## 5. Architecture Decisions

- **Integration tests run sequentially**: Because they use shared infrastructure (Postgres, Redis), `fileParallelism` is disabled in Vitest to avoid race conditions.
- **PostgreSQL and Redis are treated as real dependencies during testing**: Mocks are avoided to ensure the tests validate real data flows, constraints, and queuing behavior.
- **Job ownership is validated at the service layer**: Endpoints like cancellation, retry, and fetching explicitly enforce user ownership at the domain level before applying mutations.
- **PostgreSQL is source of truth**: All job state, metadata, and retry counts are safely persisted here.
- **Redis stores only job IDs**: Payloads aren't duplicated. The queue is strictly a transport mechanism.
- **Pull model instead of push model**: Workers actively block (`BRPOP` / `RPOPLPUSH`) and pull jobs when ready, providing natural backpressure and load balancing.
- **OCC used instead of distributed transactions**: `Job.version` increments on every state change, elegantly handling zombie workers without heavy two-phase commits.
- **Scheduler handles retries**: It polls for jobs where `status=RETRYING` and `nextRetryAt <= NOW()`, decoupling execution from retry logic.
- **Workers are stateless**: Any worker can process any job. They can be scaled horizontally and killed at will.
- **Recovery uses heartbeats + processing queue**: Scheduler checks `workers:active` heartbeat timestamps. If dead, jobs assigned to them in the Redis `processing-queue` are safely recovered.

---

## 6. Environment Variables

```env
# API_SERVICE
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/task_platform?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="super-secret-key"

# WORKER_SERVICE
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/task_platform?schema=public"
REDIS_URL="redis://localhost:6379"
WORKER_ID="worker-1" # Optional, randomly generated if omitted

# SCHEDULER_SERVICE
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/task_platform?schema=public"
REDIS_URL="redis://localhost:6379"
SCHEDULER_ID="scheduler-1" # Optional, randomly generated if omitted

# PROMETHEUS
scrape_interval=5s
```

---

## 7. Database

Entities are synchronized via identical Prisma schemas across services.

### `User`
- **Purpose**: Tracks platform users.
- **Important fields**: `id`, `email`, `passwordHash`, `role`.
- **Relationships**: `User` has many `Job`, `User` has many `Notification`.
- **Current status**: Implemented.

### `Job`
- **Purpose**: Represents a distributed task.
- **Important fields**:
  - `id`: UUID, used as queue message payload.
  - `status`: Current state (`PENDING`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `RETRYING`, `CANCELLED`).
  - `workerId`: ID of the worker processing this job. `null` when idle.
  - `version`: Incremental version number used for Optimistic Concurrency Control (OCC).
  - `retryCount`: Number of times the job has failed and been retried.
  - `nextRetryAt`: Timestamp for when the scheduler should requeue a `RETRYING` job.
  - `completedAt`: Timestamp recorded upon successful completion.
  - `progress`: Percentage of job completion (0-100).
- **Relationships**: Belongs to `User`, has one `Result`, has many `JobEvent`.
- **Current status**: Implemented (OCC fields active).

### `Result`
- **Purpose**: Stores the output of a completed job.
- **Important fields**: `jobId` (unique), `resultType`, `size`, `resultUrl`.
- **Relationships**: Belongs to one `Job`.
- **Current status**: Implemented.

### `JobEvent`
- **Purpose**: Append-only audit log for state transitions (Event Sourcing).
- **Important fields**: `jobId`, `eventType`, `workerId`, `details` (JSON).
- **Relationships**: Belongs to one `Job`.
- **Current status**: Implemented.

### `Notification`
- **Purpose**: Asynchronous alerts for users.
- **Important fields**: `userId`, `type`, `message`, `readAt`.
- **Relationships**: Belongs to `User`.
- **Current status**: Defined in schema.

---

## 8. Job State Machine

```text
PENDING
   ↓
QUEUED
   ↓
RUNNING
   ├── COMPLETED
   ├── RETRYING
   │      ↓
   │   QUEUED
   │
   └── FAILED
```

---

## 9. Queue Architecture

- **Producer**: API Service pushes `jobId` to the queue using `LPUSH main-queue <jobId>`.
- **Consumer**: Worker Service pulls from the queue using `RPOPLPUSH main-queue processing-queue`.
- **Retry Queue**: Stored virtually in PostgreSQL using `status="RETRYING"` and `nextRetryAt`. The Scheduler acts as the retry queue processor.
- **DLQ**: Handled in DB. If a worker exhausts retries, it updates status to `FAILED` and removes the job from `processing-queue`. Event `JOB_DLQ` is emitted.
- **Processing Queue**: Temporary Redis list (`processing-queue`) holding jobs currently being executed. Helps the Recovery Service detect orphaned jobs.
- **Worker Lifecycle**: 
  1. Worker registers in Redis. 
  2. Submits heartbeats every 5s. 
  3. Pulls job. 
  4. Runs OCC validation. 
  5. Completes/Fails. 
  6. If dead, Scheduler recovers its jobs from `processing-queue`.

### Redis Keys

```typescript
export const REDIS_KEYS = {
  MAIN_QUEUE: "main-queue",
  PROCESSING_QUEUE: "processing-queue",
  RETRY_QUEUE: "retry-queue", 
  DLQ: "dead-letter-queue", 
  SCHEDULER_LEADER: "scheduler_leader"
};

// Heartbeat patterns
ACTIVE_WORKERS = "workers:active"
WORKER_PREFIX = "worker:{workerId}"
```

---

## 10. Worker Service

### Current Worker Flow (Optimistic Concurrency Control)

```text
Fetch Job
    ↓
Update RUNNING (version check: where id=jobId AND version=currentVersion)
    ↓
    ├── If count === 0
    │       ↓
    │   Zombie Worker detected
    │       ↓
    │   Abort execution (Job was recovered/reassigned)
    ↓
Process Job
    ↓
Update COMPLETED (version check: where id=jobId AND version=currentVersion)
    ↓
    ├── If count === 0
    │       ↓
    │   Zombie Worker detected
    │       ↓
    │   Abort execution (Prevents duplicate writes/events)
```

- **Worker registration**: On startup, worker registers its ID in Redis (`workers:active`).
- **Heartbeats**: Emits `worker:{workerId}` every 5 seconds with capacity and load details.
- **Worker load & capacity**: Worker increments/decrements its load in Redis on job start/finish. 
- **Processing loop**: Continuous `while(true)` loop fetching jobs via `waitForJob()`.
- **Failure handling**: Wraps execution in `try/catch`. 
- **Retry handling**: If `< MAX_RETRIES`, increments `retryCount`, calculates exponential backoff for `nextRetryAt`, sets status to `RETRYING`.
- **DLQ**: If `>= MAX_RETRIES`, updates status to `FAILED`, removes from `processing-queue`, emits `JOB_DLQ`.
- **Worker recovery**: Handled by Scheduler when a worker stops emitting heartbeats.

---

## 11. Scheduler Service

### Leader Election Algorithm

```text
Acquire Leadership (Every 5 seconds if no leader):
SET scheduler_leader id EX ttl NX

Renew Leadership (Every 5 seconds if leader):
Evaluate Lua Script:
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("expire", KEYS[1], ARGV[2])
else
    return 0
end
```

- **Scheduler responsibilities**: Only the active leader executes system coordination tasks.
- **Retry polling**: Polls PostgreSQL for jobs where `status='RETRYING'` and `nextRetryAt <= NOW()`, requeues them via `LPUSH main-queue`.
- **Worker monitoring & Dead worker detection**: Periodically checks `workers:active` against fresh heartbeats. If a worker hasn't updated its heartbeat, it is marked dead.
- **Recovery flow**: Scheduler pulls all jobs assigned to dead workers in `RUNNING` status, resets them to `RETRYING` (or `QUEUED`), clears `workerId`, and drops them from the `processing-queue`.
- **Redis lock**: Prevents split-brain scheduling.

---

## 12. Distributed System Features

| Feature | Purpose | Implementation | Current Status |
|---|---|---|---|
| **Producer Consumer** | Async execution | API produces to Redis; Workers consume. | ✅ Completed |
| **Retry Queue** | Delaying failed jobs | Exponential backoff via `nextRetryAt` in DB. | ✅ Completed |
| **Dead Letter Queue** | Terminal failure storage | Status `FAILED` and `JOB_DLQ` events. | ✅ Completed |
| **Heartbeat** | Liveness tracking | Workers write JSON with TTL to Redis every 5s. | ✅ Completed |
| **Recovery / Recovery Service** | Handling worker crashes | Scheduler detects missing heartbeats and recovers orphaned jobs. | ✅ Completed |
| **Leader Election** | High availability coordination | Redis `SET NX EX` with Lua script renewal. | ✅ Completed |
| **Optimistic Concurrency Control** | Preventing data corruption | `version` field checked and incremented on every DB write. | ✅ Completed |
| **Zombie Worker Protection** | Stopping rogue nodes | Workers halt if their DB update fails (0 rows modified). | ✅ Completed |
| **Worker Load Tracking** | Autoscaling visibility | Worker current load exposed to Redis and Prometheus. | ✅ Completed |
| **Dynamic Worker Membership** | Scale up/down gracefully | `workers:active` Redis set dynamically tracks nodes. | ✅ Completed |
| **Redis TTL** | Ephemeral state | Leader lock and heartbeats expire automatically. | ✅ Completed |

---

## 13. Observability

Prometheus metrics are exposed via `/metrics` on each service using `prom-client`.

### Current Prometheus Targets

```yaml
scrape_configs:
  - job_name: "api-service"
    static_configs:
      - targets: ["host.docker.internal:5000"]

  - job_name: "worker-service"
    static_configs:
      - targets: ["host.docker.internal:3001"]

  - job_name: "scheduler-service"
    static_configs:
      - targets: ["host.docker.internal:3002"]
```

### API Service
- **`jobs_created_total`** (Counter): Total jobs created. Updated in API job submission route.

### Worker Service
- **`jobs_completed_total`** (Counter): Total successfully completed jobs. Updated upon job completion.
- **`jobs_failed_total`** (Counter): Total jobs moved to terminal failure (DLQ). Updated upon exhausting retries.
- **`jobs_retried_total`** (Counter): Total jobs that failed but were scheduled for retry.
- **`job_processing_duration_seconds`** (Histogram): Time spent executing `processJob()`. Started before execution, ended after.
- **`job_queue_wait_seconds`** (Histogram): Time jobs spend waiting in the queue (from `createdAt` to start of execution).
- **`worker_utilization_percent`** (Gauge): Current worker utilization.

### Scheduler Service
- **`scheduler_is_leader`** (Gauge): `1` if this instance is leader, `0` otherwise. Updated during leadership acquisition/renewal.
- **`queue_depth`** (Gauge): Current number of items in `main-queue`.
- **`dead_workers_total`** (Counter): Total workers detected as dead.
- **`active_workers`** (Gauge): Current number of active workers from the heartbeat registry.

---

## 14. Dashboard Status

Implemented Panels:
- **Jobs Created**: `sum(jobs_created_total)`
- **Jobs Completed**: `sum(jobs_completed_total)`
- **Jobs Failed**: `sum(jobs_failed_total)`
- **Queue Depth**: `queue_depth`
- **Scheduler Leader**: `scheduler_is_leader`
- **Jobs Completed / Minute**: `sum(rate(jobs_completed_total[1m])) * 60`
- **Average Processing Time**: `rate(job_processing_duration_seconds_sum[1m]) / rate(job_processing_duration_seconds_count[1m])`
- **P95 Processing Latency**: `histogram_quantile(0.95, sum(rate(job_processing_duration_seconds_bucket[5m])) by (le))`
- **Average Queue Wait**: `rate(job_queue_wait_seconds_sum[1m]) / rate(job_queue_wait_seconds_count[1m])`
- **P95 Queue Wait**: `histogram_quantile(0.95, sum(rate(job_queue_wait_seconds_bucket[5m])) by (le))`
- **Active Workers**: `active_workers`
- **Worker Utilization**: `avg(worker_utilization_percent)`

---

## 15. Docker

**Current Docker Setup (`docker-compose.yml`):**
- **Postgres**: `postgres:16` on port `5433` (host) / `5432` (container) with persistent volumes.
- **Redis**: `redis:7` on port `6379` with persistent volumes.
- **Prometheus**: `prom/prometheus` on port `9090`. Scrapes target configurations via bound `prometheus.yml`.
- **Grafana**: `grafana/grafana` on port `3005`.

**Networking & Application Containerization:**
Currently, infrastructure components (DB, Cache, Observability) are containerized. The `api-service`, `worker-service`, and `scheduler-service` still run locally via Node.js/TypeScript. 

**Pending:**
Creating `Dockerfile`s for the application services and adding them to the Docker Compose network so the whole stack can boot with one command.

---

## 16. Current Project Status

- Authentication ✅
- Queue ✅
- Retry Queue ✅
- DLQ ✅
- Worker Recovery ✅
- Leader Election ✅
- Optimistic Concurrency Control (OCC) ✅
- Prometheus ✅
- Grafana ✅
- Latency Metrics ✅
- Queue Wait Metrics ✅
- Worker Utilization ✅
- Active Workers ✅
- API Integration Tests ✅
- Priority Queue ❌
- Graceful Shutdown ❌
- Horizontal Scaling Demo ❌

---

## 17. Testing

Comprehensive integration tests for the API have been built using Vitest, Supertest, PostgreSQL, and Redis. The tests execute sequentially to avoid race conditions with shared infrastructure. 

Completed Suites:
- **POST /jobs**: Verifies job creation, database state persistence, Redis queue insertion, and error handling for queue outages. 
- **GET /jobs/:id**: Verifies retrieval of job metadata by ID, error handling for missing jobs, and prevents unauthorized access to other users' jobs.
- **GET /jobs**: Verifies that a user can retrieve their entire list of jobs, validates the `createdAt` descending ordering, and enforces strict user isolation.
- **POST /jobs/:jobId/cancel**: Verifies that `QUEUED` jobs can be cancelled, removes them from the Redis queue, updates database state to `CANCELLED`, and prevents invalid state transitions (e.g. cancelling a `COMPLETED` job).
- **POST /jobs/:jobId/retry**: Verifies manual retry mechanics, ensuring `FAILED` jobs transition correctly to `PENDING`, increments the `retryCount`, resets `failureReason`, and rejects unauthorized retry attempts.

### Testing Lessons Learned
- Integration tests must verify database state, not only HTTP responses. Relying solely on API responses masked a bug where the Redis queue failed but the API returned `QUEUED`.
- Parallel integration tests create race conditions when sharing PostgreSQL and Redis. For instance, global `afterEach` teardown blocks wiped data while parallel tests were executing.
- Unique test data is required for reliable execution. Identical hardcoded emails in `beforeEach` hooks caused unique constraint violations.
- Real Redis and PostgreSQL testing catches bugs that mocks cannot. Testing with the real infrastructure exposed edge cases around connection handling and state desynchronization.

---

## 18. Major Bugs Fixed

- **Redis connection missing during integration tests**: Caused the job to remain `PENDING` in the database but erroneously return `QUEUED` to the client.
- **Response state differing from database state**: The `createJob` service always returned `QUEUED` even if `enqueueJob` threw an exception, desyncing reality from the API response.
- **Unique email collisions**: Occurred during parallel test execution because multiple suites attempted to create the same user.
- **Database race conditions**: Triggered by parallel integration tests sharing a single Postgres database. Global data wiping in `afterEach` hooks caused `ForeignKeyConstraintViolation` in concurrently running suites. Fixed via `fileParallelism: false` in Vitest.
- **Redis queue verification tests exposing hidden failures**: Tests that explicitly checked Redis for the queued `jobId` revealed that jobs were not being pushed under certain error conditions.

---

## 19. Known Issues

- Queue wait graph not yet verified under high load.
- Need more production load testing.
- Need to Dockerize application services (`api-service`, `worker-service`, `scheduler-service`).

---

## 20. Current Focus

**Worker Service & Scheduler Distributed Testing:**
- Worker registration
- Heartbeat validation
- Worker monitor and Dead worker detection
- Job recovery
- End-to-end distributed workflow testing

---

## 21. Future Roadmap

1. Dockerize API/Worker/Scheduler
2. Graceful Worker Shutdown
3. Priority Queue
4. Job Cancellation (Graceful termination of running jobs)
5. Job Timeout
6. Horizontal Scaling Demo (Spawn 10 workers in compose)
7. Kubernetes Deployment (optional)
8. Distributed Tracing (OpenTelemetry)
9. CI/CD Pipeline

---

## 22. Resume Highlights

- **Testing**: Built a comprehensive integration test suite using Vitest, Supertest, PostgreSQL, and Redis. Verified distributed job lifecycle through real infrastructure testing.
- **Security**: Implemented authorization and ownership validation across all job APIs.
- **Distributed Systems**: Built an event-driven, producer-consumer task processing platform using Node.js, Express, and PostgreSQL.
- **Worker Recovery & Scalable Architecture**: Designed dynamic worker membership with heartbeat-based liveness tracking to automatically recover orphaned jobs.
- **Optimistic Concurrency Control**: Implemented version-based OCC to eliminate race conditions and prevent rogue/zombie workers from corrupting database state.
- **Leader Election**: Used Redis distributed locks with Lua script renewals to establish a highly-available scheduler control plane.
- **Observability**: Instrumented complete system metrics (processing latency, queue wait times, tail latencies) using Prometheus and Grafana.
- **Docker**: Containerized relational databases, memory caches, and monitoring stacks for reproducible deployments.

---

## 23. System Guarantees

### Guaranteed

- Jobs are durably stored in PostgreSQL before queueing.
- Worker crashes do not permanently lose jobs.
- Dead workers are automatically detected and recovered.
- Zombie workers cannot overwrite recovered jobs.
- Only one scheduler can coordinate the cluster at a time.
- Job state transitions are auditable through JobEvent.

### Not Guaranteed

- Exact-once execution.
- Global ordering of jobs.
- Distributed transactions across Redis and PostgreSQL.
- Automatic horizontal autoscaling.

### Design Tradeoffs

- Chose OCC instead of distributed transactions for simplicity and scalability.
- Chose PostgreSQL as source of truth instead of Redis persistence.
- Chose pull-based workers for natural backpressure.
- Chose Redis leader election instead of ZooKeeper/etcd due to project scope.

---

## 24. Current Scale Assumptions

**Current Tested Scale:**
- 1 API instance
- 1 Scheduler instance
- 1-3 Worker instances

**Target Scale:**
- 10+ Workers
- Thousands of queued jobs

**Current Bottlenecks:**
- Single PostgreSQL instance
- Single Redis instance
- No autoscaling

---

## 25. ChatGPT Context

**Current Implementation State:**
The project has moved past basic queue implementations into advanced consistency and observability. OCC, Leader Election, and Prometheus metrics are fully integrated. Workers protect against zombie state by validating `version` on every DB write. The Scheduler safely orchestrates retries and recoveries. A robust suite of API integration tests confirms these guarantees.

**Major Architectural Decisions:**
- PostgreSQL is the source of truth; Redis is only a fast transport/locking layer (`jobId` only in queues).
- Workers utilize `RPOPLPUSH` for reliable message delivery.
- Workers actively PULL jobs rather than having them pushed.
- All state transitions are event-sourced to `JobEvent`.
- Exact-once execution is not guaranteed, but OCC guarantees exact-once *completion* writes.
- API Integration Tests run sequentially because of shared resources.

**Coding Conventions:**
- Prisma is used for all DB interactions.
- Metrics are tracked using `prom-client` in a dedicated `metrics.ts` file per service.
- Error handling in workers emits proper DLQ / failed events upon exhausting `MAX_RETRIES`.

**Important Redis Keys:**
- `main-queue`: LPUSH/RPOPLPUSH list.
- `processing-queue`: Actively running tasks.
- `scheduler_leader`: NX EX lock.
- `workers:active`: Set of worker IDs.
- `worker:{id}`: JSON heartbeat details.

**Current Metrics & Dashboard:**
- API, Worker, and Scheduler expose `/metrics`. 
- PromQL queries heavily rely on `job_processing_duration_seconds`, `job_queue_wait_seconds`, `jobs_completed_total`, and `scheduler_is_leader`.

**Current Roadmap & Direction:**
The next immediate priority is creating integration tests for the Worker Service (heartbeat validation, worker failure recovery testing, scheduler recovery testing). Once testing is complete, the focus will shift to containerizing the node applications (API/Worker/Scheduler) via Docker.
