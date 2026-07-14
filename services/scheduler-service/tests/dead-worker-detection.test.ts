import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { monitorWorkers } from "../src/worker-monitor";
import { redisClient } from "../src/redis/redisClient";

// Mock RecoveryService so we can spy on it
const { recoverWorkerJobsMock } = vi.hoisted(() => ({
  recoverWorkerJobsMock: vi.fn().mockResolvedValue(1),
}));

vi.mock("../src/services/recovery.service", () => {
  return {
    RecoveryService: class {
      recoverWorkerJobs = recoverWorkerJobsMock;
    }
  };
});

describe("Dead Worker Detection", () => {
  const deadWorkerId = "dead-worker-1";
  const healthyWorkerId = "healthy-worker-2";

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Clear Redis sets
    await redisClient.del("workers:active");
    await redisClient.del(`worker:${deadWorkerId}`);
    await redisClient.del(`worker:${healthyWorkerId}`);

    // Register both workers as active
    await redisClient.sadd("workers:active", deadWorkerId, healthyWorkerId);

    // Provide a heartbeat for the healthy worker ONLY
    await redisClient.set(`worker:${healthyWorkerId}`, "alive", "EX", 10);
  });

  afterEach(async () => {
    await redisClient.del("workers:active");
    await redisClient.del(`worker:${deadWorkerId}`);
    await redisClient.del(`worker:${healthyWorkerId}`);
  });

  it("should incrementally track missing heartbeats and remove worker after threshold", async () => {
    // Round 1
    await monitorWorkers();
    expect(recoverWorkerJobsMock).not.toHaveBeenCalled();
    expect(await redisClient.sismember("workers:active", deadWorkerId)).toBe(1);

    // Round 2
    await monitorWorkers();
    expect(recoverWorkerJobsMock).not.toHaveBeenCalled();
    expect(await redisClient.sismember("workers:active", deadWorkerId)).toBe(1);

    // Round 3 (MISS_THRESHOLD is 3 in worker-monitor.ts)
    await monitorWorkers();
    
    // Recovery should have been triggered!
    expect(recoverWorkerJobsMock).toHaveBeenCalledTimes(1);
    expect(recoverWorkerJobsMock).toHaveBeenCalledWith(deadWorkerId);

    // Worker should be removed from active set
    expect(await redisClient.sismember("workers:active", deadWorkerId)).toBe(0);

    // Healthy worker should be completely unaffected
    expect(await redisClient.sismember("workers:active", healthyWorkerId)).toBe(1);
    
    // Round 4 (Make sure it doesn't try to recover again now that it's removed)
    await monitorWorkers();
    expect(recoverWorkerJobsMock).toHaveBeenCalledTimes(1);
  });
});
