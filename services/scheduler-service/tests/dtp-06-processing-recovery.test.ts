import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { RecoveryService } from "../src/services/recovery.service";
import { redisClient } from "../src/redis/redisClient";
import { REDIS_KEYS } from "../src/redis/keys";

const prisma = new PrismaClient();

describe("DTP-06: Recovery of Stranded Processing Queue Entries", () => {
  const recoveryService = new RecoveryService();
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
        payload: { text: "dtp-06 test" },
        status: "QUEUED",
        priority: "HIGH",
        progress: 0,
        retryCount: 0,
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

  it("should clean up non-existent job IDs from processing-queue", async () => {
    const ghostJobId = "00000000-0000-0000-0000-000000000000";
    await redisClient.lpush(REDIS_KEYS.PROCESSING_QUEUE, ghostJobId);

    const recovered = await recoveryService.recoverProcessingQueue(0);
    expect(recovered).toBe(1);

    const remaining = await redisClient.lrange(REDIS_KEYS.PROCESSING_QUEUE, 0, -1);
    expect(remaining).not.toContain(ghostJobId);
  });

  it("should clean up terminal jobs (COMPLETED/CANCELLED) lingering in processing-queue", async () => {
    await prisma.job.update({
      where: { id: testJobId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    await redisClient.lpush(REDIS_KEYS.PROCESSING_QUEUE, testJobId);

    const recovered = await recoveryService.recoverProcessingQueue(0);
    expect(recovered).toBe(1);

    const remaining = await redisClient.lrange(REDIS_KEYS.PROCESSING_QUEUE, 0, -1);
    expect(remaining).not.toContain(testJobId);
  });

  it("should re-enqueue a QUEUED job stranded in processing-queue after worker crash", async () => {
    // Simulate RPOPLPUSH moving job to processing-queue, and worker crashing before claim
    await redisClient.lpush(REDIS_KEYS.PROCESSING_QUEUE, testJobId);

    // Job is QUEUED, workerId is null
    const recovered = await recoveryService.recoverProcessingQueue(0);
    expect(recovered).toBe(1);

    // Must be removed from processing-queue
    const processing = await redisClient.lrange(REDIS_KEYS.PROCESSING_QUEUE, 0, -1);
    expect(processing).not.toContain(testJobId);

    // Must be re-enqueued to priority queue (QUEUE_HIGH since priority is HIGH)
    const highQueue = await redisClient.lrange(REDIS_KEYS.QUEUE_HIGH, 0, -1);
    expect(highQueue).toContain(testJobId);
  });
});
