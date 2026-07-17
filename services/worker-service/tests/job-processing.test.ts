import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { redisClient } from "../src/redis/redisClient";
import { processOneJob } from "../src/worker";

const prisma = new PrismaClient();

// Mock the business logic processor so we test worker orchestration, not the actual task
vi.mock("../src/processors/job.processor", () => ({
  processJob: vi.fn().mockResolvedValue({
    resultType: "JSON",
    payload: { text: "test result" },
  }),
}));

describe("Worker E2E Processing", () => {
  const workerId = "test-worker-e2e";
  let testJobId: string;

  beforeEach(async () => {
    // Clean up Redis
    await redisClient.del("main-queue");
    await redisClient.del("processing-queue");

    // Clean up DB
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

    // 1. Seed a job in the DB
    const job = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "hello world" },
        status: "QUEUED",
      }
    });
    testJobId = job.id;

    // 2. Seed Redis queue (mimics enqueueJob from API Service)
    await redisClient.lpush("main-queue", testJobId);
  });

  afterEach(async () => {
    await redisClient.del("main-queue");
    await redisClient.del("processing-queue");
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();
  });

  it("should orchestrate job processing successfully", async () => {
    // Act: Process exactly one job from the queue
    const processed = await processOneJob(workerId);
    
    // Assert Orchestration Returns True
    expect(processed).toBe(true);

    // Assert DB State
    const job = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(job?.status).toBe("COMPLETED");
    expect(job?.workerId).toBeNull(); 
    expect(job?.progress).toBe(100);

    // Assert Result Creation
    const result = await prisma.result.findUnique({ where: { jobId: testJobId } });
    expect(result).not.toBeNull();
    expect(result?.resultType).toBe("JSON");
    expect(result?.payload).toEqual({ text: "test result" });

    // Assert Event Logging
    const events = await prisma.jobEvent.findMany({ 
      where: { jobId: testJobId },
      orderBy: { createdAt: 'asc' } 
    });
    const eventTypes = events.map(e => e.eventType);
    expect(eventTypes).toContain("JOB_STARTED");
    expect(eventTypes).toContain("JOB_COMPLETED");

    // Assert Redis Cleanup
    const mainQueue = await redisClient.lrange("main-queue", 0, -1);
    const processingQueue = await redisClient.lrange("processing-queue", 0, -1);
    expect(mainQueue.length).toBe(0);
    expect(processingQueue.length).toBe(0);
  });
});
