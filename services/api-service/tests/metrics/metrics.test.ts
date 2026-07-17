import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { prisma } from "../../src/config/prisma";
import app from "../../src/app";
import { redisClient } from "../../src/redis/client";
import { randomUUID } from "crypto";

let token: string;

beforeAll(async () => {
  await redisClient.connect();
});

afterAll(async () => {
  await redisClient.quit();
});

beforeEach(async () => {
  await prisma.jobEvent.deleteMany();
  await prisma.result.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();

  // Clear worker Redis state
  const activeWorkers = await redisClient.sMembers("workers:active");
  for (const wid of activeWorkers) {
    await redisClient.del(`worker:${wid}`);
  }
  await redisClient.del("workers:active");

  const testUser = await prisma.user.create({
    data: {
      email: `${randomUUID()}@test.com`,
      passwordHash: "fakehash",
    },
  });

  token = jwt.sign(
    { userId: testUser.id, email: testUser.email },
    process.env.JWT_SECRET!,
  );
});

afterEach(async () => {
  await prisma.jobEvent.deleteMany();
  await prisma.result.deleteMany();
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();

  const activeWorkers = await redisClient.sMembers("workers:active");
  for (const wid of activeWorkers) {
    await redisClient.del(`worker:${wid}`);
  }
  await redisClient.del("workers:active");
});

describe("GET /metrics/jobs", () => {
  it("returns job status counts", async () => {
    // Seed some jobs
    const testUser = await prisma.user.findFirst();

    await prisma.job.createMany({
      data: [
        { userId: testUser!.id, jobType: "EMAIL", status: "QUEUED", payload: {}, progress: 0, retryCount: 0 },
        { userId: testUser!.id, jobType: "EMAIL", status: "QUEUED", payload: {}, progress: 0, retryCount: 0 },
        { userId: testUser!.id, jobType: "EMAIL", status: "RUNNING", payload: {}, progress: 50, retryCount: 0 },
        { userId: testUser!.id, jobType: "EMAIL", status: "COMPLETED", payload: {}, progress: 100, retryCount: 0 },
        { userId: testUser!.id, jobType: "EMAIL", status: "FAILED", payload: {}, progress: 0, retryCount: 3 },
      ],
    });

    const response = await request(app).get("/metrics/jobs").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.queued).toBe(2);
    expect(response.body.running).toBe(1);
    expect(response.body.completed).toBe(1);
    expect(response.body.failed).toBe(1);
    expect(response.body.pending).toBe(0);
    expect(response.body.retrying).toBe(0);
  });

  it("returns all zeros when no jobs exist", async () => {
    const response = await request(app).get("/metrics/jobs").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.queued).toBe(0);
    expect(response.body.running).toBe(0);
    expect(response.body.completed).toBe(0);
    expect(response.body.failed).toBe(0);
  });
});

describe("GET /metrics/workers", () => {
  it("returns worker list and aggregate metrics", async () => {
    // Seed two workers in Redis
    const worker1 = JSON.stringify({
      workerId: "worker-1",
      status: "ACTIVE",
      capacity: 5,
      currentLoad: 2,
      startedAt: Date.now(),
    });
    const worker2 = JSON.stringify({
      workerId: "worker-2",
      status: "ACTIVE",
      capacity: 5,
      currentLoad: 3,
      startedAt: Date.now(),
    });

    await redisClient.sAdd("workers:active", "worker-1");
    await redisClient.sAdd("workers:active", "worker-2");
    await redisClient.set("worker:worker-1", worker1, { EX: 30 });
    await redisClient.set("worker:worker-2", worker2, { EX: 30 });

    const response = await request(app).get("/metrics/workers").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.activeWorkers).toBe(2);
    expect(response.body.totalCapacity).toBe(10);
    expect(response.body.currentLoad).toBe(5);
    expect(response.body.utilization).toBe(50);
    expect(response.body.workers).toHaveLength(2);
  });

  it("returns zero metrics when no workers are active", async () => {
    const response = await request(app).get("/metrics/workers").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.activeWorkers).toBe(0);
    expect(response.body.totalCapacity).toBe(0);
    expect(response.body.currentLoad).toBe(0);
    expect(response.body.utilization).toBe(0);
    expect(response.body.workers).toHaveLength(0);
  });
});
