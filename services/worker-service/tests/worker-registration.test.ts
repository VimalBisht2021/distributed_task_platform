import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkerService } from "../src/services/worker.service";
import { redisClient } from "../src/redis/redisClient";

describe("Worker Registration", () => {
  const workerService = new WorkerService();
  const workerId = "test-worker-1";

  beforeEach(async () => {
    await redisClient.del(`worker:${workerId}`);
    await redisClient.srem("workers:active", workerId);
  });

  afterEach(async () => {
    await redisClient.del(`worker:${workerId}`);
    await redisClient.srem("workers:active", workerId);
  });

  it("should register worker with heartbeat ttl", async () => {
    await workerService.registerWorker(workerId);

    const workers = await redisClient.smembers("workers:active");
    expect(workers).toContain(workerId);

    const workerData = await redisClient.get(`worker:${workerId}`);
    expect(workerData).not.toBeNull();

    const parsed = JSON.parse(workerData!);
    expect(parsed.workerId).toBe(workerId);
    expect(parsed.status).toBe("ACTIVE");
    expect(parsed.capacity).toBe(1);
    expect(parsed.currentLoad).toBe(0);
    expect(parsed.startedAt).toBeTypeOf("number");

    const ttl = await redisClient.ttl(`worker:${workerId}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });

  it("should not create duplicate active workers", async () => {
    await workerService.registerWorker(workerId);
    await workerService.registerWorker(workerId);

    const workers = await redisClient.smembers("workers:active");
    const count = workers.filter((w) => w === workerId).length;
    expect(count).toBe(1);
  });
});