import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { RetryService } from "../src/services/retry.service";
import { redisClient } from "../src/redis/redisClient";
import { REDIS_KEYS } from "../src/redis/keys";

const prisma = new PrismaClient();

describe("Retry Poller / Virtual Queue", () => {
  const retryService = new RetryService();
  let testJobId: string;

  beforeEach(async () => {
    await redisClient.del(REDIS_KEYS.QUEUE_MEDIUM);
    await redisClient.del(REDIS_KEYS.PROCESSING_QUEUE);

    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();

    await prisma.user.upsert({
      where: { id: "test-user-1" },
      update: {},
      create: { id: "test-user-1", email: "test@example.com", passwordHash: "hash" }
    });

    // Seed a job in RETRYING state with a nextRetryAt in the past
    const job = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "hello world" },
        status: "RETRYING",
        progress: 0,
        retryCount: 1,
        // Set it 1 minute in the past so the poller picks it up
        nextRetryAt: new Date(Date.now() - 60000),
      }
    });
    testJobId = job.id;
  });

  afterEach(async () => {
    await redisClient.del(REDIS_KEYS.QUEUE_MEDIUM);
    await redisClient.del(REDIS_KEYS.PROCESSING_QUEUE);
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();
  });

  it("should transition mature retrying jobs back to QUEUED and push to Redis main-queue", async () => {
    // Act
    const processedCount = await retryService.processRetries();
    
    // Assert
    expect(processedCount).toBe(1);

    // Verify DB State
    const updatedJob = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(updatedJob?.status).toBe("QUEUED");
    expect(updatedJob?.nextRetryAt).toBeNull();
    
    // Verify Redis State
    const mainQueue = await redisClient.lrange(REDIS_KEYS.QUEUE_MEDIUM, 0, -1);
    expect(mainQueue).toContain(testJobId);

    // Verify Events
    const events = await prisma.jobEvent.findMany({ where: { jobId: testJobId } });
    const requeuedEvents = events.filter(e => e.eventType === "JOB_REQUEUED");
    expect(requeuedEvents).toHaveLength(1);
    expect(requeuedEvents[0].details).toMatchObject({ retryCount: 1 });
  });

  it("should NOT pick up jobs that haven't reached nextRetryAt yet", async () => {
    // Change job to be 1 minute in the future
    await prisma.job.update({
      where: { id: testJobId },
      data: { nextRetryAt: new Date(Date.now() + 60000) }
    });

    const processedCount = await retryService.processRetries();
    expect(processedCount).toBe(0);

    const mainQueue = await redisClient.lrange(REDIS_KEYS.QUEUE_MEDIUM, 0, -1);
    expect(mainQueue).not.toContain(testJobId);
  });
});
