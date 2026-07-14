import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("Zombie Worker Database OCC", () => {
  let testJobId: string;

  beforeEach(async () => {
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
        version: 0,
        retryCount: 0,
      }
    });
    testJobId = job.id;
  });

  afterEach(async () => {
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();
  });

  it("should block stale worker from overwriting recovered job", async () => {
    // 1. Simulate Worker A loading the job
    const snapshot = await prisma.job.findUnique({ where: { id: testJobId } });
    const staleVersion = snapshot!.version;
    const workerA = "worker-a";

    // 2. Simulate Scheduler Recovery (assigns to worker-b and bumps version)
    await prisma.job.update({
      where: { id: testJobId },
      data: {
        status: "RUNNING",
        workerId: "worker-b",
        version: { increment: 1 },
      }
    });

    // 3. Simulate Worker B Completing the job
    await prisma.job.update({
      where: { id: testJobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        workerId: null,
        version: { increment: 1 },
      }
    });

    await prisma.result.create({
      data: {
        jobId: testJobId,
        resultType: "TEXT",
        resultUrl: "/results/dummy.json",
        size: 100,
      }
    });
    
    await prisma.jobEvent.create({
      data: {
        jobId: testJobId,
        eventType: "JOB_COMPLETED",
        workerId: "worker-b",
      }
    });

    // 4. Simulate Zombie Worker A trying to complete the job
    const zombieResult = await prisma.job.updateMany({
      where: {
        id: testJobId,
        version: staleVersion, // Stale version!
        workerId: workerA,
      },
      data: {
        status: "COMPLETED",
        version: { increment: 1 },
      }
    });

    // Assertion 1: OCC rejected the update entirely
    expect(zombieResult.count).toBe(0);

    // Assertion 2: Verify DB State Unchanged (Version remains 2, not 3)
    const finalJob = await prisma.job.findUnique({ where: { id: testJobId } });
    expect(finalJob?.status).toBe("COMPLETED");
    expect(finalJob?.version).toBe(2);

    // Assertion 3: No duplicate results were inserted
    const results = await prisma.result.findMany({ where: { jobId: testJobId } });
    expect(results).toHaveLength(1);

    // Assertion 4: No duplicate events were inserted
    const events = await prisma.jobEvent.findMany({ where: { jobId: testJobId } });
    const completedEvents = events.filter(e => e.eventType === "JOB_COMPLETED");
    expect(completedEvents).toHaveLength(1);
  });
});
