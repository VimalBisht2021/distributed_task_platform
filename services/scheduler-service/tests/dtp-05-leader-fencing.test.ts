import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LeaderService } from "../src/leader-election/leader.service";
import { redisClient } from "../src/redis/redisClient";
import { REDIS_KEYS } from "../src/redis/keys";

describe("DTP-05: Leader Election Fencing and Stale Leader Detection", () => {
  const leaderA = new LeaderService("scheduler-node-a");
  const leaderB = new LeaderService("scheduler-node-b");

  beforeEach(async () => {
    await redisClient.del(REDIS_KEYS.SCHEDULER_LEADER);
  });

  afterEach(async () => {
    await redisClient.del(REDIS_KEYS.SCHEDULER_LEADER);
  });

  it("should prevent a paused/expired leader from performing work when another node has taken leadership", async () => {
    // 1. Leader A acquires leadership
    const acquiredA = await leaderA.acquireLeadership();
    expect(acquiredA).toBe(true);
    expect(await leaderA.isLeader()).toBe(true);

    // 2. Leader A is paused, its lock expires, and Leader B takes over
    await redisClient.del(REDIS_KEYS.SCHEDULER_LEADER);
    const acquiredB = await leaderB.acquireLeadership();
    expect(acquiredB).toBe(true);

    // 3. Leader A wakes up and attempts to perform guarded work
    // Leader A must recognize it is no longer the leader
    expect(await leaderA.isLeader()).toBe(false);
    expect(await leaderA.assertLeader()).toBe(false);

    // 4. Leader A's renewal must be rejected
    const renewed = await leaderA.renewLeadership();
    expect(renewed).toBe(false);

    // Leader B remains the valid leader
    expect(await leaderB.isLeader()).toBe(true);
  });

  it("should safely execute work only when actively holding the valid leader lease", async () => {
    await leaderA.acquireLeadership();

    let executed = false;
    const result = await leaderA.executeIfLeader(async () => {
      executed = true;
      return "work-done";
    });

    expect(executed).toBe(true);
    expect(result).toBe("work-done");

    // Steal lock
    await leaderB.acquireLeadership(); // fails because key exists, so let's overwrite
    await redisClient.set(REDIS_KEYS.SCHEDULER_LEADER, "scheduler-node-b");

    let executedStale = false;
    const staleResult = await leaderA.executeIfLeader(async () => {
      executedStale = true;
      return "stale-work";
    });

    expect(executedStale).toBe(false);
    expect(staleResult).toBeNull();
  });
});
