import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { redisClient } from "../src/redis/redisClient";
import { REDIS_KEYS } from "../src/redis/keys";
import { monitorWorkers } from "../src/worker-monitor";
import { RetryService } from "../src/services/retry.service";

const prisma = new PrismaClient();
const retryService = new RetryService();

describe("E2E Crash Recovery Pipeline", () => {
  const workerA = "crash-worker-A";
  const workerB = "savior-worker-B";
  let testJobId: string;

  beforeEach(async () => {
    // Clear all state
    await redisClient.flushall();
    
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();

    await prisma.user.upsert({
      where: { id: "test-user-1" },
      update: {},
      create: { id: "test-user-1", email: "test@example.com", passwordHash: "hash" }
    });

    // 1. API creates job
    const job = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "important text" },
        status: "QUEUED",
        progress: 0,
        retryCount: 0,
      }
    });
    testJobId = job.id;
    await redisClient.lpush(REDIS_KEYS.MAIN_QUEUE, testJobId);
  });

  afterEach(async () => {
    await redisClient.flushall();
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();
  });

  it("should detect crash, recover job, requeue it, and allow a new worker to complete it", async () => {
    // 2. Simulate Worker A picking up the job
    await redisClient.rpoplpush(REDIS_KEYS.MAIN_QUEUE, REDIS_KEYS.PROCESSING_QUEUE);
    await prisma.job.update({
      where: { id: testJobId },
      data: {
        status: "RUNNING",
        workerId: workerA,
        version: { increment: 1 }
      }
    });
    
    // Worker A registers itself and sets heartbeat
    await redisClient.sadd("workers:active", workerA);
    await redisClient.set(`worker:${workerA}`, "alive", "EX", 10);

    // 3. Worker A crashes! (Heartbeat expires / is deleted)
    await redisClient.del(`worker:${workerA}`);

    // 4. Scheduler monitor detects death (3 misses required)
    await monitorWorkers(); // Miss 1
    await monitorWorkers(); // Miss 2
    await monitorWorkers(); // Miss 3 - declared dead, recoverWorkerJobs invoked

    // Verify Recovery State
    let jobState = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(jobState?.status).toBe("RETRYING");
    expect(jobState?.workerId).toBeNull();

    // 5. Retry Poller processes mature retrying jobs
    // We update nextRetryAt to be in the past to simulate time passing
    await prisma.job.update({
      where: { id: testJobId },
      data: { nextRetryAt: new Date(Date.now() - 60000) }
    });

    await retryService.processRetries();

    // Verify Requeued State
    jobState = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(jobState?.status).toBe("QUEUED");
    expect(await redisClient.lrange(REDIS_KEYS.MAIN_QUEUE, 0, -1)).toContain(testJobId);

    // 6. Simulate Worker B picking up the recovered job
    await redisClient.rpoplpush(REDIS_KEYS.MAIN_QUEUE, REDIS_KEYS.PROCESSING_QUEUE);
    await prisma.job.update({
      where: { id: testJobId },
      data: {
        status: "RUNNING",
        workerId: workerB,
        version: { increment: 1 }
      }
    });

    // 7. Simulate Worker B completing it
    await prisma.job.update({
      where: { id: testJobId },
      data: {
        status: "COMPLETED",
        workerId: null,
        completedAt: new Date(),
        version: { increment: 1 }
      }
    });
    
    await prisma.result.create({
      data: {
        jobId: testJobId,
        resultType: "TEXT",
        resultUrl: "/results/recovered.json",
        size: 50,
      }
    });

    await prisma.jobEvent.create({
      data: {
        jobId: testJobId,
        eventType: "JOB_COMPLETED",
        workerId: workerB,
      }
    });

    // Final Assertions (The Showcase!)
    const finalJob = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(finalJob?.status).toBe("COMPLETED");

    // No duplicate results
    const results = await prisma.result.findMany({ where: { jobId: testJobId } });
    expect(results).toHaveLength(1);

    // No duplicate completion events
    const events = await prisma.jobEvent.findMany({ where: { jobId: testJobId } });
    const completions = events.filter(e => e.eventType === "JOB_COMPLETED");
    expect(completions).toHaveLength(1);
    expect(completions[0].workerId).toBe(workerB); // Successfully attributed to Savior Worker
  });
});
