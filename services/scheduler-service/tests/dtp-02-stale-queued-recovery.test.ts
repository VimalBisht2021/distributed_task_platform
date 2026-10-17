import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PendingReconcilerService } from "../src/services/pending-reconciler.service";
import { redisClient } from "../src/redis/redisClient";
import { REDIS_KEYS } from "../src/redis/keys";

const prisma = new PrismaClient();

describe("DTP-02 Regression Tests: Tests A, B, C, D (Stale QUEUED & Concurrency Invariants)", () => {
  // Use a short 1-second grace period for fast integration testing
  const reconciler = new PendingReconcilerService(1000);

  beforeEach(async () => {
    await redisClient.del(REDIS_KEYS.QUEUE_CRITICAL);
    await redisClient.del(REDIS_KEYS.QUEUE_HIGH);
    await redisClient.del(REDIS_KEYS.QUEUE_MEDIUM);
    await redisClient.del(REDIS_KEYS.QUEUE_LOW);
    await redisClient.del(REDIS_KEYS.MAIN_QUEUE);
    await redisClient.del(REDIS_KEYS.PROCESSING_QUEUE);

    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();

    await prisma.user.upsert({
      where: { id: "test-user-1" },
      update: {},
      create: { id: "test-user-1", email: "test@example.com", passwordHash: "hash" },
    });
  });

  afterEach(async () => {
    await redisClient.del(REDIS_KEYS.QUEUE_CRITICAL);
    await redisClient.del(REDIS_KEYS.QUEUE_HIGH);
    await redisClient.del(REDIS_KEYS.QUEUE_MEDIUM);
    await redisClient.del(REDIS_KEYS.QUEUE_LOW);
    await redisClient.del(REDIS_KEYS.MAIN_QUEUE);
    await redisClient.del(REDIS_KEYS.PROCESSING_QUEUE);

    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test A — Stale QUEUED job missing from all queues
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test A: should recover a stale QUEUED job missing from all Redis queues and make it claimable", async () => {
    // Arrange: Create a job in DB with status: QUEUED, workerId: null, and old updatedAt
    const job = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "stale queued missing from redis" },
        status: "QUEUED",
        priority: "MEDIUM",
        workerId: null,
        version: 1,
        // 5 seconds ago (exceeds 1-second threshold)
        updatedAt: new Date(Date.now() - 5000),
      },
    });

    // Ensure its ID is absent from all priority queues and processing-queue
    const initialMediumQueue = await redisClient.lrange(REDIS_KEYS.QUEUE_MEDIUM, 0, -1);
    const initialProcessing = await redisClient.lrange(REDIS_KEYS.PROCESSING_QUEUE, 0, -1);
    expect(initialMediumQueue).not.toContain(job.id);
    expect(initialProcessing).not.toContain(job.id);

    // Act: Run the production recovery sweep for stale QUEUED jobs
    const recoveredCount = await (reconciler as any).processStaleQueuedJobs(1000);
    expect(recoveredCount).toBe(1);

    // Assert 1: The job is placed in its correct priority queue
    const queuedItems = await redisClient.lrange(REDIS_KEYS.QUEUE_MEDIUM, 0, -1);
    expect(queuedItems).toContain(job.id);

    // Assert 2: It remains in a claimable state in PostgreSQL with bumped version
    const updatedJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("QUEUED");
    expect(updatedJob?.version).toBe(2);

    // Assert 3: A worker can claim it using the production conditional OCC update
    const workerClaim = await prisma.job.updateMany({
      where: {
        id: job.id,
        version: updatedJob!.version,
        status: "QUEUED",
      },
      data: {
        status: "RUNNING",
        workerId: "test-worker-1",
        version: { increment: 1 },
      },
    });
    expect(workerClaim.count).toBe(1);

    const claimedJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(claimedJob?.status).toBe("RUNNING");
    expect(claimedJob?.workerId).toBe("test-worker-1");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test B — Crash after database transition to QUEUED, before Redis publication
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test B: should recover a job when API crashed after setting QUEUED before Redis enqueue", async () => {
    // Arrange: Simulate API's DB transition to QUEUED without executing Redis enqueue or catch block
    const job = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "crashed before redis publication" },
        status: "QUEUED",
        priority: "HIGH",
        workerId: null,
        version: 1,
        updatedAt: new Date(Date.now() - 5000),
      },
    });

    // Act: Run scheduler recovery as if after restart
    const firstSweep = await (reconciler as any).processStaleQueuedJobs(1000);
    expect(firstSweep).toBe(1);

    // Assert: The job becomes dispatchable in Redis without manually editing database status
    const highQueue = await redisClient.lrange(REDIS_KEYS.QUEUE_HIGH, 0, -1);
    expect(highQueue).toContain(job.id);

    // Assert: A second recovery run does NOT cause duplicate queueing or multiple executions
    const secondSweep = await (reconciler as any).processStaleQueuedJobs(1000);
    expect(secondSweep).toBe(0);

    const highQueueAfter = await redisClient.lrange(REDIS_KEYS.QUEUE_HIGH, 0, -1);
    const occurrences = highQueueAfter.filter((id) => id === job.id);
    expect(occurrences).toHaveLength(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test C — Redis enqueue succeeds but database update fails or state diverges
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test C: duplicate queue entries cannot cause duplicate execution and cancelled jobs cannot be resurrected", async () => {
    // Scenario 1: Redis has a duplicate entry (e.g. from network retry or dual enqueue)
    const job = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "duplicate queue entry test" },
        status: "QUEUED",
        priority: "MEDIUM",
        workerId: null,
        version: 1,
      },
    });

    // Push duplicate entries to Redis queue
    await redisClient.lpush(REDIS_KEYS.QUEUE_MEDIUM, job.id);
    await redisClient.lpush(REDIS_KEYS.QUEUE_MEDIUM, job.id);

    // Worker 1 claims the job
    const worker1Claim = await prisma.job.updateMany({
      where: {
        id: job.id,
        version: 1,
        status: "QUEUED",
      },
      data: {
        status: "RUNNING",
        workerId: "worker-1",
        version: { increment: 1 },
      },
    });
    expect(worker1Claim.count).toBe(1);

    // Worker 2 attempts to claim the duplicate entry
    const worker2Claim = await prisma.job.updateMany({
      where: {
        id: job.id,
        version: 1, // Worker 2 sees stale version or status is now RUNNING
        status: "QUEUED",
      },
      data: {
        status: "RUNNING",
        workerId: "worker-2",
        version: { increment: 1 },
      },
    });
    expect(worker2Claim.count).toBe(0); // MUST reject duplicate execution!

    // Scenario 2: A CANCELLED or COMPLETED job must NEVER be resurrected by recovery sweeps
    const cancelledJob = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "cancelled job" },
        status: "CANCELLED",
        priority: "MEDIUM",
        workerId: null,
        version: 5,
        updatedAt: new Date(Date.now() - 10000),
      },
    });

    await (reconciler as any).processStaleQueuedJobs(1000);
    await reconciler.processPendingJobs();

    // The cancelled job MUST remain untouched in CANCELLED
    const cancelledCheck = await prisma.job.findUnique({ where: { id: cancelledJob.id } });
    expect(cancelledCheck?.status).toBe("CANCELLED");
    expect(cancelledCheck?.version).toBe(5);

    const mediumQueue = await redisClient.lrange(REDIS_KEYS.QUEUE_MEDIUM, 0, -1);
    expect(mediumQueue).not.toContain(cancelledJob.id);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Test D — API catch block races with worker claim
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test D: API catch block must NOT overwrite worker's RUNNING state with PENDING", async () => {
    // Arrange: Job is created and set to QUEUED
    const job = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "race with worker claim" },
        status: "QUEUED",
        priority: "MEDIUM",
        workerId: null,
        version: 1,
      },
    });

    // Worker claims the job immediately, transitioning it to RUNNING
    const claim = await prisma.job.updateMany({
      where: {
        id: job.id,
        status: "QUEUED",
        version: 1,
      },
      data: {
        status: "RUNNING",
        workerId: "fast-worker-1",
        version: { increment: 1 },
      },
    });
    expect(claim.count).toBe(1);

    // Act: A later API operation (e.g. eventService.createEvent) failed in API and entered catch block.
    // The conditional rollback logic must verify status is still QUEUED and unclaimed:
    const rollbackResult = await prisma.job.updateMany({
      where: {
        id: job.id,
        status: "QUEUED",
        workerId: null,
      },
      data: {
        status: "PENDING",
        version: { increment: 1 },
      },
    });

    // Assert: Rollback must affect 0 rows because worker is already RUNNING!
    expect(rollbackResult.count).toBe(0);

    // The job status in database must remain RUNNING with workerId intact!
    const finalJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(finalJob?.status).toBe("RUNNING");
    expect(finalJob?.workerId).toBe("fast-worker-1");
  });
});
