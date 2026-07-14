import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "vitest";

import { WorkerService } from "../src/services/worker.service";
import { redisClient } from "../src/redis/redisClient";

describe("Worker Heartbeat", () => {
  const workerService = new WorkerService();
  const workerId = "heartbeat-worker";

  beforeEach(async () => {
    await redisClient.del(`worker:${workerId}`);
    await redisClient.srem("workers:active", workerId);
    await workerService.registerWorker(workerId);
  });

  afterEach(async () => {
    await redisClient.del(`worker:${workerId}`);
    await redisClient.srem("workers:active", workerId);
  });

  it("should refresh worker ttl", async () => {
    // Wait for TTL to drop slightly
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const ttlBefore = await redisClient.ttl(`worker:${workerId}`);

    await workerService.heartbeat(workerId);

    const ttlAfter = await redisClient.ttl(`worker:${workerId}`);

    expect(ttlAfter).toBeGreaterThan(ttlBefore);
  });

  it("should preserve worker data", async () => {
    const before = await redisClient.get(`worker:${workerId}`);

    await workerService.heartbeat(workerId);

    const after = await redisClient.get(`worker:${workerId}`);

    expect(after).toEqual(before);
  });

  it("should re-register missing worker", async () => {
    await redisClient.del(`worker:${workerId}`);

    await workerService.heartbeat(workerId);

    const worker = await redisClient.get(`worker:${workerId}`);
    expect(worker).not.toBeNull();

    const workers = await redisClient.smembers("workers:active");
    expect(workers).toContain(workerId);
  });

  it("should restore ttl close to max", async () => {
    // Wait for TTL to drop more significantly
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await workerService.heartbeat(workerId);

    const ttl = await redisClient.ttl(`worker:${workerId}`);

    expect(ttl).toBeGreaterThan(25);
  }, 10000);
});
