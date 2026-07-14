import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { redisClient } from "../src/redis/redisClient";
import { processOneJob } from "../src/worker";

const prisma = new PrismaClient();

// Mock the processor to FAIL so we can test the DLQ Orchestration
vi.mock("../src/processors/job.processor", () => ({
  processJob: vi.fn().mockRejectedValue(new Error("Fatal DLQ failure")),
}));

describe("Worker DLQ Flow", () => {
  const workerId = "test-worker-dlq";
  let testJobId: string;
  const MAX_RETRIES = 4; // Should match MAX_RETRIES in worker.ts

  beforeEach(async () => {
    await redisClient.del("main-queue");
    await redisClient.del("processing-queue");

    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();

    await prisma.user.upsert({
      where: { id: "test-user-1" },
      update: {},
      create: {
        id: "test-user-1",
        email: "test@example.com",
        passwordHash: "hash",
      }
    });

    const job = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "hello world" },
        status: "QUEUED",
        progress: 0,
        retryCount: MAX_RETRIES, // Max retries exhausted
      }
    });
    testJobId = job.id;

    await redisClient.lpush("main-queue", testJobId);
  });

  afterEach(async () => {
    await redisClient.del("main-queue");
    await redisClient.del("processing-queue");
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();
  });

  it("should move job to DLQ when max retries exceeded", async () => {
    // Act
    const processed = await processOneJob(workerId);
    expect(processed).toBe(false);

    // Assert DB State
    const updatedJob = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(updatedJob?.status).toBe("FAILED");
    expect(updatedJob?.retryCount).toBe(MAX_RETRIES);
    expect(updatedJob?.workerId).toBeNull(); 
    expect(updatedJob?.failureReason).toBe("Fatal DLQ failure");

    // Assert No Result Created
    const result = await prisma.result.findUnique({ where: { jobId: testJobId } });
    expect(result).toBeNull();

    // Assert Event Logging and Payloads
    const events = await prisma.jobEvent.findMany({ where: { jobId: testJobId } });
    
    expect(events.some(e => e.eventType === "JOB_STARTED")).toBe(true);
    
    const dlqEvent = events.find(e => e.eventType === "JOB_DLQ");
    expect(dlqEvent).toBeDefined();
    expect(dlqEvent?.details).toMatchObject({
      retries: MAX_RETRIES,
      reason: "Fatal DLQ failure",
    });

    const failEvent = events.find(e => e.eventType === "JOB_FAILED");
    expect(failEvent).toBeDefined();
    expect(failEvent?.details).toMatchObject({
      retries: MAX_RETRIES,
      reason: "Fatal DLQ failure",
    });

    // Ensure we don't accidentally emit retry
    const retryEvents = events.filter(e => e.eventType === "JOB_RETRY_SCHEDULED");
    expect(retryEvents).toHaveLength(0);

    // Assert Redis Queue Cleanup 
    const processingJobs = await redisClient.lrange("processing-queue", 0, -1);
    expect(processingJobs).not.toContain(testJobId);
  });
});
