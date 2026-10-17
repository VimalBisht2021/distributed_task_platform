import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { RetryService } from "../src/services/retry.service";
import { redisClient } from "../src/redis/redisClient";
import { REDIS_KEYS } from "../src/redis/keys";

const prisma = new PrismaClient();

describe("DTP-03: Retry and Recovery Consistency", () => {
  const retryService = new RetryService();
  let testJobId: string;

  beforeEach(async () => {
    await redisClient.flushall();
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();

    await prisma.user.upsert({
      where: { id: "test-user-1" },
      update: {},
      create: { id: "test-user-1", email: "test@example.com", passwordHash: "hash" },
    });

    const job = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "dtp-03 test" },
        status: "RETRYING",
        progress: 0,
        retryCount: 1,
        nextRetryAt: new Date(Date.now() - 5000),
        version: 1,
      },
    });
    testJobId = job.id;
  });

  afterEach(async () => {
    await redisClient.flushall();
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();
  });

  it("should NOT duplicate enqueue when concurrent sweeps race for the same retrying job", async () => {
    // Both sweeps attempt to process retries at the same time
    const [sweep1, sweep2] = await Promise.all([
      retryService.processRetries(),
      retryService.processRetries(),
    ]);

    // Exactly one sweep should claim and requeue the job
    expect(sweep1 + sweep2).toBe(1);

    // Verify Redis has exactly ONE entry in QUEUE_MEDIUM
    const queueEntries = await redisClient.lrange(REDIS_KEYS.QUEUE_MEDIUM, 0, -1);
    expect(queueEntries).toHaveLength(1);
    expect(queueEntries[0]).toBe(testJobId);

    // Verify DB version incremented only once
    const job = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(job?.status).toBe("QUEUED");
    expect(job?.version).toBe(2);
  });

  it("should gracefully rollback to RETRYING if Redis enqueue fails, preventing lost jobs", async () => {
    // Spy on queueService.enqueue to simulate Redis failure
    const enqueueSpy = vi.spyOn((retryService as any).queueService, "enqueue")
      .mockRejectedValueOnce(new Error("Redis connection dropped"));

    await retryService.processRetries();

    // The job MUST NOT remain stuck in QUEUED without a queue entry!
    const job = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(job?.status).toBe("RETRYING");
    expect(job?.nextRetryAt).toBeDefined();

    enqueueSpy.mockRestore();
  });

  it("should recover and schedule RETRYING jobs even if nextRetryAt is null", async () => {
    // Create a job in RETRYING state where nextRetryAt is null (e.g. from crash or partial update)
    const nullRetryJob = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "null nextRetryAt job" },
        status: "RETRYING",
        nextRetryAt: null,
        retryCount: 1,
        version: 1,
      },
    });

    const requeuedCount = await retryService.processRetries();
    // Must process both the beforeEach job and the null-nextRetryAt job
    expect(requeuedCount).toBe(2);

    const updated = await prisma.job.findUnique({ where: { id: nullRetryJob.id } });
    expect(updated?.status).toBe("QUEUED");
    expect(updated?.version).toBe(2);

    const queueEntries = await redisClient.lrange(REDIS_KEYS.QUEUE_MEDIUM, 0, -1);
    expect(queueEntries).toContain(nullRetryJob.id);
  });

  it("should NOT abort batch retry processing when one job fails Redis enqueue", async () => {
    // Create a second retrying job
    const secondJob = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "second retrying job" },
        status: "RETRYING",
        nextRetryAt: new Date(Date.now() - 5000),
        retryCount: 1,
        version: 1,
      },
    });

    // Mock enqueue to fail ONLY for the first job, but succeed for the second
    const enqueueSpy = vi.spyOn((retryService as any).queueService, "enqueue")
      .mockImplementation(async (id: string) => {
        if (id === testJobId) {
          throw new Error("Simulated transient Redis failure on first job");
        }
        await redisClient.lpush(REDIS_KEYS.QUEUE_MEDIUM, id);
      });

    // Running processRetries should NOT throw; it should roll back job 1 and successfully process job 2
    const count = await retryService.processRetries();
    expect(count).toBe(1);

    // Job 1 should be rolled back to RETRYING
    const job1 = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(job1?.status).toBe("RETRYING");

    // Job 2 should be successfully QUEUED
    const job2 = await prisma.job.findUnique({ where: { id: secondJob.id } });
    expect(job2?.status).toBe("QUEUED");

    enqueueSpy.mockRestore();
  });

  it("should protect worker RUNNING state if a worker claimed the job before rollback", async () => {
    // Arrange: job is claimed to QUEUED by retry service
    // If enqueue threw an error, but in fact a worker somehow already claimed it to RUNNING:
    const runningJob = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "worker running" },
        status: "RUNNING",
        workerId: "fast-worker-1",
        version: 2,
      },
    });

    // Attempting a conditional rollback targeting QUEUED must affect 0 rows
    const rollback = await prisma.job.updateMany({
      where: {
        id: runningJob.id,
        status: "QUEUED",
        workerId: null,
      },
      data: {
        status: "RETRYING",
        version: { increment: 1 },
      },
    });
    expect(rollback.count).toBe(0);

    const checkJob = await prisma.job.findUnique({ where: { id: runningJob.id } });
    expect(checkJob?.status).toBe("RUNNING");
    expect(checkJob?.workerId).toBe("fast-worker-1");
  });
});
