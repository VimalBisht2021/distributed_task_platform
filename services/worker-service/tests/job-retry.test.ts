import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { redisClient } from "../src/redis/redisClient";
import { processOneJob } from "../src/worker";

const prisma = new PrismaClient();

// Mock the processor to FAIL so we can test the Retry Orchestration
vi.mock("../src/processors/job.processor", () => ({
  processJob: vi.fn().mockRejectedValue(new Error("Processor failure")),
}));

describe("Worker Retry Flow", () => {
  const workerId = "test-worker-retry";
  let testJobId: string;

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
        retryCount: 0,
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

  it("should schedule retry when processor fails", async () => {
    // Act
    const processed = await processOneJob(workerId);
    
    // Process returns false when an error occurs during processing loop (caught in catch block)
    expect(processed).toBe(false);

    // Assert DB State
    const updatedJob = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(updatedJob?.status).toBe("RETRYING");
    expect(updatedJob?.retryCount).toBe(1);
    expect(updatedJob?.workerId).toBeNull(); 
    expect(updatedJob?.failureReason).toBe("Processor failure");
    
    // Assert nextRetryAt
    expect(updatedJob?.nextRetryAt).not.toBeNull();
    expect(updatedJob!.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());

    // Assert No Result Created
    const result = await prisma.result.findUnique({ where: { jobId: testJobId } });
    expect(result).toBeNull();

    // Assert Event Logging and Payloads
    const events = await prisma.jobEvent.findMany({ where: { jobId: testJobId } });
    
    expect(events.some(e => e.eventType === "JOB_STARTED")).toBe(true);
    
    const retryEvent = events.find(e => e.eventType === "JOB_RETRY_SCHEDULED");
    expect(retryEvent).toBeDefined();
    expect(events.filter(e => e.eventType === "JOB_RETRY_SCHEDULED")).toHaveLength(1);
    
    expect(retryEvent?.details).toMatchObject({
      retryCount: 1,
      reason: "Processor failure",
    });

    // Assert Redis Queue Cleanup 
    const processingJobs = await redisClient.lrange("processing-queue", 0, -1);
    expect(processingJobs).not.toContain(testJobId);
  });
});
