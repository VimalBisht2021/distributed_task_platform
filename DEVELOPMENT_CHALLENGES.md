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

 - - - 
 
 # #   C h a l l e n g e   7 :   R e a l - T i m e   T e l e m e t r y   &   S e r v e r - S e n t   E v e n t s   ( S S E ) 
 
 * * W h e n : * *   B u i l d i n g   t h e   L i v e   T e l e m e t r y   F e e d   f o r   t h e   O p e r a t i o n s   D a s h b o a r d 
 
 * * S y m p t o m : * * 
 T h e   S S E   s t r e a m   w o u l d   e i t h e r   f a i l   t o   r e n d e r   i n   t h e   U I ,   s i l e n t l y   d r o p   e v e n t s ,   o r   c r a s h   t h e   b r o w s e r   w i t h   m a s s i v e   D O M   e x p a n s i o n   d u r i n g   h e a v y   b e n c h m a r k i n g . 
 
 * * R o o t   C a u s e : * * 
 1 .   * * D a t a   S t r u c t u r e   M i s m a t c h : * *   R e d i s   e v e n t   p a y l o a d s   w e r e   f l a t   s t r u c t u r e s   ( e . g . ,   \ e v e n t . j o b I d \ ) ,   w h i l e   e a r l i e r   U I   i t e r a t i o n s   w e r e   e x p e c t i n g   d e e p l y   n e s t e d   s t r u c t u r e s   ( \ e v e n t . p a y l o a d . j o b I d \ ) ,   c a u s i n g   t h e   U I   t o   f i l t e r   o u t   e v e n t s   s i l e n t l y . 
 2 .   * * I d l e   T i m e o u t s : * *   S S E   c o n n e c t i o n s   w e r e   d r o p p i n g   b e h i n d   p r o x i e s   w h e n   i d l e .   
 3 .   * * D O M   E x p l o s i o n : * *   R e a c t   s t a t e   w a s   a c c u m u l a t i n g   e v e n t s   e n d l e s s l y ,   c a u s i n g   \ d i v \   n o d e s   t o   s t a c k   i n f i n i t e l y   a n d   b r e a k   t h e   l a y o u t / h e i g h t . 
 
 * * T h e   F i x : * * 
 -   C o r r e c t e d   t h e   U I   p a r s i n g   t o   m a p   t h e   f l a t   \ S y s t e m E v e n t M e s s a g e \   s t r u c t u r e . 
 -   I m p l e m e n t e d   a   2 0 - s e c o n d   i n t e r v a l   \ :   k e e p a l i v e \   h e a r t b e a t   f r o m   t h e   E x p r e s s   s e r v e r . 
 -   C a p p e d   t h e   R e a c t   s t a t e   a r r a y   t o   t h e   5 0 0   m o s t   r e c e n t   e v e n t s   ( \ . s l i c e ( 0 ,   5 0 0 ) \ )   a n d   c o n s t r a i n e d   t h e   C S S   G r i d   c o n t a i n e r   w i t h   a   f i x e d   \ h - [ 6 0 0 p x ] \   a n d   i n t e r n a l   s c r o l l i n g   ( \ o v e r f l o w - y - a u t o \ ) . 
 
 - - - 
 
 # #   C h a l l e n g e   8 :   \  
 D o c k e r - o u t - o f - D o c k e r \   ( D o o D ) 
 
 * * W h e n : * *   D o c k e r i z i n g   t h e   \ l a b - s e r v i c e \   f o r   C h a o s   E n g i n e e r i n g   T e s t s 
 
 * * S y m p t o m : * * 
 T h e   \ l a b - s e r v i c e \   n e e d e d   t o   s i m u l a t e   i n f r a s t r u c t u r e   f a i l u r e s   b y   k i l l i n g   a n d   r e s t a r t i n g   w o r k e r   c o n t a i n e r s .   R u n n i n g   \ l a b - s e r v i c e \   * i n s i d e *   a   D o c k e r   c o n t a i n e r   m e a n t   i t   h a d   n o   a c c e s s   t o   t h e   h o s t ' s   D o c k e r   d a e m o n . 
 
 * * R o o t   C a u s e : * * 
 A   c o n t a i n e r   i s   i s o l a t e d   b y   d e f a u l t   a n d   c a n n o t   i s s u e   c o m m a n d s   t o   t h e   D o c k e r   e n g i n e   o r c h e s t r a t i n g   i t . 
 
 * * T h e   F i x : * * 
 -   A d o p t e d   t h e   * * D o o D * *   ( D o c k e r - o u t - o f - D o c k e r )   p a t t e r n   b y   m o u n t i n g   t h e   h o s t ' s   \ / v a r / r u n / d o c k e r . s o c k \   d i r e c t l y   i n t o   t h e   \ l a b - s e r v i c e \   c o n t a i n e r   v i a   \ d o c k e r - c o m p o s e . y m l \ . 
 -   I n s t a l l e d   t h e   D o c k e r   C L I   i n s i d e   t h e   \ l a b - s e r v i c e \   A l p i n e   i m a g e ,   a l l o w i n g   i t   t o   e x e c u t e   \ d o c k e r   c o m p o s e   s c a l e   w o r k e r - s e r v i c e = 0 \   a g a i n s t   t h e   h o s t   d a e m o n   p e r f e c t l y . 
 
 - - - 
 
 # #   C h a l l e n g e   9 :   T y p e S c r i p t   M o n o r e p o   B u i l d   C o n t e x t s 
 
 * * W h e n : * *   C o m p i l i n g   t h e   A P I   a n d   W o r k e r   s e r v i c e s   i n s i d e   D o c k e r 
 
 * * S y m p t o m : * * 
 T h e   b u i l t   D o c k e r   i m a g e s   c o n t a i n e d   a   d e e p l y   n e s t e d   d i r e c t o r y   s t r u c t u r e   l i k e   \ / a p p / s e r v i c e s / a p i - s e r v i c e / d i s t / s e r v i c e s / a p i - s e r v i c e / s r c / . . . \   c a u s i n g   t h e   \ 
 p m   s t a r t \   c o m m a n d   t o   f a i l   d u e   t o   a   m i s s i n g   \ i n d e x . j s \ . 
 
 * * R o o t   C a u s e : * * 
 T h e   s e r v i c e s   s h a r e d   t y p e s   ( \ @ s h a r e d / t y p e s \ )   f r o m   t h e   r o o t   o f   t h e   w o r k s p a c e .   B e c a u s e   t h e   T y p e S c r i p t   \  o o t D i r \   w a s   s e t   t o   t h e   r o o t   w o r k s p a c e   ( \ . . / . . \ )   t o   e n c o m p a s s   t h e   \ s h a r e d / \   f o l d e r ,   t h e   \ 	 s c \   c o m p i l e r   r e p l i c a t e d   t h a t   e n t i r e   s t r u c t u r e   i n s i d e   t h e   \ d i s t / \   f o l d e r . 
 
 * * T h e   F i x : * * 
 -   I n   t h e   D o c k e r f i l e s ,   w e   e x p l i c i t l y   c o p i e d   b o t h   t h e   \ s h a r e d / \   d i r e c t o r y   a n d   t h e   s p e c i f i c   s e r v i c e   d i r e c t o r y   i n t o   t h e   c o n t a i n e r . 
 -   W e   u p d a t e d   t h e   \ p a c k a g e . j s o n \   s t a r t   s c r i p t s   t o   p o i n t   t o   t h e   n e s t e d   o u t p u t   p a t h   ( \ 
 o d e   d i s t / s e r v i c e s / a p i - s e r v i c e / s r c / s e r v e r . j s \ )   s o   t h e   r u n t i m e   c o u l d   p r o p e r l y   l o c a t e   t h e   e n t r y   p o i n t s . 
 
  
 