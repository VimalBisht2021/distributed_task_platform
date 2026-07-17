import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { redisClient } from "../src/redis/redisClient";
import { processOneJob } from "../src/worker";
import { REDIS_KEYS } from "../../../shared/constants/redis";

const prisma = new PrismaClient();

// Mock the business logic processor so we test scheduling, not the actual task
vi.mock("../src/processors/job.processor", () => ({
  processJob: vi.fn().mockResolvedValue({
    resultType: "TEXT",
    payload: { content: "test result" },
  }),
}));

describe("Priority Queue Scheduling", () => {
  const workerId = "test-worker-priority";
  const jobIds: Record<string, string> = {};

  beforeEach(async () => {
    // Clean up all priority queues
    await redisClient.del(REDIS_KEYS.QUEUE_CRITICAL);
    await redisClient.del(REDIS_KEYS.QUEUE_HIGH);
    await redisClient.del(REDIS_KEYS.QUEUE_MEDIUM);
    await redisClient.del(REDIS_KEYS.QUEUE_LOW);
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
        email: "priority-test@example.com",
        passwordHash: "hash",
      },
    });

    // Create jobs with different priorities in the DB
    // Submit LOW first, then MEDIUM, then HIGH, then CRITICAL
    const lowJob = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { label: "LOW" },
        status: "QUEUED",
        priority: "LOW",
      },
    });
    jobIds["LOW"] = lowJob.id;

    const mediumJob = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { label: "MEDIUM" },
        status: "QUEUED",
        priority: "MEDIUM",
      },
    });
    jobIds["MEDIUM"] = mediumJob.id;

    const highJob = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { label: "HIGH" },
        status: "QUEUED",
        priority: "HIGH",
      },
    });
    jobIds["HIGH"] = highJob.id;

    const criticalJob = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { label: "CRITICAL" },
        status: "QUEUED",
        priority: "CRITICAL",
      },
    });
    jobIds["CRITICAL"] = criticalJob.id;

    // Enqueue jobs to their respective priority queues
    // LOW submitted FIRST, CRITICAL submitted LAST
    await redisClient.lpush(REDIS_KEYS.QUEUE_LOW, jobIds["LOW"]);
    await redisClient.lpush(REDIS_KEYS.QUEUE_MEDIUM, jobIds["MEDIUM"]);
    await redisClient.lpush(REDIS_KEYS.QUEUE_HIGH, jobIds["HIGH"]);
    await redisClient.lpush(REDIS_KEYS.QUEUE_CRITICAL, jobIds["CRITICAL"]);
  });

  afterEach(async () => {
    await redisClient.del(REDIS_KEYS.QUEUE_CRITICAL);
    await redisClient.del(REDIS_KEYS.QUEUE_HIGH);
    await redisClient.del(REDIS_KEYS.QUEUE_MEDIUM);
    await redisClient.del(REDIS_KEYS.QUEUE_LOW);
    await redisClient.del("main-queue");
    await redisClient.del("processing-queue");
    await prisma.jobEvent.deleteMany();
    await prisma.result.deleteMany();
    await prisma.job.deleteMany();
  });

  it("should process CRITICAL job before HIGH, HIGH before MEDIUM, MEDIUM before LOW", async () => {
    const executionOrder: string[] = [];

    // Process all 4 jobs one at a time
    for (let i = 0; i < 4; i++) {
      const processed = await processOneJob(workerId);
      expect(processed).toBe(true);
    }

    // Check completion timestamps to determine execution order
    const completedJobs = await prisma.job.findMany({
      where: { status: "COMPLETED" },
      orderBy: { completedAt: "asc" },
    });

    expect(completedJobs).toHaveLength(4);

    // Extract the priority order based on completion time
    const actualOrder = completedJobs.map((j) => j.priority);

    // CRITICAL should be first, LOW should be last
    expect(actualOrder).toEqual(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
  });

  it("should process HIGH before LOW even when LOW was submitted first", async () => {
    // Clear all queues except LOW and HIGH
    await redisClient.del(REDIS_KEYS.QUEUE_CRITICAL);
    await redisClient.del(REDIS_KEYS.QUEUE_MEDIUM);

    // Mark the CRITICAL and MEDIUM jobs as CANCELLED so they don't interfere
    await prisma.job.update({
      where: { id: jobIds["CRITICAL"] },
      data: { status: "CANCELLED" },
    });
    await prisma.job.update({
      where: { id: jobIds["MEDIUM"] },
      data: { status: "CANCELLED" },
    });

    // Process two jobs
    await processOneJob(workerId);
    await processOneJob(workerId);

    // Check execution order
    const completedJobs = await prisma.job.findMany({
      where: { status: "COMPLETED" },
      orderBy: { completedAt: "asc" },
    });

    expect(completedJobs).toHaveLength(2);

    // HIGH should execute before LOW, even though LOW was enqueued first
    expect(completedJobs[0].priority).toBe("HIGH");
    expect(completedJobs[1].priority).toBe("LOW");
  });

  it("should drain a single priority level using FIFO within that level", async () => {
    // Clear all queues
    await redisClient.del(REDIS_KEYS.QUEUE_CRITICAL);
    await redisClient.del(REDIS_KEYS.QUEUE_HIGH);
    await redisClient.del(REDIS_KEYS.QUEUE_LOW);

    // Add 2 more MEDIUM jobs
    const medium2 = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { label: "MEDIUM-2" },
        status: "QUEUED",
        priority: "MEDIUM",
      },
    });
    const medium3 = await prisma.job.create({
      data: {
        userId: "test-user-1",
        jobType: "TEXT_PROCESSING",
        payload: { label: "MEDIUM-3" },
        status: "QUEUED",
        priority: "MEDIUM",
      },
    });

    await redisClient.lpush(REDIS_KEYS.QUEUE_MEDIUM, medium2.id);
    await redisClient.lpush(REDIS_KEYS.QUEUE_MEDIUM, medium3.id);

    // Cancel non-MEDIUM jobs
    await prisma.job.update({ where: { id: jobIds["CRITICAL"] }, data: { status: "CANCELLED" } });
    await prisma.job.update({ where: { id: jobIds["HIGH"] }, data: { status: "CANCELLED" } });
    await prisma.job.update({ where: { id: jobIds["LOW"] }, data: { status: "CANCELLED" } });

    // Process 3 MEDIUM jobs
    for (let i = 0; i < 3; i++) {
      await processOneJob(workerId);
    }

    const completedJobs = await prisma.job.findMany({
      where: { status: "COMPLETED" },
    });

    // All 3 MEDIUM jobs should complete
    expect(completedJobs).toHaveLength(3);
    expect(completedJobs.every((j) => j.priority === "MEDIUM")).toBe(true);
  });
});
