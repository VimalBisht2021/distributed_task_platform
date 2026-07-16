# Operations Lab Demo Script

> A step-by-step guide to demonstrate the platform's distributed systems capabilities visually through the Operations Lab Dashboard.

---

## Prerequisites

Make sure all services are running:

```bash
# Terminal 1 — Infrastructure
docker compose up -d

# Terminal 2 — API Service
cd services/api-service && npm run dev

# Terminal 3 — Worker
cd services/worker-service && npm run dev

# Terminal 4 — Scheduler
cd services/scheduler-service && npm run dev

# Terminal 5 — Lab Service (Test Orchestrator)
cd services/lab-service && npm run dev

# Terminal 6 — Dashboard
cd apps/dashboard && npm run dev
```

**Dashboard:** http://localhost:3001  
**Login:** `admin@system.local` / `password123`

Navigate to the **Lab 🧪** tab on the left sidebar to begin.

---

## Demo Flow 1: Priority Queue Test

**Goal:** Show that the platform strictly honors queue priority (`CRITICAL` > `HIGH` > `MEDIUM` > `LOW`), regardless of submission order.

**Steps:**
1. On the Lab page, locate the **Priority Queue Test** card.
2. Click **EXECUTE**.
3. Watch the embedded terminal output as the `lab-service` submits jobs in reverse priority (Low first, Critical last).
4. Observe the Live Telemetry Terminal on the right for incoming events.

**Expected Events:**
- `JOB_CREATED` events stream in rapidly.
- `JOB_COMPLETED` events will start appearing. Note the color/payload of the completed jobs.

**Expected Outcome:**
The log terminal will verify that `CRITICAL` jobs finish before `HIGH` jobs, which finish before `MEDIUM`, and finally `LOW`. The test completes with a `PASS` status. 
*Talking Point:* "Workers use `RPOPLPUSH` in strict priority order, ensuring urgent tasks bypass the backlog."

---

## Demo Flow 2: Worker Recovery Test

**Goal:** Demonstrate the system's fault tolerance and ability to automatically recover orphaned jobs when a worker crashes mid-execution.

**Steps:**
1. Ensure at least one worker is running (`docker compose up -d --scale worker-service=3` if using Docker, or keep terminal 3 open).
2. On the Lab page, locate the **Worker Recovery Test** card.
3. Click **EXECUTE**.
4. The test creates a long-running job. Once it starts (`JOB_STARTED`), the `lab-service` will forcefully kill the worker container processing it.

**Expected Events:**
- `JOB_CREATED` → `JOB_STARTED` (Blue/Green)
- `WORKER_DEAD` (Red) - Scheduler detects the missed heartbeats.
- `JOB_RECOVERED` (Yellow) - Scheduler reclaims the orphaned job.
- `JOB_STARTED` → `JOB_COMPLETED` (Green) - Another worker finishes it.

**Expected Outcome:**
The system self-heals without manual intervention. The orphaned job is safely requeued and processed by a surviving worker. The test terminal will display `PASS`.
*Talking Point:* "We use heartbeat timeouts and Optimistic Concurrency Control (OCC) to ensure jobs are never lost, and zombie workers cannot corrupt state."

---

## Demo Flow 3: Leader Failover Test

**Goal:** Show high-availability coordination. Only one scheduler orchestrates the cluster at a time, but if the leader dies, a standby node instantly takes over.

**Steps:**
1. Start multiple schedulers (`docker compose up -d --scale scheduler-service=3`).
2. On the Lab page, locate the **Leader Failover Test** card.
3. Click **EXECUTE**.
4. The `lab-service` identifies the current Redis leader lock owner and aggressively kills that specific container.

**Expected Events:**
- (Background) The dead scheduler's lock expires in Redis.
- A standby scheduler successfully acquires the `scheduler_leader` lock.
- Normal cluster telemetry resumes.

**Expected Outcome:**
The test verifies that a new leader is elected within the TTL window (typically 15 seconds) and resumes recovery polling. The test terminal will display `PASS`.
*Talking Point:* "We use a Redis `SET NX EX` lock with Lua script renewal to prevent split-brain coordination across our orchestrators."

---

## Demo Flow 4: Benchmark Test

**Goal:** Measure the raw throughput (Jobs/Sec) and scalability of the Redis `RPOPLPUSH` queue pipeline.

**Steps:**
1. Scale up the worker fleet for maximum impact (`docker compose up -d --scale worker-service=5`).
2. On the Lab page, locate the **Throughput Benchmark** card.
3. Click **EXECUTE**.
4. The test floods the API with hundreds of jobs instantly.

**Expected Events:**
- A massive wall of `JOB_CREATED` events floods the Live Telemetry Terminal.
- Instantly followed by a rapid stream of `JOB_COMPLETED` events.

**Expected Outcome:**
The log terminal will track the elapsed time and calculate the Jobs/Sec throughput. The test terminal will display `PASS` once all jobs reach a terminal state.
*Talking Point:* "Because we use a pure pull-model queue architecture, workers naturally pull at their maximum capacity, providing intrinsic backpressure without overwhelming the database."

---

## Talking Points for Interviews

When presenting this project, lead with these:

### Architecture
> "It's a microservices platform with an API gateway, stateless workers, and a leader-elected scheduler that coordinates the cluster."

### Recovery
> "If a worker crashes mid-job, the scheduler detects it via heartbeat timeout and automatically recovers the orphaned job — no data loss, no manual intervention."

### Concurrency
> "I use optimistic concurrency control with a version field to prevent zombie workers from corrupting state after recovery."

### Priority Scheduling
> "Jobs are routed to separate Redis queues by priority. Workers always drain the highest-priority queue first."

### Observability
> "The dashboard updates in real-time via Redis Pub/Sub → SSE. No database polling for live metrics. The Operations Lab proves this visually."

### Testing
> "All integration tests run against real Postgres and Redis — no mocks. That caught 5 production-level bugs."
