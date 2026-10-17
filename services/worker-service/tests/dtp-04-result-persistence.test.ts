import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { redisClient } from "../src/redis/redisClient";
import { processOneJob, prisma } from "../src/worker";

let onProcessingHook: ((jobId: string) => Promise<void>) | null = null;

vi.mock("../src/processors/job.processor", () => ({
  processJob: vi.fn().mockImplementation(async (jobId) => {
    if (onProcessingHook) {
      await onProcessingHook(jobId);
    }
    return {
      resultType: "JSON",
      payload: { output: "zombie output" },
    };
  }),
}));

describe("DTP-04: Result Persistence Atomicity", () => {
  const workerId = "test-worker-dtp04";
  let testJobId: string;

  beforeEach(async () => {
    onProcessingHook = null;
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
      },
    });

    const job = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { text: "dtp04 test" },
        status: "QUEUED",
        version: 1,
      },
    });
    testJobId = job.id;
  });

  afterEach(async () => {
    onProcessingHook = null;
    await redisClient.del("main-queue");
    await redisClient.del("processing-queue");
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();
  });

  it("should NOT persist results if worker ownership is lost before completion", async () => {
    await redisClient.lpush("main-queue", testJobId);

    // Simulate scheduler recovery or another worker reassigning the job during processing
    onProcessingHook = async (jobId: string) => {
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "RETRYING",
          workerId: null,
          version: { increment: 1 },
        },
      });
    };

    const success = await processOneJob(workerId);
    expect(success).toBe(false);

    // CRITICAL ASSERTION: The result record MUST NOT exist in PostgreSQL
    const persistedResult = await prisma.result.findUnique({
      where: { jobId: testJobId },
    });
    expect(persistedResult).toBeNull();

    // Verify job remains in RETRYING state
    const job = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(job?.status).toBe("RETRYING");
  });
});
