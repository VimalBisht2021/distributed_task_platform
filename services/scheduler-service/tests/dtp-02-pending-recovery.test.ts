import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PendingReconcilerService } from "../src/services/pending-reconciler.service";
import { redisClient } from "../src/redis/redisClient";
import { REDIS_KEYS } from "../src/redis/keys";

const prisma = new PrismaClient();

describe("DTP-02: Recovery of Divergent / Stranded PENDING Jobs", () => {
  // Use a short 1-second grace period for unit testing
  const reconciler = new PendingReconcilerService(1000);
  let testJobId: string;

  beforeEach(async () => {
    await redisClient.del(REDIS_KEYS.QUEUE_MEDIUM);
    await redisClient.del(REDIS_KEYS.QUEUE_HIGH);
    await redisClient.del(REDIS_KEYS.PROCESSING_QUEUE);

    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();

    await prisma.user.upsert({
      where: { id: "test-user-1" },
      update: {},
      create: { id: "test-user-1", email: "test@example.com", passwordHash: "hash" },
    });

    // Seed a job simulating an API crash or Redis network failure right after database insertion
    const job = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "divergent pending job" },
        status: "PENDING",
        priority: "MEDIUM",
        progress: 0,
        version: 1,
        // Set creation time 5 seconds in the past (past the 1-second grace period)
        createdAt: new Date(Date.now() - 5000),
      },
    });
    testJobId = job.id;
  });

  afterEach(async () => {
    await redisClient.del(REDIS_KEYS.QUEUE_MEDIUM);
    await redisClient.del(REDIS_KEYS.QUEUE_HIGH);
    await redisClient.del(REDIS_KEYS.PROCESSING_QUEUE);
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();
  });

  it("should recover an undispatched PENDING job, push it to Redis, and transition to QUEUED", async () => {
    // 1. Initial state: Job is PENDING in PostgreSQL, but Redis queue is empty (divergence)
    const initialQueue = await redisClient.lrange(REDIS_KEYS.QUEUE_MEDIUM, 0, -1);
    expect(initialQueue).toHaveLength(0);

    // 2. Scheduler reconciler runs
    const recoveredCount = await reconciler.processPendingJobs();
    expect(recoveredCount).toBe(1);

    // 3. Verify DB state transitioned to QUEUED with bumped version
    const updatedJob = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(updatedJob?.status).toBe("QUEUED");
    expect(updatedJob?.version).toBe(2);

    // 4. Verify Redis now contains the job ID in the priority queue
    const queuedItems = await redisClient.lrange(REDIS_KEYS.QUEUE_MEDIUM, 0, -1);
    expect(queuedItems).toContain(testJobId);

    // 5. Verify event was recorded
    const events = await prisma.jobEvent.findMany({ where: { jobId: testJobId } });
    const queuedEvents = events.filter((e) => e.eventType === "JOB_QUEUED");
    expect(queuedEvents).toHaveLength(1);
    expect(queuedEvents[0].details).toMatchObject({ reason: "RECONCILED_FROM_PENDING" });
  });

  it("should NOT dispatch recently created pending jobs (respects grace period)", async () => {
    // Create a job that was created just now (simulates active in-flight API request)
    const freshJob = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "in-flight api job" },
        status: "PENDING",
        priority: "MEDIUM",
        createdAt: new Date(),
      },
    });

    // Delete the old test job so only the fresh job is present
    await prisma.job.delete({ where: { id: testJobId } });

    const recoveredCount = await reconciler.processPendingJobs();
    expect(recoveredCount).toBe(0);

    // Verify fresh job remains untouched in PENDING
    const freshJobState = await prisma.job.findUnique({ where: { id: freshJob.id } });
    expect(freshJobState?.status).toBe("PENDING");

    // Queue remains empty
    const queuedItems = await redisClient.lrange(REDIS_KEYS.QUEUE_MEDIUM, 0, -1);
    expect(queuedItems).not.toContain(freshJob.id);
  });

  it("should be idempotent: repeated recovery runs must NOT cause duplicate queueing or status corruptions", async () => {
    // First run recovers the job
    const firstRun = await reconciler.processPendingJobs();
    expect(firstRun).toBe(1);

    // Second run should find 0 eligible pending jobs
    const secondRun = await reconciler.processPendingJobs();
    expect(secondRun).toBe(0);

    // Assert that the job exists exactly ONCE in the Redis queue
    const queuedItems = await redisClient.lrange(REDIS_KEYS.QUEUE_MEDIUM, 0, -1);
    const occurrences = queuedItems.filter((id) => id === testJobId);
    expect(occurrences).toHaveLength(1);

    // Assert version is not repeatedly incremented
    const jobState = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(jobState?.version).toBe(2);
  });

  it("should gracefully handle Redis failures during reconciliation without corrupting DB status", async () => {
    // Spy on queueService.enqueue to simulate a transient Redis error during reconciliation
    const errorSpy = vi.spyOn((reconciler as any).queueService, "enqueue").mockRejectedValueOnce(
      new Error("Redis connection timeout during reconcile")
    );

    const recoveredCount = await reconciler.processPendingJobs();
    expect(recoveredCount).toBe(0);

    // DB status must remain PENDING so it can be retried on subsequent sweeps
    const jobState = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(jobState?.status).toBe("PENDING");
    expect(jobState?.version).toBe(1);

    errorSpy.mockRestore();
  });
});
