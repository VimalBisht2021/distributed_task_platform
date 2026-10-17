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

    await expect(retryService.processRetries()).rejects.toThrow("Redis connection dropped");

    // The job MUST NOT remain stuck in QUEUED without a queue entry!
    const job = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(job?.status).toBe("RETRYING");
    expect(job?.nextRetryAt).toBeDefined();

    enqueueSpy.mockRestore();
  });
});
