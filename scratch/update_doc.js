const fs = require('fs');

let content = fs.readFileSync('PROJECT_STATE.md', 'utf8');

// 1. Current Milestone
const milestoneRegex = /## Current Milestone[\s\S]*?---\n/m;
const newMilestone = `## Current Milestone

**Current Phase:** Implementation of Concurrency and Consistency

### Completed

- ✅ Authentication (Register + Login + JWT)
- ✅ Job APIs (Create, Get, List, Cancel, Retry)
- ✅ Redis Queue (LPUSH / RPOPLPUSH)
- ✅ Worker Processing Loop
- ✅ Event Tracking (8 event types)
- ✅ Result Storage (DB)
- ✅ Worker Ownership Tracking
- ✅ Scheduler implemented
- ✅ Worker registration implemented
- ✅ Worker heartbeats implemented
- ✅ Dead worker detection implemented
- ✅ Crash recovery implemented
- ✅ Worker load tracking implemented
- ✅ Metrics API implemented
- ✅ Reliable queue implementation started/completed
- ✅ nextRetryAt scheduling implemented

### Next Deliverables

- Optimistic Concurrency Control (OCC)
- Scheduler Leader Election

---
`;
content = content.replace(milestoneRegex, newMilestone);

// 2. Database Schema (Job model)
content = content.replace(
  'retryCount    Int       @default(0)\n  workerId      String?',
  'retryCount    Int       @default(0)\n  nextRetryAt   DateTime?\n  workerId      String?'
);

content = content.replace(
  '| `retryCount`    | Number of retry attempts completed                                         |\n| `workerId`      | ID of the worker currently processing this job; `null` when idle/completed |\n| `version`       | Optimistic locking counter for race-condition prevention                   |',
  '| `retryCount`    | Number of retry attempts completed                                         |\n| `nextRetryAt`   | Database-driven retry scheduling (replaces scheduler-side backoff calculations) |\n| `workerId`      | ID of the worker currently processing this job; `null` when idle/completed |\n| `version`       | Intended for optimistic concurrency control (not fully implemented yet)    |'
);

// 3. Redis Architecture (Queue Design)
const queueDesignRegex = /## 8\. Queue Design[\s\S]*?---\n/m;
const newQueueDesign = `## 8. Queue & Redis Architecture

### Current Implementation

The platform currently uses a **reliable queue** pattern in Redis.

| Operation | Description |
| --------- | ----------- |
| Enqueue   | \`LPUSH main-queue <jobId>\` |
| Dequeue   | \`RPOPLPUSH main-queue processing-queue\` |
| Complete  | \`LREM processing-queue 1 <jobId>\` |

**Queue stores: \`jobId\` only.**

### Why BRPOP-only was removed
The old \`BRPOP\` design was susceptible to message loss. If a worker crashed immediately after popping a job but before updating the database, the job ID was lost forever. The new \`RPOPLPUSH\` design atomically moves the job to a \`processing-queue\`. If the worker crashes, the \`RecoveryService\` can find the orphaned job in the processing queue and recover it, ensuring no messages are lost.

### Redis Key Registry

\`\`\`typescript
export const REDIS_KEYS = {
  MAIN_QUEUE: "main-queue",
  PROCESSING_QUEUE: "processing-queue",
  RETRY_QUEUE: "retry-queue", 
  DLQ: "dead-letter-queue", 
};
\`\`\`

### Worker Registry & Heartbeat Keys
- \`workers:active\`: Redis Set containing active worker IDs.
- \`worker:{workerId}\`: Redis String containing JSON heartbeat data.

### Why PostgreSQL Is Source of Truth

- The queue is a **transport mechanism**, not a data store
- All job metadata, status, retries, and results live in PostgreSQL
- If Redis is flushed, jobs are not lost — they can be re-queued from the database
- Workers fetch the full job record from PostgreSQL after receiving a \`jobId\` from the queue
- This avoids duplicate state and simplifies retry/failure handling

---
`;
content = content.replace(queueDesignRegex, newQueueDesign);

// 4. Worker Architecture
content = content.replace(
  '### Current Worker Behavior',
  `### Worker Registration & Heartbeats
Workers register themselves on startup and emit a heartbeat every 5 seconds. This payload tracks capacity and current load.

**WorkerInfo Structure:**
\`\`\`json
{
  "workerId": "worker-1",
  "status": "active",
  "capacity": 10,
  "currentLoad": 3,
  "startedAt": 1700000000
}
\`\`\`

### Current Worker Behavior`
);

// 5. Scheduler Architecture
const schedulerArchRegex = /## 14\. Scheduler Service — Implementation Details[\s\S]*?---\n/m;
const newSchedulerArch = `## 14. Scheduler Architecture

The Scheduler Service is the control plane of the platform.

### Current Responsibilities

1. **Requeue RETRYING jobs**: Polling loop finds jobs with \`status='RETRYING'\` and \`nextRetryAt <= NOW()\`.
2. **Detect dead workers**: Scans \`workers:active\` and checks for stale heartbeats.
3. **Recover orphaned RUNNING jobs**: Uses \`RecoveryService\` to reset jobs stuck in \`processing-queue\` for dead workers.

---
`;
content = content.replace(schedulerArchRegex, newSchedulerArch);

// 6. Retry System
const retrySystemRegex = /## 12\. Retry System \(Scheduler V1 — Current\)[\s\S]*?---\n/m;
const newRetrySystem = `## 12. Retry System

### Current Implementation
Retry timing is now stored directly in the DB using \`nextRetryAt\`, decoupling the backoff calculation from the polling loop delay.

**Flow:**
Worker failure
↓
retryCount++
↓
nextRetryAt calculated
↓
status = RETRYING
↓
Scheduler query:
\`WHERE status='RETRYING' AND nextRetryAt <= NOW()\`
↓
Requeue

### Exponential Backoff Schedule
| Attempt | Delay       |
| ------- | ----------- |
| Retry 1 | 10 seconds  |
| Retry 2 | 30 seconds  |
| Retry 3 | 60 seconds  |
| Retry 4 | 120 seconds |

---
`;
content = content.replace(retrySystemRegex, newRetrySystem);

// 7, 8, 9, 10, 11 - Add new sections before Architectural Decisions
const currentImplStatusRegex = /## 13\. Current Implementation Status[\s\S]*?---\n/m;
const newSections = `## 13. Metrics API

Implemented endpoints:

**\`GET /metrics/jobs\`**
Returns:
\`\`\`json
{
  "pending": 5,
  "queued": 120,
  "running": 3,
  "completed": 1500,
  "failed": 12,
  "retrying": 2
}
\`\`\`

**\`GET /metrics/workers\`**
Returns:
\`\`\`json
{
  "workers": [
    {
      "workerId": "worker-123",
      "status": "active",
      "capacity": 10,
      "currentLoad": 3,
      "startedAt": 1700000000
    }
  ],
  "activeWorkers": 1,
  "totalCapacity": 10,
  "currentLoad": 3,
  "utilization": 30.00
}
\`\`\`

---

## 15. Reliability Improvements

### Reliable Queue

**Old design:**
BRPOP → Crash → Job Lost

**New design:**
MAIN_QUEUE → Worker (RPOPLPUSH) → PROCESSING_QUEUE → Worker completes task → LREM on completion

**Benefits:**
- Recoverable jobs
- No immediate message loss

### Recovery Service

**Current behavior:**
Find RUNNING jobs owned by dead worker
↓
Remove from PROCESSING_QUEUE
↓
status = RETRYING
↓
workerId = null
↓
JOB_RECOVERED event

---

## 16. Known Limitations

1. **Optimistic concurrency control not implemented:** A network-partitioned "zombie" worker might overwrite job statuses.
2. **Scheduler leader election not implemented:** Running multiple schedulers causes race conditions and duplicate operations.
3. **Worker load tracking not atomic:** Updating worker load relies on JSON parsing rather than atomic operations (like HINCRBY).
4. **Processing queue lacks visibility timeout:** Orphaned jobs require the scheduler's dead worker detection to be recovered.
5. **Structured logging missing:** Hard to trace distributed requests across plain console logs.
6. **Dashboard not implemented:** Lacking a visual overview of cluster health.

---

## 17. Previous Review Findings

Major issues originally identified and their current status:

- **BRPOP message loss** → FIXED
- **Scheduler retry stalling** → FIXED via nextRetryAt
- **Zombie workers** → NOT FIXED
- **Missing leader election** → NOT FIXED

---

## 18. Next Development Priority

**Task: Optimistic Concurrency Control (OCC)**

**Goal:**
Prevent:
- zombie workers
- duplicate completion
- stale worker updates

Use existing \`Job.version\` field.

**Problem:**
Workers experiencing long GC pauses or network partitions may continue executing after their lease expires and the scheduler reassigns their job.

**Proposed design:**
1. Read current \`version\` when pulling job.
2. Update operations include \`where: { id: jobId, version: currentVersion }\`.
3. Increment version: \`version: { increment: 1 }\`.
4. If update fails, abort (worker is a zombie).

**Affected files:**
- \`services/worker-service/src/worker.ts\`
- \`services/scheduler-service/src/services/recovery.service.ts\`

**Expected outcome:**
State corruption is prevented and exactly-once/at-least-once semantics are guaranteed safely.

---
`;

content = content.replace(currentImplStatusRegex, newSections);

// Also remove ## 18. Next Immediate Task (lines 1023 to 1052)
const nextTaskRegex = /## 18\. Next Immediate Task[\s\S]*?---\n/m;
content = content.replace(nextTaskRegex, '');

// And remove ## 16. Future Features Roadmap
const roadmapRegex = /## 16\. Future Features Roadmap[\s\S]*?---\n/m;
content = content.replace(roadmapRegex, '');


// 12. Resume Value Section
const resumeRegex = /## Resume Highlights[\s\S]*/m;
const newResume = `## Resume Highlights

**Key Distributed Systems Concepts Demonstrated:**
- Distributed worker architecture
- Heartbeat-based liveness detection
- Crash recovery
- Reliable queue pattern
- Retry scheduling
- Worker load tracking
- Metrics system
- Dead worker recovery
- At-Least-Once Processing Guarantees
- Layered Architecture (Routes → Controllers → Services → Repositories)
- JWT Authentication
- Docker Containerization
`;
content = content.replace(resumeRegex, newResume);

fs.writeFileSync('PROJECT_STATE.md', content);
console.log('Update complete.');
