import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { redisClient } from "../src/redis/redisClient";
import { processOneJob, prisma } from "../src/worker";

vi.mock("../src/processors/job.processor", () => ({
  processJob: vi.fn().mockResolvedValue({
    resultType: "JSON",
    payload: { output: "test output" },
  }),
}));

describe("DTP-01: Worker Claim Invariants", () => {
  const workerId = "test-worker-dtp01";
  let testJobId: string;

  beforeEach(async () => {
    vi.restoreAllMocks();

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
        payload: { text: "dtp01 test" },
        status: "QUEUED",
        version: 1,
      },
    });
    testJobId = job.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await redisClient.del("main-queue");
    await redisClient.del("processing-queue");
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();
  });

  it("should REJECT claiming an already COMPLETED job that lingered in Redis", async () => {
    // 1. Job is already completed in PostgreSQL
    await prisma.job.update({
      where: { id: testJobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        version: 2,
      },
    });

    // 2. Lingering or duplicate ID is in Redis queue
    await redisClient.lpush("main-queue", testJobId);

    // 3. Worker attempts to claim it
    const claimed = await processOneJob(workerId);
    expect(claimed).toBe(false);

    // 4. Assert job remains COMPLETED and was NOT overwritten to RUNNING
    const job = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(job?.status).toBe("COMPLETED");
    expect(job?.workerId).toBeNull();
  });

  it("should REJECT claiming an already CANCELLED job that lingered in Redis", async () => {
    // 1. Job was cancelled in PostgreSQL
    await prisma.job.update({
      where: { id: testJobId },
      data: {
        status: "CANCELLED",
        version: 2,
      },
    });

    // 2. ID was in Redis
    await redisClient.lpush("main-queue", testJobId);

    // 3. Worker attempts to claim
    const claimed = await processOneJob(workerId);
    expect(claimed).toBe(false);

    // 4. Assert job remains CANCELLED and was NOT overwritten to RUNNING
    const job = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(job?.status).toBe("CANCELLED");
    expect(job?.workerId).toBeNull();
  });

  it("should REJECT claiming a job when OCC version check fails", async () => {
    await redisClient.lpush("main-queue", testJobId);

    // Intercept findUnique to simulate a concurrent worker modifying the job version in PostgreSQL
    // right after snapshot read but before atomic updateMany claim executes
    const realFindUnique = prisma.job.findUnique.bind(prisma);
    vi.spyOn(prisma.job, "findUnique").mockImplementation(async (args: any) => {
      const result = await realFindUnique(args);
      // Concurrently bump version in database
      await prisma.job.update({
        where: { id: testJobId },
        data: { version: { increment: 1 } },
      });
      return result;
    });

    const claimed = await processOneJob(workerId);
    expect(claimed).toBe(false);

    // Verify job was NOT claimed by this worker
    const job = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(job?.workerId).toBeNull();
  });

  it("should NOT remove another worker's in-flight entry from processing-queue on failed claim", async () => {
    // 1. Worker B has already claimed the job and is currently RUNNING
    await prisma.job.update({
      where: { id: testJobId },
      data: {
        status: "RUNNING",
        workerId: "worker-b",
        version: 2,
      },
    });

    // 2. Worker B's entry is active in processing-queue
    await redisClient.lpush("processing-queue", testJobId);

    // 3. Stale duplicate ID exists in main-queue that Worker A pops
    await redisClient.lpush("main-queue", testJobId);

    // 4. Worker A attempts to process
    const claimed = await processOneJob("worker-a");
    expect(claimed).toBe(false);

    // 5. CRITICAL INVARIANT: Worker B's active entry in processing-queue must NOT be wiped by Worker A
    const inFlightQueue = await redisClient.lrange("processing-queue", 0, -1);
    expect(inFlightQueue).toContain(testJobId);
  });

  it("should NOT remove processing-queue entry when Worker B claims job between Worker A's read and claim attempt", async () => {
    // 1. Initial state: Job is QUEUED with version 1
    // Worker B's active in-flight processing marker is in processing-queue
    await redisClient.lpush("processing-queue", testJobId);
    await redisClient.lpush("main-queue", testJobId);

    // 2. Worker A reads PostgreSQL snapshot: status is QUEUED, version is 1.
    // Interleave right after findUnique: Worker B successfully claims the job in PostgreSQL
    const realFindUnique = prisma.job.findUnique.bind(prisma);
    vi.spyOn(prisma.job, "findUnique").mockImplementation(async (args: any) => {
      const result = await realFindUnique(args);
      // Worker B races in and claims the job before Worker A's updateMany runs
      await prisma.job.update({
        where: { id: testJobId },
        data: {
          status: "RUNNING",
          workerId: "worker-b",
          version: { increment: 1 },
        },
      });
      return result;
    });

    // 3. Worker A resumes: its updateMany with version 1 and status QUEUED fails
    const claimed = await processOneJob("worker-a");
    expect(claimed).toBe(false);

    // 4. CRITICAL INVARIANT: Worker B's entry in processing-queue MUST NOT be removed by Worker A
    const inFlightQueue = await redisClient.lrange("processing-queue", 0, -1);
    expect(inFlightQueue).toContain(testJobId);

    // Verify Worker B remains the active owner
    const job = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(job?.status).toBe("RUNNING");
    expect(job?.workerId).toBe("worker-b");
  });
});

