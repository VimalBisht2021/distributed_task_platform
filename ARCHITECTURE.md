# Architecture

> Deep technical documentation of every subsystem in the Distributed Task Platform.

---

## System Overview

```mermaid
flowchart TD
    Client["Client / Dashboard<br/>(Next.js 16)"] -->|REST + JWT| API["API Service<br/>Express + Auth + Rate Limiting"]
    API -->|LPUSH jobId| PQ["Priority Queues<br/>queue:critical<br/>queue:high<br/>queue:medium<br/>queue:low"]
    API -->|Persist| DB[("PostgreSQL 16<br/>Source of Truth")]
    
    PQ -->|RPOPLPUSH| W1["Worker 1"]
    PQ -->|RPOPLPUSH| W2["Worker 2"]
    PQ -->|RPOPLPUSH| W3["Worker N"]
    
    W1 & W2 & W3 -->|"Status + Events<br/>(OCC versioned)"| DB
    W1 & W2 & W3 -->|Heartbeat| Redis[("Redis 7<br/>Locks + Heartbeats")]
    W1 & W2 & W3 -->|Publish| PubSub["Redis Pub/Sub<br/>system:events"]
    
    Scheduler["Scheduler<br/>(Leader Elected)"] -->|Dead Worker Detection| Redis
    Scheduler -->|"Retry Polling<br/>(Exponential Backoff)"| DB
    Scheduler -->|Requeue| PQ
    Scheduler -->|Publish| PubSub
    
    PubSub -->|Subscribe| API
    API -->|"SSE Stream<br/>(EventSource)"| Client
    
    API & W1 & Scheduler -->|/metrics| Prom["Prometheus"]
    Prom --> Grafana["Grafana"]
```

---

## 1. Priority Queue Architecture

The platform uses **4 separate Redis lists** instead of a single FIFO queue. Workers check queues in strict priority order.

```mermaid
flowchart LR
    subgraph "Redis Queues (checked in order)"
        Q1["queue:critical"]
        Q2["queue:high"]
        Q3["queue:medium"]
        Q4["queue:low"]
    end
    
    API["API Service"] -->|"priority=CRITICAL"| Q1
    API -->|"priority=HIGH"| Q2
    API -->|"priority=MEDIUM (default)"| Q3
    API -->|"priority=LOW"| Q4
    
    Q1 -->|"Check first"| Worker["Worker"]
    Q2 -->|"Check second"| Worker
    Q3 -->|"Check third"| Worker
    Q4 -->|"Check last"| Worker
```

---

## 2. Worker Recovery Architecture

This is the most complex subsystem. It handles the scenario where a worker dies mid-execution.

```mermaid
sequenceDiagram
    participant W as Worker
    participant R as Redis
    participant S as Scheduler
    participant DB as PostgreSQL
    
    Note over W: Worker starts
    W->>R: Register in workers:active
    
    loop Every 5 seconds
        W->>R: Update heartbeat (worker:{id})
    end
    
    W->>R: RPOPLPUSH main-queue → processing-queue
    W->>DB: Update job → RUNNING (OCC check)
    
    Note over W: ❌ Worker crashes here
    Note over W: Heartbeat stops
    
    loop Every 10 seconds
        S->>R: Check workers:active timestamps
        Note over S: Detect stale heartbeat
        S->>R: Get jobs from processing-queue
        S->>DB: Reset job → QUEUED, clear workerId
        S->>R: Remove from processing-queue
        S->>R: LPUSH back to priority queue
        S->>R: Publish JOB_RECOVERED event
    end
```

---

## 3. Operations Lab & Lab Service

The platform includes a dedicated testing harness to visually demonstrate resilience. This avoids exposing dangerous orchestration commands inside the main API.

### Lab Architecture

```mermaid
flowchart TD
    subgraph "Frontend"
        Dashboard["Dashboard (/lab)"]
    end
    
    subgraph "Test Orchestrator"
        LabService["Lab Service (Port 3006)"]
        Scenarios["TypeScript Scenarios<br/>(priority, recovery, failover)"]
        LabService --> Scenarios
    end
    
    subgraph "Infrastructure"
        Docker["Docker Daemon"]
        API["API Service"]
    end
    
    Dashboard -->|POST /run/recovery| LabService
    LabService -->|"SSE /runs/:id/stream"| Dashboard
    
    Scenarios -->|child_process.exec| Docker
    Scenarios -->|fetch| API
```

### LabRun Execution Tracking

The `lab-service` maintains execution state for testing scenarios.

```mermaid
stateDiagram-v2
    [*] --> PENDING: POST /runs
    PENDING --> RUNNING: Scenario Starts
    RUNNING --> PASS: Scenario Succeeds
    RUNNING --> FAIL: Scenario Errors
```

### Real-Time Run Streaming

When the dashboard initiates a scenario, it connects to an SSE stream on the `lab-service` (`GET /runs/:id/stream`). The TypeScript Scenario Engine yields string execution logs and progress updates which are piped directly into an embedded terminal UI within the dashboard.

---

## 4. Optimistic Concurrency Control

Prevents zombie workers from corrupting state after recovery.

```mermaid
sequenceDiagram
    participant W1 as Worker 1 (Original)
    participant W2 as Worker 2 (After Recovery)
    participant DB as PostgreSQL
    
    Note over W1: Starts processing job (version=1)
    W1->>DB: UPDATE SET status=RUNNING WHERE version=1 ✅
    Note over DB: version → 2
    
    Note over W1: ❌ Network partition (appears dead)
    
    Note over W2: Scheduler recovers job, assigns to W2
    W2->>DB: UPDATE SET status=RUNNING WHERE version=2 ✅
    Note over DB: version → 3
    
    Note over W1: W1 comes back, tries to complete
    W1->>DB: UPDATE SET status=COMPLETED WHERE version=2 ❌
    Note over W1: 0 rows modified → Zombie detected → Abort
    
    W2->>DB: UPDATE SET status=COMPLETED WHERE version=3 ✅
    Note over DB: Only W2's result is written
```

---

## 5. Leader Election

Only one scheduler instance coordinates the cluster at any time.

```mermaid
sequenceDiagram
    participant S1 as Scheduler 1
    participant S2 as Scheduler 2
    participant R as Redis
    
    S1->>R: SET scheduler_leader S1 EX 15 NX
    Note over R: Returns OK → S1 is leader
    
    S2->>R: SET scheduler_leader S2 EX 15 NX
    Note over R: Returns nil → S2 waits
    
    loop Every 5 seconds (S1 only)
        S1->>R: Lua: if GET == S1 then EXPIRE 15
        Note over S1: Performs retries, recovery, monitoring
    end
    
    Note over S1: ❌ S1 crashes
    Note over R: Key expires after 15 seconds
    
    S2->>R: SET scheduler_leader S2 EX 15 NX
    Note over R: Returns OK → S2 takes over
```

---

## 6. Real-Time Telemetry (SSE)

```mermaid
flowchart LR
    subgraph "Event Producers"
        W["Worker Service"]
        S["Scheduler Service"]
    end
    
    subgraph "Transport"
        PS["Redis Pub/Sub<br/>channel: system:events"]
    end
    
    subgraph "Event Consumer"
        API["API Service<br/>(Subscriber)"]
    end
    
    subgraph "Clients"
        D1["Dashboard Tab 1"]
        D2["Dashboard Tab 2"]
    end
    
    W -->|"JOB_COMPLETED<br/>JOB_FAILED<br/>JOB_RETRY_SCHEDULED"| PS
    S -->|"JOB_RECOVERED<br/>WORKER_DEAD<br/>JOB_REQUEUED"| PS
    PS --> API
    API -->|"SSE (EventSource)"| D1
    API -->|"SSE (EventSource)"| D2
```

---

## 7. Job State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: Job Created
    PENDING --> QUEUED: Pushed to Redis
    QUEUED --> RUNNING: Worker picks up
    RUNNING --> COMPLETED: Success
    RUNNING --> RETRYING: Failed (retries remaining)
    RETRYING --> QUEUED: Scheduler requeues (exponential backoff)
    RUNNING --> FAILED: Retries exhausted (→ DLQ)
    PENDING --> CANCELLED: User cancels
    QUEUED --> CANCELLED: User cancels
```

---

## 8. Multi-Tenant Isolation

```mermaid
flowchart TD
    subgraph "User A (role: USER)"
        A1["POST /jobs → userId=A"]
        A2["GET /jobs → WHERE userId=A"]
        A3["Dashboard: Overview, Jobs only"]
    end
    
    subgraph "User B (role: USER)"
        B1["POST /jobs → userId=B"]
        B2["GET /jobs → WHERE userId=B"]
        B3["Dashboard: Overview, Jobs only"]
    end
    
    subgraph "Admin (role: ADMIN)"
        C1["GET /jobs → All jobs"]
        C2["Dashboard: Full console"]
        C3["Workers, Recovery, System tabs"]
    end
    
    A2 -.->|"Cannot see"| B1
    B2 -.->|"Cannot see"| A1
```

---

## 9. CI/CD Pipeline

```mermaid
flowchart TD
    Push["Push to main/develop<br/>or PR"] --> Lint["Lint & Type Check<br/>(tsc --noEmit × 3 services)"]
    
    Lint --> TestAPI["Test API Service<br/>Postgres 16 + Redis 7"]
    Lint --> TestWorker["Test Worker Service<br/>Postgres 16 + Redis 7"]
    Lint --> TestScheduler["Test Scheduler Service<br/>Postgres 16 + Redis 7"]
    Lint --> BuildDash["Build Dashboard<br/>(Next.js production build)"]
    
    TestAPI & TestWorker & TestScheduler & BuildDash --> Docker["Docker Build Verification<br/>(3 Dockerfiles)"]
```
