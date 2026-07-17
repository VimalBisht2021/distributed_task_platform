import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { redisClient } from "../src/redis/redisClient";
import { processOneJob } from "../src/worker";

const prisma = new PrismaClient();

// Top level mock to simulate a race condition during processor execution
vi.mock("../src/processors/job.processor", () => {
  const { PrismaClient } = require("@prisma/client");
  const innerPrisma = new PrismaClient();
  
  return {
    processJob: vi.fn().mockImplementation(async (jobId) => {
      // Simulate another worker successfully taking over and completing the job while we are processing
      await innerPrisma.job.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          workerId: null,
          version: { increment: 1 },
        }
      });
      
      await innerPrisma.result.create({
        data: {
          jobId,
          resultType: "TEXT",
          resultUrl: "/results/worker-b.json",
          size: 10,
        }
      });
      
      return { resultType: "TEXT", payload: { content: "zombie result" } };
    })
  };
});

describe("Zombie Worker Integration", () => {
  const workerId = "test-worker-zombie";
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
      create: { id: "test-user-1", email: "test@example.com", passwordHash: "hash" }
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

  it("should detect zombie worker when job is modified during processing", async () => {
    // Act
    const processed = await processOneJob(workerId);
    
    // When the worker tries to save its result, it hits a Prisma unique constraint because worker-b already created it.
    // This jumps to the catch block to retry the job.
    // The retry block's OCC check fails because worker-b incremented the version.
    // The worker cleanly aborts and returns false.
    expect(processed).toBe(false);

    // Assert DB State was NOT overwritten by zombie's retry block
    const updatedJob = await prisma.job.findUnique({ where: { id: testJobId } });
    
    // It should still be COMPLETED (by worker-b), not RETRYING
    expect(updatedJob?.status).toBe("COMPLETED");
    
    // Assert no duplicate result is generated for worker-a's content
    const results = await prisma.result.findMany({ where: { jobId: testJobId } });
    expect(results).toHaveLength(1);
    expect(results[0].resultUrl).toBe("/results/worker-b.json");
    
    // Validate we didn't emit retry events
    const events = await prisma.jobEvent.findMany({ where: { jobId: testJobId } });
    const retryEvents = events.filter(e => e.eventType === "JOB_RETRY_SCHEDULED");
    expect(retryEvents).toHaveLength(0);
  });
});
