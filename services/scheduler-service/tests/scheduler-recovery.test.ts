import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { RecoveryService } from "../src/services/recovery.service";
import { redisClient } from "../src/redis/redisClient";
import { REDIS_KEYS } from "../src/redis/keys";

const prisma = new PrismaClient();

describe("Scheduler Recovery Service", () => {
  const recoveryService = new RecoveryService();
  const workerId = "dead-worker-1";
  let testJobId: string;

  beforeEach(async () => {
    await redisClient.del(REDIS_KEYS.MAIN_QUEUE);
    await redisClient.del(REDIS_KEYS.PROCESSING_QUEUE);

    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();

    await prisma.user.upsert({
      where: { id: "test-user-1" },
      update: {},
      create: { id: "test-user-1", email: "test@example.com", passwordHash: "hash" }
    });

    // Seed a job in RUNNING state belonging to our soon-to-be dead worker
    const job = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "hello world" },
        status: "RUNNING", // Actively processing
        workerId: workerId,
        progress: 50,
        retryCount: 0,
        version: 1,
      }
    });
    testJobId = job.id;

    // Must exist in processing queue!
    await redisClient.lpush(REDIS_KEYS.PROCESSING_QUEUE, testJobId);
  });

  afterEach(async () => {
    await redisClient.del(REDIS_KEYS.MAIN_QUEUE);
    await redisClient.del(REDIS_KEYS.PROCESSING_QUEUE);
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();
  });

  it("should recover jobs from a dead worker and transition them to RETRYING", async () => {
    // Act
    const recoveredCount = await recoveryService.recoverWorkerJobs(workerId);
    
    // Assert
    expect(recoveredCount).toBe(1);

    // Verify DB State
    const updatedJob = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(updatedJob?.status).toBe("RETRYING");
    expect(updatedJob?.workerId).toBeNull();
    // Verify OCC bump
    expect(updatedJob?.version).toBe(2);
    
    // Verify Redis State
    const processingQueue = await redisClient.lrange(REDIS_KEYS.PROCESSING_QUEUE, 0, -1);
    expect(processingQueue).not.toContain(testJobId);

    // Verify Events
    const events = await prisma.jobEvent.findMany({ where: { jobId: testJobId } });
    const recoveryEvents = events.filter(e => e.eventType === "JOB_RECOVERED");
    expect(recoveryEvents).toHaveLength(1);
    expect(recoveryEvents[0].details).toMatchObject({ workerId });
  });

  it("should not recover jobs from a healthy worker", async () => {
    // Act with wrong worker ID
    const recoveredCount = await recoveryService.recoverWorkerJobs("healthy-worker-2");
    
    // Assert
    expect(recoveredCount).toBe(0);

    // DB state should remain untouched
    const updatedJob = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(updatedJob?.status).toBe("RUNNING");
    expect(updatedJob?.workerId).toBe(workerId);
    expect(updatedJob?.version).toBe(1);

    // Processing queue should still have it
    const processingQueue = await redisClient.lrange(REDIS_KEYS.PROCESSING_QUEUE, 0, -1);
    expect(processingQueue).toContain(testJobId);
  });
});
