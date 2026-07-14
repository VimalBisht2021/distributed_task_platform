import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "vitest";

import { WorkerService } from "../src/services/worker.service";
import { redisClient } from "../src/redis/redisClient";

describe("Worker Load Tracking", () => {
  const workerService = new WorkerService();

  const workerId = "load-worker";

  beforeEach(async () => {
    await redisClient.del(`worker:${workerId}`);
    await redisClient.srem(
      "workers:active",
      workerId,
    );

    await workerService.registerWorker(
      workerId,
    );
  });

  afterEach(async () => {
    await redisClient.del(`worker:${workerId}`);
    await redisClient.srem(
      "workers:active",
      workerId,
    );
  });

  it("should increment worker load", async () => {
    await workerService.incrementLoad(
      workerId,
    );

    const workerData =
      await redisClient.get(
        `worker:${workerId}`,
      );

    const worker = JSON.parse(
      workerData!,
    );

    expect(
      worker.currentLoad,
    ).toBe(1);
  });

  it("should track multiple loads", async () => {
    await workerService.incrementLoad(
      workerId,
    );

    await workerService.incrementLoad(
      workerId,
    );

    await workerService.incrementLoad(
      workerId,
    );

    const workerData =
      await redisClient.get(
        `worker:${workerId}`,
      );

    const worker = JSON.parse(
      workerData!,
    );

    expect(
      worker.currentLoad,
    ).toBe(3);
  });

  it("should decrement worker load", async () => {
    await workerService.incrementLoad(
      workerId,
    );

    await workerService.incrementLoad(
      workerId,
    );

    await workerService.decrementLoad(
      workerId,
    );

    const workerData =
      await redisClient.get(
        `worker:${workerId}`,
      );

    const worker = JSON.parse(
      workerData!,
    );

    expect(
      worker.currentLoad,
    ).toBe(1);
  });

  it("should never allow negative load", async () => {
    await workerService.decrementLoad(
      workerId,
    );

    await workerService.decrementLoad(
      workerId,
    );

    const workerData =
      await redisClient.get(
        `worker:${workerId}`,
      );

    const worker = JSON.parse(
      workerData!,
    );

    expect(
      worker.currentLoad,
    ).toBe(0);
  });

  it("should refresh ttl when load changes", async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, 3000),
    );

    const ttlBefore =
      await redisClient.ttl(
        `worker:${workerId}`,
      );

    await workerService.incrementLoad(
      workerId,
    );

    const ttlAfter =
      await redisClient.ttl(
        `worker:${workerId}`,
      );

    expect(ttlAfter).toBeGreaterThan(
      ttlBefore,
    );
  }, 10000); // Adding explicit timeout to match our previous heartbeat approach just in case!
});
