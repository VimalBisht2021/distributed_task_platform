# Distributed Task Processing Platform — Project State

> **Single Source of Truth** — Last updated: 2026-07-15

## 1. Project Overview

**Project Name:** Distributed Task Processing Platform

**Problem Statement:**
Modern applications often need to perform long-running tasks such as AI inference, PDF generation, video processing, and data analysis. Executing these tasks directly within an HTTP request can lead to timeouts, poor user experience, and inefficient resource utilization.

**Overall Architecture:**
This platform allows applications to submit tasks asynchronously, process them in the background using distributed workers, and track progress while remaining responsive and scalable. It is built as an event-driven, queue-based, producer-consumer system where an API service produces jobs and stateless worker services pull and process them independently, orchestrated by a highly-available scheduler service.

**Major Distributed System Concepts Implemented:**
- Distributed worker architecture with horizontal scaling
- Heartbeat-based liveness detection and worker recovery
- Reliable queue pattern (RPOPLPUSH)
- Optimistic Concurrency Control (OCC) and Zombie Worker Protection
- Scheduler Leader Election using Redis
- Exponential Backoff Retry Scheduling
- Dead Letter Queue (DLQ)
- Distributed Observability (Prometheus, Grafana)
- Real-Time Telemetry (Redis Pub/Sub → SSE)
- Multi-Tenant Authentication (JWT + RBAC)
- Graceful Worker Shutdown (SIGTERM/SIGINT drain)
- Full Operations Dashboard (Next.js 16)
- **Operations Lab & Testbed** (Dedicated TypeScript scenario orchestration)

**Current Implementation Status:**
All core distributed systems features, authentication, real-time telemetry, and the operations dashboard are fully implemented and tested. The platform is containerized via Docker Compose (8 containers) and includes a dedicated Operations Lab for real-time demonstration of fault tolerance.

---

## 2. Tech Stack

- **Node.js**: Runtime
- **TypeScript**: Language
- **Express**: Web Framework (API Service, Lab Service)
- **Next.js 16**: Frontend Framework (Dashboard)
- **Tailwind CSS 4**: Styling
- **PostgreSQL 16**: Database
- **Prisma**: ORM
- **Redis 7**: Queue / Cache / Distributed Locks / Pub/Sub
- **Prometheus**: Monitoring and Metrics
- **Grafana**: Metrics Visualization
- **Docker / Docker Compose**: Containerization (8 containers)
- **JWT (Bearer Token)**: Authentication
- **Zod**: Request Validation
- **Vitest & Supertest**: Integration Testing

---

## 3. Repository Structure

```text
distributed-task-platform/
├── docker-compose.yml             # 8-container orchestration
├── apps/
│   └── dashboard/                 # Next.js 16 Operations Console
│       └── src/
│           ├── app/               # Pages (dashboard, jobs, workers, recovery, system, login, register, lab)
│           ├── components/        # UI components (glassmorphism, sci-fi aesthetic)
│           ├── hooks/             # useSSE real-time hook
│           └── lib/               # API client, AuthContext
├── services/
│   ├── api-service/               # User-facing REST API + SSE
│   │   └── src/                   # Auth, Job tracking, Metrics, Telemetry
│   ├── worker-service/            # Background job processor
│   │   └── src/                   # Task execution, OCC validation, Heartbeats
│   ├── scheduler-service/         # Leader-elected cluster coordinator
│   │   └── src/                   # Leader election, Dead worker detection, Retry polling
│   └── lab-service/               # Test Orchestration Engine (Port 3006)
│       └── src/
│           ├── index.ts           # Lab API (POST /runs, GET /runs/:id/stream)
│           └── scenarios/         # TypeScript Scenario Engine
│               ├── priority.ts    # Priority queue testing
│               ├── recovery.ts    # Fault tolerance testing
│               ├── failover.ts    # Leader election testing
│               └── benchmark.ts   # Throughput scaling
├── shared/                        # Cross-service types + constants (LabRun)
├── monitoring/                    # Prometheus configuration
└── project_design/                # Original design documents
```

### Service Responsibilities

- **`api-service`**: Owns user authentication (register/login/JWT), job submission, job listing/retrieval, cancellation, manual retry, SSE event streaming, enqueuing jobs to Redis, and Prometheus metrics exposure.
- **`worker-service`**: Owns pulling jobs from the Redis queue, executing job processors, optimistic concurrency control (preventing zombie execution), tracking worker load/capacity, emitting lifecycle events, publishing events to Redis Pub/Sub, heartbeat emission, graceful shutdown, and result recording.
- **`scheduler-service`**: Owns system orchestration including retry polling with exponential backoff, dead worker detection via heartbeat monitoring, leader election, worker lease recovery, job requeuing, and publishing recovery events to Redis Pub/Sub.
- **`lab-service`**: Owns execution of distributed systems scenarios, tracks `LabRun` state, interacts with local Docker daemon to simulate failures (kill containers, scale workers), and streams execution logs back to the Dashboard.
- **`dashboard`**: Next.js 16 App Router frontend. Real-time operations console with SSE integration, role-based access control (Admin vs User), and an interactive Operations Lab.

---

## 4. Architecture

```mermaid
flowchart TD
    Client[Client / Dashboard] -->|REST + JWT| API[API Service<br/>Express + Auth]
    API -->|LPUSH jobId| Queue[(Redis<br/>Main Queue)]
    API -->|Persist| DB[(PostgreSQL 16<br/>Source of Truth)]
    
    Queue -->|RPOPLPUSH| W1[Worker Node 1]
    Queue -->|RPOPLPUSH| W2[Worker Node 2]
    Queue -->|RPOPLPUSH| W3[Worker Node N]
    
    W1 & W2 & W3 -->|Status + Events| DB
    W1 & W2 & W3 -->|Heartbeat| Redis[(Redis<br/>Heartbeats + Locks)]
    W1 & W2 & W3 -->|Publish| PubSub[Redis Pub/Sub]
    
    Scheduler[Scheduler Service<br/>Leader Elected] -->|Dead Worker Detection| Redis
    Scheduler -->|Retry Polling| DB
    Scheduler -->|Requeue| Queue
    Scheduler -->|Publish| PubSub
    
    PubSub -->|SSE Stream| API
    API -->|Real-Time Events| Client
    
    API & W1 & Scheduler -->|/metrics| Prom[Prometheus]
    Prom --> Grafana[Grafana]
```

**Component Responsibilities:**
- **Client / Dashboard**: Submits jobs, views status, monitors workers and recovery in real-time.
- **API Service**: Validates input, persists to PostgreSQL, pushes `jobId` to Redis, streams events via SSE, exposes Prometheus metrics.
- **PostgreSQL**: Single source of truth. Stores users, jobs, results, events, notifications.
- **Redis**: Acts as message broker (`main-queue`), processing queue, heartbeat store, distributed lock manager (leader election), and Pub/Sub channel for real-time events.
- **Workers**: Pop jobs from Redis (`main-queue` → `processing-queue`), fetch state from PostgreSQL, execute tasks, handle retries, publish events. Stateless and horizontally scalable.
- **Scheduler**: Ensures system consistency. Recovers orphaned jobs from dead workers, handles retries with exponential backoff, and ensures only one scheduler is active via Leader Election.
- **Prometheus + Grafana**: Scrapes `/metrics` endpoints from all services. Provides operational dashboards.

---

## 5. Operations Lab & Scenario Engine

The Operations Lab serves as an interactive demonstration environment to visually validate the platform's distributed resilience guarantees without manual CLI intervention. 

### Architecture

```mermaid
flowchart TD
    Dashboard["Dashboard (/lab)"] -->|POST /run/recovery| LabService["Lab Service (Port 3006)"]
    LabService -->|TypeScript Scenario Execution| Docker["Docker Daemon<br/>(Kill/Scale Containers)"]
    LabService -->|REST| API["API Service (Port 3000)"]
    
    LabService -->|"SSE /runs/:id/stream"| Dashboard
    
    API -.->|PubSub| Redis
    Redis -.->|SSE Stream| Dashboard
```

### Lab Service API
- `POST /runs` - Trigger a test (priority, recovery, failover, benchmark).
- `GET /runs/:id` - Fetch current execution status (`PENDING`, `RUNNING`, `PASS`, `FAIL`).
- `GET /runs/:id/stream` - SSE endpoint streaming real-time scenario logs and progress updates to the frontend.

### TypeScript Scenario Engine
Historically relying on Bash/WSL scripts, testing scenarios are now written in pure TypeScript (`services/lab-service/src/scenarios/`). This provides native OS cross-compatibility and cleaner error handling when orchestrating the Docker daemon and the API Service.

### Execution Tracking (`LabRun`)
Every scenario triggered generates a `LabRun` entity tracked by the `lab-service`. This tracks execution lifecycle and allows the Dashboard UI to visually separate the "Test Framework Status" from the actual raw "Cluster Telemetry."

---

## 6. Environment Variables

```env
# API_SERVICE
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/task_platform?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="super-secret-key"

# WORKER_SERVICE
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/task_platform?schema=public"
REDIS_URL="redis://localhost:6379"
WORKER_ID="worker-1" 

# SCHEDULER_SERVICE
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/task_platform?schema=public"
REDIS_URL="redis://localhost:6379"
SCHEDULER_ID="scheduler-1" 

# DASHBOARD
NEXT_PUBLIC_API_URL="http://localhost:3000"
NEXT_PUBLIC_LAB_SERVICE_URL="http://localhost:3006"

# PROMETHEUS
scrape_interval=5s
```

---

## 7. Database

Entities are synchronized via identical Prisma schemas across services.

### `User`
- **Purpose**: Tracks platform users and their roles.
- **Important fields**: `id`, `email`, `passwordHash`, `role` (USER/ADMIN), `isActive`.
- **Relationships**: `User` has many `Job`, `User` has many `Notification`.
- **Current status**: ✅ Implemented with JWT auth and role-based access.

### `Job`
- **Purpose**: Represents a distributed task.
- **Important fields**:
  - `id`: UUID, used as queue message payload.
  - `userId`: Owner of the job (multi-tenant isolation).
  - `status`: Current state (`PENDING`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `RETRYING`, `CANCELLED`).
  - `workerId`: ID of the worker processing this job. `null` when idle.
  - `version`: Incremental version number used for Optimistic Concurrency Control (OCC).
  - `retryCount`: Number of times the job has failed and been retried.
  - `nextRetryAt`: Timestamp for when the scheduler should requeue a `RETRYING` job.
  - `completedAt`: Timestamp recorded upon successful completion.
  - `progress`: Percentage of job completion (0-100).
- **Relationships**: Belongs to `User`, has one `Result`, has many `JobEvent`.
- **Current status**: ✅ Implemented (OCC fields active, multi-tenant).

### `Result`
- **Purpose**: Stores the output of a completed job.
- **Important fields**: `jobId` (unique), `resultType`, `size`, `resultUrl`.
- **Relationships**: Belongs to one `Job`.
- **Current status**: ✅ Implemented.

### `JobEvent`
- **Purpose**: Append-only audit log for state transitions (Event Sourcing).
- **Important fields**: `jobId`, `eventType`, `workerId`, `details` (JSON).
- **Relationships**: Belongs to one `Job`.
- **Current status**: ✅ Implemented.

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
   │   QUEUED (exponential backoff: 10s → 30s → 60s → 120s)
   │
   └── FAILED (retries exhausted → DLQ)

PENDING / QUEUED → CANCELLED (user action)
```

---

## 9. Operations Dashboard

Built with Next.js 16 (App Router), Tailwind CSS 4, and a sci-fi/cyberpunk aesthetic.

### Pages

| Route | Purpose | Access |
|-------|---------|--------|
| `/login` | Authentication screen | Public |
| `/register` | New user registration | Public |
| `/dashboard` | Live cluster metrics overview | All authenticated |
| `/jobs` | Job table with status/filter | All authenticated |
| `/jobs/[id]` | Job detail with event timeline | All authenticated |
| `/workers` | Worker fleet with utilization rings | Admin only |
| `/recovery` | Live DLQ and recovery feed | Admin only |
| `/system` | Diagnostic status panel | Admin only |
| `/lab` | **Operations Lab: Interactive fault-tolerance testbed** | Admin only |

---

## 10. Current Project Status

| Feature | Status |
|---------|--------|
| Authentication (JWT + RBAC) | ✅ |
| Multi-Tenant Job Isolation | ✅ |
| Queue (Redis RPOPLPUSH) | ✅ |
| Retry Queue (Exponential Backoff) | ✅ |
| Dead Letter Queue | ✅ |
| Worker Recovery | ✅ |
| Leader Election | ✅ |
| Optimistic Concurrency Control | ✅ |
| Graceful Shutdown | ✅ |
| Prometheus + Grafana | ✅ |
| Real-Time SSE Telemetry | ✅ |
| Operations Dashboard | ✅ |
| API Integration Tests | ✅ |
| Worker Integration Tests | ✅ |
| Scheduler Integration Tests | ✅ |
| Docker Compose (8 containers) | ✅ |
| Priority Queue (CRITICAL/HIGH/MEDIUM/LOW) | ✅ |
| CI/CD Pipeline (GitHub Actions) | ✅ |
| **Lab Service Orchestrator** | ✅ |
| **TypeScript Scenario Engine** | ✅ |
| **LabRun Execution Tracking** | ✅ |
| **Dashboard Operations Lab** | ✅ |
| Swagger API Documentation | ❌ |
| Structured Logging | ❌ |

---

## 11. System Guarantees

### Guaranteed
- Jobs are durably stored in PostgreSQL before queueing
- Worker crashes do not permanently lose jobs
- Dead workers are automatically detected and recovered
- Zombie workers cannot overwrite recovered jobs (OCC)
- Only one scheduler coordinates the cluster at a time (leader election)
- All state transitions are auditable through JobEvent
- Users can only see and modify their own jobs (multi-tenant isolation)

### Not Guaranteed (By Design)
- Exactly-once execution (at-least-once is the model)
- Global ordering of jobs
- Distributed transactions across Redis and PostgreSQL
- Automatic horizontal autoscaling
