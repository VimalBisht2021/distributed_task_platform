# Development Challenges & Debugging Log

> Real problems encountered while building the Distributed Task Processing Platform, and how they were solved.

---

## Challenge 1: BRPOP Starving Heartbeats (Connection Blocking)

**When:** Implementing Worker Heartbeat System (Scheduler V2)

**Symptom:**
Worker registers successfully — `worker:worker-1` key appears in Redis. But within 15 seconds, the key vanishes. Running `KEYS *` in `redis-cli` shows `workers:active` exists but `worker:worker-1` does not.

```
Redis KEYS * output:
  workers:active       ✅ exists
  worker:worker-1      ❌ missing
```

The registration log confirmed the key was created:

```
Saved worker: {"workerId":"worker-1","capacity":1,"currentLoad":0}
Worker worker-1 registered
```

So the key was being created and then disappearing.

**Root Cause:**
The worker used a **single Redis connection** for everything — heartbeats, registration, AND the blocking `BRPOP` queue poll.

`BRPOP` with timeout `0` means: "block this connection forever until a message arrives." While BRPOP holds the connection, **no other commands can execute on it**. The heartbeat's `GET` and `SET` calls queued behind BRPOP and never ran.

Think of it like a single phone line:

```
t=0s   Registration: SET worker:worker-1 (expires in 15s)  ✅
t=0s   BRPOP: *picks up phone, never hangs up*            🔒
t=5s   Heartbeat tries to refresh key → LINE BUSY          ❌
t=10s  Heartbeat tries again → LINE BUSY                   ❌
t=15s  Redis: "TTL expired, deleting worker:worker-1"      💀
```

The heartbeat couldn't get through to Redis because BRPOP was hogging the connection.

**The Fix:**
Created a **dedicated second Redis connection** for blocking operations:

```typescript
// redisClient.ts

// General-purpose — heartbeats, registration, SET, GET
export const redisClient = new Redis({ host: "localhost", port: 6379 });

// Dedicated for BRPOP — never blocks the main connection
export const redisBlockingClient = new Redis({ host: "localhost", port: 6379 });
```

Updated the queue consumer to use the blocking client:

```typescript
// consumer.ts — BEFORE (broken)
import { redisClient } from "../redis/redisClient";
const result = await redisClient.brpop("main-queue", 0);

// consumer.ts — AFTER (fixed)
import { redisBlockingClient } from "../redis/redisClient";
const result = await redisBlockingClient.brpop("main-queue", 0);
```

**Key Lesson:**
In Redis, blocking commands (`BRPOP`, `BLPOP`, `BRPOPLPUSH`) monopolize the connection. Any production system using blocking queues needs **separate connections** for blocking vs. non-blocking operations. This is a well-known pattern — the [ioredis documentation](https://github.com/redis/ioredis) recommends it, and systems like Sidekiq (Ruby) and BullMQ (Node.js) use dedicated connections internally for the same reason.

---

## Challenge 2: Scheduler Import Path Resolution

**When:** First run of Scheduler Service

**Symptom:**
Scheduler crashes on startup with `Cannot find module` error.

```
Error: Cannot find module 'C:\...\scheduler-service\src\services\retry.service'
```

**Root Cause:**
The imports in `scheduler.ts` used `../src/services/retry.service` instead of `./services/retry.service`.

Since `scheduler.ts` is already inside `src/`, the path `../src/services/` goes **up** to `scheduler-service/` then **back down** into `src/services/`. While this resolves to the same physical directory, the Node.js module resolver couldn't handle it.

```
scheduler.ts location:  src/scheduler.ts
Import path used:       ../src/services/retry.service
Resolved to:            scheduler-service/src/services/retry.service  ← confuses resolver

Correct import:         ./services/retry.service
Resolved to:            src/services/retry.service  ← clean resolution
```

**The Fix:**
Changed all imports from `../src/services/` to `./services/`.

**Key Lesson:**
Always think about relative imports from the file's own location. Going "up and back down" (`../src/`) when you're already inside `src/` is a common mistake that works on some systems but fails on others.

---

## Challenge 3: Missing TypeScript Configuration

**When:** First run of Scheduler Service

**Symptom:**
Even after fixing import paths, `ts-node-dev` couldn't compile the scheduler.

**Root Cause:**
The scheduler-service had no `tsconfig.json`. Without it, `ts-node-dev` doesn't know how to resolve modules or compile TypeScript. The api-service and worker-service both had one, but the scheduler was created later and it was missed.

**The Fix:**
Created `tsconfig.json` matching the worker-service pattern:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "rootDir": "./src",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Key Lesson:**
When adding a new service to a monorepo, don't forget the boilerplate configuration files. A checklist helps: `package.json`, `tsconfig.json`, `.env`, `prisma/schema.prisma`.

---

## Challenge 4: Missing Environment Variables

**When:** First run of Scheduler Service

**Symptom:**
Scheduler starts but immediately throws a Prisma error:

```
PrismaClientInitializationError:
Invalid `prisma.job.findMany()` invocation
```

**Root Cause:**
The scheduler-service's `.env` file was empty. Prisma needs `DATABASE_URL` to connect to PostgreSQL, and the `QueueService` needs `REDIS_URL` for Redis.

**The Fix:**
Added the same environment variables used by the other services:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/task_platform?schema=public
REDIS_URL=redis://localhost:6379
```

**Key Lesson:**
Environment variables don't share across services in a monorepo. Each service needs its own `.env` file configured independently. This is actually a feature — in production, different services might connect to different database replicas or Redis instances.

---

## Challenge 5: Redis Client TypeScript Overload Mismatch

**When:** Setting up Redis connection in Scheduler Service

**Symptom:**
TypeScript error on the Redis constructor:

```
No overload matches this call.
  Type 'string | undefined' is not assignable to type 'RedisOptions'.
```

**Root Cause:**
`process.env.REDIS_URL` is typed as `string | undefined` by TypeScript. The `ioredis` Redis constructor has multiple overloads but none accept `undefined`.

```typescript
// This fails — process.env.REDIS_URL could be undefined
const redis = new Redis(process.env.REDIS_URL);
```

**The Fix:**
Added a fallback default value with `||`:

```typescript
// This works — always evaluates to string
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
```

**Key Lesson:**
Environment variables in TypeScript are always `string | undefined`. Always provide fallback defaults or validate them at startup before using them in constructors.

---

## Challenge 6: Job Processor Return Type Mismatch

**When:** Connecting Worker to Result Storage

**Symptom:**
TypeScript error in `worker.ts`:

```
Property 'resultType' does not exist on type 'void'
```

At the line:

```typescript
const result = await processJob(jobId);
result.resultType  // ← Error: 'void' has no properties
```

**Root Cause:**
The `processJob` function in `job.processor.ts` was not returning anything (implicit `void` return). The worker expected it to return `{ resultType, content }` to store in the Result table.

**The Fix:**
Updated `processJob` to explicitly return the result object:

```typescript
export async function processJob(jobId: string) {
  console.log(`Executing ${jobId}`);
  await new Promise(resolve => setTimeout(resolve, 5000));
  return {
    resultType: "TEXT",
    content: `Job ${jobId} completed successfully`,
  };
}
```

**Key Lesson:**
TypeScript catches these at compile time — a function that should return data but doesn't will cause type errors downstream. Always define explicit return types for functions that produce data.

---

## Pattern: How Bugs Cluster in Distributed Systems

Looking at the challenges above, a pattern emerges:

| Category | Challenges | Root Theme |
|----------|-----------|------------|
| **Connection Management** | #1 (BRPOP blocking) | Shared resources in concurrent systems |
| **Configuration** | #3, #4, #5 (tsconfig, .env, types) | Each service is an independent unit |
| **Module Resolution** | #2 (import paths) | Monorepo navigation |
| **Interface Contracts** | #6 (return types) | Service boundaries need clear contracts |

The most interesting bug (#1) is a **classic distributed systems problem** — resource contention on a shared connection. It's the same category of bug as database connection pool exhaustion, thread starvation, and file descriptor limits. The solution is always the same: **isolate blocking resources from shared ones**.
